import { spawn } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { EngineConfig } from '../config'
import { branchExists, currentBranch, openWorkRepo, readGit, type WorkRepo } from '../git/git'
import { writeFileAtomic } from '../store/json-file'

/**
 * Espace de travail du moteur (`ENGINE_WORKSPACE`) :
 *   repo/    clone du dépôt source, branche `draft` extraite, `main` en simple référence, `npm ci` une fois ;
 *   data/    magasin JSON (demandes, modifications, publications) + workspace.json (d'où vient le clone) ;
 *   claude/  CLAUDE_CONFIG_DIR dédié ;  shots/  captures avant/après.
 *
 * `setupWorkspace` est idempotent (ne reclone pas, ne réinstalle pas) ; `syncWorkspace` avance main et draft sur la
 * source quand rien n'attend (ni demande, ni modification, ni commit validé non publié). Aucune écriture dans le dépôt
 * source ; les secrets passent de la configuration au `.env.local` du clone sans jamais être affichés.
 */

export type WorkspaceMeta = {
  sourceRepo: string
  sourceBranch: string
  clonedAt: string
  /** Commit de la source au clonage, puis à chaque synchronisation. */
  baseCommit: string
  syncedAt?: string
}

export type WorkspaceDeps = {
  /** `npm ci` (ou `npm install` sans package-lock) dans le clone. Injecté par les tests. */
  install?: (repoDir: string) => Promise<void>
  log?: (line: string) => void
  /** Le moteur tourne-t-il ? (sync refusée pendant qu'il travaille). */
  engineRunning?: () => Promise<boolean>
  /** Quelque chose attend-il dans le magasin du moteur ? (demande, modification, publication). */
  pendingWork?: () => Promise<string | null>
}

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

export const META_FILE = 'workspace.json'
export const PID_FILE = 'engine.pid'
/** Variables écrites dans le `.env.local` du clone (aperçu du brouillon). */
export const PREVIEW_ENV_KEYS = [
  'NEXT_PUBLIC_SANITY_PROJECT_ID',
  'NEXT_PUBLIC_SANITY_DATASET',
  'NEXT_PUBLIC_SANITY_API_VERSION',
  'SANITY_API_READ_TOKEN',
  'KZ_EDITOR_PREVIEW',
  'ENGINE_PREVIEW_SECRET',
  'ADMIN_ORIGIN',
] as const

const real = (dir: string) => {
  try {
    return realpathSync(dir)
  } catch {
    return path.resolve(dir)
  }
}

/** Valeur dotenv sûre (une ligne ; entre apostrophes si elle contient autre chose que des caractères simples). */
export function dotenvValue(value: string): string {
  if (/[\r\n]/.test(value)) throw new WorkspaceError('An environment value cannot span several lines.')
  if (/^[A-Za-z0-9_.:/@+=-]*$/.test(value)) return value
  if (!value.includes("'")) return `'${value}'`
  if (!value.includes('"') && !value.includes('\\') && !value.includes('$')) return `"${value}"`
  throw new WorkspaceError('An environment value contains both kinds of quotes: it cannot be written safely.')
}

/** Contenu du `.env.local` de l'aperçu (valeurs de la configuration du moteur ; jamais affiché). */
export function previewEnvFile(config: EngineConfig): string {
  const values: Record<(typeof PREVIEW_ENV_KEYS)[number], string> = {
    NEXT_PUBLIC_SANITY_PROJECT_ID: config.sanity.projectId,
    NEXT_PUBLIC_SANITY_DATASET: config.sanity.dataset,
    NEXT_PUBLIC_SANITY_API_VERSION: config.sanity.apiVersion,
    SANITY_API_READ_TOKEN: config.sanity.readToken,
    KZ_EDITOR_PREVIEW: '1',
    ENGINE_PREVIEW_SECRET: config.preview.secret,
    ADMIN_ORIGIN: config.preview.adminOrigin,
  }
  return [
    '# Written by `npm run engine:setup`: draft preview of the AI editor. Never commit this file.',
    ...PREVIEW_ENV_KEYS.map((key) => `${key}=${dotenvValue(values[key])}`),
    '',
  ].join('\n')
}

async function ensureExcluded(repoDir: string, patterns: string[]) {
  const file = path.join(repoDir, '.git', 'info', 'exclude')
  const current = await readFile(file, 'utf8').catch(() => '')
  const missing = patterns.filter((pattern) => !current.split('\n').includes(pattern))
  if (!missing.length) return
  await mkdir(path.dirname(file), { recursive: true })
  await appendFile(file, `${current && !current.endsWith('\n') ? '\n' : ''}# Kuartz AI engine\n${missing.join('\n')}\n`)
}

export async function readMeta(config: EngineConfig): Promise<WorkspaceMeta | null> {
  try {
    return JSON.parse(await readFile(path.join(config.paths.data, META_FILE), 'utf8')) as WorkspaceMeta
  } catch {
    return null
  }
}

const writeMeta = (config: EngineConfig, meta: WorkspaceMeta) =>
  writeFileAtomic(path.join(config.paths.data, META_FILE), `${JSON.stringify(meta, null, 2)}\n`)

/** Installation des dépendances du clone : `npm ci` s'il y a un package-lock, sinon `npm install`. */
export function npmInstall(repoDir: string): Promise<void> {
  const args = existsSync(path.join(repoDir, 'package-lock.json')) ? ['ci', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund']
  return new Promise((resolve, reject) => {
    // Environnement du moteur SANS ses secrets : npm n'en a pas besoin.
    const env: Record<string, string | undefined> = {}
    for (const name of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'USER', 'npm_config_cache']) if (process.env[name]) env[name] = process.env[name]
    const child = spawn('npm', args, { cwd: repoDir, env: env as NodeJS.ProcessEnv, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new WorkspaceError(`npm ${args[0]} failed (exit code ${code}).`))))
  })
}

/** Branche source : ENGINE_SOURCE_BRANCH, sinon la branche courante du dépôt source. */
export async function sourceBranchOf(config: EngineConfig): Promise<string> {
  if (config.sourceBranch) return config.sourceBranch
  const branch = await currentBranch(config.paths.sourceRepo).catch(() => {
    throw new WorkspaceError(`${config.paths.sourceRepo} is not a git repository (ENGINE_SOURCE_REPO).`)
  })
  if (branch === 'HEAD') throw new WorkspaceError('The source repository is in detached HEAD: set ENGINE_SOURCE_BRANCH.')
  return branch
}

/** Nombre de changements non commités du dépôt source (ils n'iront PAS dans le clone). */
export async function sourceDirtyCount(sourceRepo: string): Promise<number> {
  const out = await readGit(sourceRepo, ['status', '--porcelain=v1', '--untracked-files=normal'])
  return out ? out.split('\n').filter(Boolean).length : 0
}

/**
 * Met en place l'espace de travail (idempotent). Renvoie le clone ouvert. Étapes : dossiers ; clone de la source (branche
 * choisie) s'il manque ; branches main et draft, draft extraite ; `.env.local` de l'aperçu (0600, exclu de git) ;
 * dépendances installées une fois ; workspace.json.
 */
export async function setupWorkspace(config: EngineConfig, deps: WorkspaceDeps = {}): Promise<WorkRepo> {
  const log = deps.log ?? ((line: string) => console.log(line))
  const { repo, data, claude, shots, workspace, sourceRepo } = config.paths
  for (const dir of [workspace, data, claude, shots]) await mkdir(dir, { recursive: true })

  const branch = await sourceBranchOf(config)
  const dirty = await sourceDirtyCount(sourceRepo).catch(() => 0)
  if (dirty) {
    log(`⚠ The source repository has ${dirty} uncommitted change(s): they are NOT part of the engine's clone (only commits are cloned).`)
  }

  let meta = await readMeta(config)
  if (!existsSync(repo)) {
    if (!(await branchExists(sourceRepo, branch))) throw new WorkspaceError(`Branch "${branch}" does not exist in the source repository.`)
    log(`Cloning ${sourceRepo} (branch ${branch}) into ${repo}…`)
    await readGit(workspace, ['clone', '--quiet', '--no-hardlinks', '--branch', branch, '--', sourceRepo, repo], { timeoutMs: 600_000 })
    const work = await openWorkRepo(repo, workspace)
    // draft d'abord (on ne peut pas forcer la branche extraite), puis main au même commit.
    await work.run(['checkout', '--quiet', '-B', 'draft'])
    await work.run(['branch', '--force', 'main', 'HEAD'])
    if (branch !== 'main' && branch !== 'draft') await work.run(['branch', '--quiet', '-D', branch]).catch(() => {})
    meta = { sourceRepo, sourceBranch: branch, clonedAt: new Date().toISOString(), baseCommit: await work.head() }
    await writeMeta(config, meta)
  }

  const work = await openWorkRepo(repo, workspace)
  const origin = await work.run(['remote', 'get-url', 'origin']).catch(() => '')
  if (!origin || real(origin) !== real(sourceRepo)) {
    throw new WorkspaceError(`${repo} is not a clone of ENGINE_SOURCE_REPO: move it away, then run the setup again.`)
  }
  if (meta && meta.sourceBranch !== branch) {
    throw new WorkspaceError(
      `The clone follows branch "${meta.sourceBranch}", not "${branch}": set ENGINE_SOURCE_BRANCH=${meta.sourceBranch} or recreate the workspace.`,
    )
  }
  if (!(await branchExists(repo, 'draft'))) await work.run(['branch', 'draft', 'HEAD'])
  if (!(await branchExists(repo, 'main'))) await work.run(['branch', 'main', 'draft'])
  if ((await work.branch()) !== 'draft') {
    if (!(await work.isClean())) throw new WorkspaceError('The clone has uncommitted changes and is not on draft: fix it by hand.')
    await work.run(['checkout', '--quiet', 'draft'])
  }
  if (!meta) {
    meta = { sourceRepo, sourceBranch: branch, clonedAt: new Date().toISOString(), baseCommit: await work.run(['rev-parse', 'main']) }
    await writeMeta(config, meta)
  }

  // Identité locale du clone (committer robot) et fichiers jamais suivis.
  await work.run(['config', 'user.name', 'Kuartz AI editor'])
  await work.run(['config', 'user.email', 'ai-editor@kuartz.invalid'])
  await ensureExcluded(repo, ['.env.local', '.env*.local', 'node_modules/', '.next/'])

  await writeFileAtomic(path.join(repo, '.env.local'), previewEnvFile(config))
  log('Preview environment written to repo/.env.local (values not shown).')

  if (!existsSync(path.join(repo, 'node_modules'))) {
    log('Installing dependencies in the clone (once)…')
    await (deps.install ?? npmInstall)(repo)
  }
  log(`Workspace ready: ${workspace} (draft checked out, main = ${(await work.run(['rev-parse', '--short', 'main'])) || '?'}).`)
  return work
}

/**
 * Avance `main` et `draft` sur la branche source (avance rapide seulement) quand rien n'attend : pas de demande ni de
 * modification (magasin), draft = main (aucun commit validé non publié), copie de travail propre. Réinstalle les
 * dépendances si package-lock.json a changé.
 */
export async function syncWorkspace(config: EngineConfig, deps: WorkspaceDeps = {}): Promise<{ from: string; to: string; changed: boolean }> {
  const log = deps.log ?? ((line: string) => console.log(line))
  if (await deps.engineRunning?.()) throw new WorkspaceError('The engine is running: stop it before syncing the workspace.')
  const pending = await deps.pendingWork?.()
  if (pending) throw new WorkspaceError(`Cannot sync: ${pending}`)
  const meta = await readMeta(config)
  if (!meta) throw new WorkspaceError('The workspace is not set up: run `npm run engine:setup` first.')
  const work = await openWorkRepo(config.paths.repo, config.paths.workspace)
  if ((await work.branch()) !== 'draft') throw new WorkspaceError('The clone is not on the draft branch.')
  if (!(await work.isClean())) throw new WorkspaceError('The clone has uncommitted changes.')
  const main = await work.run(['rev-parse', 'main'])
  const draft = await work.head()
  if (main !== draft) throw new WorkspaceError('Validated AI changes are waiting to be published (draft is ahead of main).')

  const branch = meta.sourceBranch
  await work.run(['fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { timeoutMs: 600_000 })
  const target = await work.run(['rev-parse', `refs/remotes/origin/${branch}`])
  if (target === draft) {
    log('Already up to date.')
    return { from: draft, to: target, changed: false }
  }
  if (!(await work.isAncestor(draft, target))) {
    throw new WorkspaceError(`The source branch "${branch}" has diverged from the engine's main: a developer must reconcile them.`)
  }
  const lockBefore = await work.run(['rev-parse', 'HEAD:package-lock.json']).catch(() => '')
  await work.run(['merge', '--quiet', '--ff-only', target])
  await work.run(['branch', '--force', 'main', 'draft'])
  const lockAfter = await work.run(['rev-parse', 'HEAD:package-lock.json']).catch(() => '')
  if (lockBefore !== lockAfter) {
    log('package-lock.json changed: reinstalling dependencies…')
    await (deps.install ?? npmInstall)(config.paths.repo)
  }
  await writeMeta(config, { ...meta, baseCommit: target, syncedAt: new Date().toISOString() })
  log(`main and draft moved from ${draft.slice(0, 7)} to ${target.slice(0, 7)}.`)
  return { from: draft, to: target, changed: true }
}

/**
 * Vérifie au démarrage du moteur que l'espace de travail est prêt (clone, branche draft extraite) : sinon un message
 * clair (« run npm run engine:setup »). Ne clone ni n'installe rien.
 */
export async function checkWorkspace(config: EngineConfig): Promise<WorkRepo> {
  if (!existsSync(config.paths.repo)) throw new WorkspaceError(`No work repository in ${config.paths.workspace}: run \`npm run engine:setup\` first.`)
  const work = await openWorkRepo(config.paths.repo, config.paths.workspace)
  if (!(await branchExists(work.dir, 'main')) || !(await branchExists(work.dir, 'draft'))) {
    throw new WorkspaceError('The work repository has no main/draft branches: run `npm run engine:setup` again.')
  }
  if ((await work.branch()) !== 'draft') throw new WorkspaceError('The work repository is not on the draft branch: run `npm run engine:setup` again.')
  for (const dir of [config.paths.data, config.paths.claude, config.paths.shots]) await mkdir(dir, { recursive: true })
  return work
}

/** Le processus dont le pid est écrit dans data/engine.pid tourne-t-il encore ? */
export async function engineRunning(config: EngineConfig): Promise<boolean> {
  const pid = Number((await readFile(path.join(config.paths.data, PID_FILE), 'utf8').catch(() => '')).trim())
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
