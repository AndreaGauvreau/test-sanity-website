import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { ChangedFile } from '../guards/types'

/**
 * Git du moteur, porté de `batterie-tests:cms/src/editor/git.ts` (POC) : `status -z`, versions HEAD / copie de travail
 * des fichiers, commit au nom du client (--author) avec un committer robot, retour arrière, réunion des commits d'une
 * modification en un seul à la validation.
 *
 * Toute opération qui ÉCRIT (reset, clean, commit, checkout, branch) passe par un `WorkRepo`, obtenu par `openWorkRepo`
 * qui vérifie que le dossier est EXACTEMENT `<ENGINE_WORKSPACE>/repo` et la racine d'un dépôt git : jamais le dépôt du
 * développeur, jamais un chemin vide (piège 5 du POC). Les lectures seules (`readGit`) acceptent un autre dépôt (source).
 */

const exec = promisify(execFile)

/** Committer des commits du moteur ; l'auteur réel (le client) passe en --author. */
export const BOT_NAME = 'Kuartz AI editor'
export const BOT_EMAIL = 'ai-editor@kuartz.invalid'
const BOT = ['-c', `user.name=${BOT_NAME}`, '-c', `user.email=${BOT_EMAIL}`]

// Environnement de git : jamais d'invite (identifiants, éditeur), jamais les réglages globaux qui changeraient la sortie.
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_EDITOR: 'true',
  GIT_PAGER: 'cat',
  LC_ALL: 'C',
}

export class GitError extends Error {
  constructor(
    message: string,
    readonly stderr = '',
    readonly stdout = '',
  ) {
    super(message)
    this.name = 'GitError'
  }
}

async function gitRaw(cwd: string, args: string[], options: { timeoutMs?: number } = {}): Promise<string> {
  try {
    const { stdout } = await exec('git', [...BOT, ...args], {
      cwd,
      env: GIT_ENV,
      maxBuffer: 32 * 1024 * 1024,
      timeout: options.timeoutMs ?? 120_000,
    })
    return stdout
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? '').trim()
    const stdout = String((error as { stdout?: string }).stdout ?? '')
    throw new GitError(`git ${args[0]} failed${stderr ? `: ${stderr.split('\n')[0]}` : ''}`, stderr, stdout)
  }
}

/** Commande git (sortie sans blancs de bord). Lecture seule par convention : les écritures passent par WorkRepo. */
export const readGit = async (cwd: string, args: string[], options?: { timeoutMs?: number }) =>
  (await gitRaw(cwd, args, options)).trim()

/** Auteur git d'un utilisateur de l'admin : « Nom <email> », nettoyé (pas de chevrons ni de retour à la ligne). */
export function gitAuthor(user: { name: string; email: string; id?: string }): string {
  const name = user.name.replace(/[<>\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Admin user'
  const email = /^[^\s<>@]+@[^\s<>@]+$/.test(user.email) ? user.email : `${(user.id ?? 'user').replace(/[^\w.-]/g, '') || 'user'}@users.kuartz.invalid`
  return `${name} <${email}>`
}

/** Fichiers modifiés ou nouveaux (hors ignorés), chemins relatifs au dépôt. */
export async function changedFiles(cwd: string): Promise<string[]> {
  // -z : entrées séparées par NUL, chemins jamais entre guillemets. Surtout pas de trim : la première entrée commence
  // souvent par une espace (« ␠M chemin »).
  const entries = (await gitRaw(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).split('\0')
  const files: string[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.length < 4) continue
    files.push(entry.slice(3))
    // Renommage ou copie : l'entrée suivante est l'ancien chemin.
    if (entry[0] === 'R' || entry[0] === 'C') i++
  }
  return files
}

/** Un fichier modifié, ENTIER : au dernier commit (null s'il est nouveau) et dans la copie de travail (null s'il est supprimé). */
export async function fileVersions(cwd: string, file: string): Promise<ChangedFile> {
  // Pas de trim : le contenu est comparé octet par octet.
  const before = await gitRaw(cwd, ['show', `HEAD:${file}`]).catch(() => null)
  const after = await readFile(path.join(cwd, file), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  return { file, before, after }
}

export const isClean = async (cwd: string) => (await changedFiles(cwd)).length === 0
export const head = (cwd: string) => readGit(cwd, ['rev-parse', 'HEAD'])
export const currentBranch = (cwd: string) => readGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])

/** Le commit `ancestor` est-il un ancêtre de `ref` (ou le même) ? */
export async function isAncestor(cwd: string, ancestor: string, ref: string): Promise<boolean> {
  try {
    await gitRaw(cwd, ['merge-base', '--is-ancestor', ancestor, ref])
    return true
  } catch {
    return false
  }
}

/** Nombre de commits de `ref` absents de `base` (`base..ref`). */
export async function commitsAhead(cwd: string, base: string, ref: string): Promise<number> {
  return Number(await readGit(cwd, ['rev-list', '--count', `${base}..${ref}`])) || 0
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await gitRaw(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
    return true
  } catch {
    return false
  }
}

/** Fichiers touchés par un commit (pour la liste « design » de la publication). */
export async function commitFiles(cwd: string, sha: string): Promise<string[]> {
  const out = await gitRaw(cwd, ['show', '--no-color', '--format=', '--name-only', '-z', sha])
  return out.split('\0').filter(Boolean)
}

/** Diff d'un commit (Kuartz : « ‹/› Diff »). */
export const showCommitDiff = (cwd: string, sha: string) => readGit(cwd, ['show', '--no-color', '--format=', '--unified=3', sha])

/** Diff de la copie de travail, fichiers non suivis compris (sans rien indexer). */
export async function workingDiff(cwd: string): Promise<string> {
  const tracked = await readGit(cwd, ['diff', '--no-color', '--unified=3', 'HEAD'])
  const untracked = (await gitRaw(cwd, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean)
  const added: string[] = []
  for (const file of untracked) {
    // diff --no-index sort avec le code 1 quand les fichiers diffèrent : la sortie est portée par l'erreur.
    const text = await gitRaw(cwd, ['diff', '--no-color', '--no-index', '--', '/dev/null', file]).catch((error: GitError) => error.stdout)
    if (text) added.push(text)
  }
  return [tracked, ...added].filter(Boolean).join('\n')
}

// ─── Dépôt de travail (écritures) ────────────────────────────────────────────

/** Le clone de travail du moteur : seul dépôt où il écrit. */
export type WorkRepo = {
  readonly dir: string
  changedFiles(): Promise<string[]>
  fileVersions(file: string): Promise<ChangedFile>
  changes(): Promise<ChangedFile[]>
  isClean(): Promise<boolean>
  head(): Promise<string>
  branch(): Promise<string>
  isAncestor(ancestor: string, ref: string): Promise<boolean>
  commitsAhead(base: string, ref: string): Promise<number>
  commitFiles(sha: string): Promise<string[]>
  showCommitDiff(sha: string): Promise<string>
  workingDiff(): Promise<string>
  /** `git add --all` + commit au nom de `author` (« Nom <email> »), committer robot ; renvoie le sha. */
  commitAll(message: string, author: string): Promise<string>
  /** Remet la copie de travail EXACTEMENT sur le dernier commit (reset --hard HEAD + clean -fd). */
  discardWorkingChanges(): Promise<void>
  /** `reset --hard <ref>` (retour arrière d'une modification). */
  resetHard(ref: string): Promise<void>
  /**
   * Réunit les commits `base..HEAD` en UN commit (reset --soft base + commit) au nom de `author`. La copie de travail doit
   * être propre. Renvoie le sha du nouveau commit, ou null s'il n'y avait rien entre base et HEAD.
   */
  squashSince(base: string, message: string, author: string): Promise<string | null>
  /** Commande git brute dans le clone (réservée aux modules du moteur : engine-publish, workspace). */
  run(args: string[], options?: { timeoutMs?: number }): Promise<string>
}

/** Refus d'agir hors du clone de travail. */
export class WorkRepoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkRepoError'
  }
}

const real = (dir: string) => {
  try {
    return realpathSync(dir)
  } catch {
    return path.resolve(dir)
  }
}

/**
 * Chemin attendu du clone de travail : `<workspace>/repo`. Lève si `dir` n'est pas exactement ce dossier (chemin vide,
 * relatif, dépôt du développeur…).
 */
export function assertWorkRepoPath(dir: string, workspace: string): string {
  if (!workspace || !path.isAbsolute(workspace)) throw new WorkRepoError('ENGINE_WORKSPACE must be an absolute path.')
  if (!dir || !path.isAbsolute(dir)) throw new WorkRepoError('The work repository path must be absolute.')
  const expected = path.join(path.resolve(workspace), 'repo')
  if (path.resolve(dir) !== expected) {
    throw new WorkRepoError(`Refusing to write outside the engine's work repository (${expected}).`)
  }
  return expected
}

/**
 * Ouvre le clone de travail après vérification : chemin exactement `<workspace>/repo` ET racine d'un dépôt git (le
 * `--show-toplevel` de git, résolu, est ce dossier : pas un sous-dossier d'un autre dépôt).
 */
export async function openWorkRepo(dir: string, workspace: string): Promise<WorkRepo> {
  const expected = assertWorkRepoPath(dir, workspace)
  let top: string
  try {
    top = await readGit(expected, ['rev-parse', '--show-toplevel'])
  } catch {
    throw new WorkRepoError(`${expected} is not a git repository: run \`npm run engine:setup\` first.`)
  }
  if (real(top) !== real(expected)) throw new WorkRepoError(`${expected} is not the root of its git repository.`)
  return workRepo(expected)
}

function workRepo(dir: string): WorkRepo {
  const run = (args: string[], options?: { timeoutMs?: number }) => readGit(dir, args, options)
  const repo: WorkRepo = {
    dir,
    changedFiles: () => changedFiles(dir),
    fileVersions: (file) => fileVersions(dir, file),
    changes: async () => Promise.all((await changedFiles(dir)).map((file) => fileVersions(dir, file))),
    isClean: () => isClean(dir),
    head: () => head(dir),
    branch: () => currentBranch(dir),
    isAncestor: (ancestor, ref) => isAncestor(dir, ancestor, ref),
    commitsAhead: (base, ref) => commitsAhead(dir, base, ref),
    commitFiles: (sha) => commitFiles(dir, sha),
    showCommitDiff: (sha) => showCommitDiff(dir, sha),
    workingDiff: () => workingDiff(dir),
    async commitAll(message, author) {
      await run(['add', '--all'])
      await run(['commit', '--quiet', '--no-verify', '--no-gpg-sign', `--author=${author}`, '-m', message])
      return head(dir)
    },
    async discardWorkingChanges() {
      await run(['reset', '--quiet', '--hard', 'HEAD'])
      await run(['clean', '--quiet', '-fd'])
    },
    async resetHard(ref) {
      if (!/^[\w./^~-]{1,200}$/.test(ref) || ref.startsWith('-')) throw new WorkRepoError('Invalid git reference.')
      await run(['reset', '--quiet', '--hard', ref])
    },
    async squashSince(base, message, author) {
      if (!/^[0-9a-f]{7,64}$/.test(base)) throw new WorkRepoError('Invalid base commit.')
      if (!(await isClean(dir))) throw new WorkRepoError('The work repository has uncommitted changes.')
      const current = await head(dir)
      if (current === base) return null
      if (!(await isAncestor(dir, base, current))) throw new WorkRepoError('The base commit is not an ancestor of HEAD.')
      await run(['reset', '--quiet', '--soft', base])
      try {
        await run(['commit', '--quiet', '--no-verify', '--no-gpg-sign', '--allow-empty', `--author=${author}`, '-m', message])
      } catch (error) {
        // Rien ne doit se perdre : on remet la branche où elle était.
        await run(['reset', '--quiet', '--soft', current]).catch(() => {})
        throw error
      }
      return head(dir)
    },
    run,
  }
  return Object.freeze(repo)
}
