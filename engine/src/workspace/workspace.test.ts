import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'vitest'
import { readEngineConfig, type EngineConfig } from '../config'
import { pendingWork } from './setup'
import { TEST_IDENTITY } from '../jobs/testing'
import { checkWorkspace, dotenvValue, previewEnvFile, readMeta, setupWorkspace, syncWorkspace, WorkspaceError } from './workspace'

/** Mise en place de l'espace de travail sur des dépôts git TEMPORAIRES (jamais le vrai dépôt source). */

let root: string
let source: string
let config: EngineConfig
let installs: string[]
let lines: string[]

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], { cwd, encoding: 'utf8' }).trim()

const configFor = (extra: Record<string, string> = {}) =>
  readEngineConfig(
    {
      ENGINE_PORT: '4043',
      ENGINE_PREVIEW_PORT: '4042',
      ENGINE_SECRET: 'engine-secret-0123456789',
      ENGINE_PREVIEW_SECRET: "preview-secret-with-'quote'#",
      ENGINE_IDENTITY_PUBLIC_KEY: TEST_IDENTITY.publicKey,
      ADMIN_ORIGIN: 'http://127.0.0.1:4040',
      ENGINE_WORKSPACE: path.join(root, 'site-engine'),
      ENGINE_SOURCE_REPO: source,
      NEXT_PUBLIC_SANITY_PROJECT_ID: 'abc123',
      NEXT_PUBLIC_SANITY_DATASET: 'development',
      SANITY_API_READ_TOKEN: 'read-token-value',
      ...extra,
    },
    { home: '/nonexistent-home' },
  )

const deps = () => ({ install: async (dir: string) => void installs.push(dir), log: (line: string) => void lines.push(line) })

beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'kz-ws-')))
  source = path.join(root, 'site')
  await mkdir(source)
  await writeFile(path.join(source, 'package.json'), '{"name":"site"}\n')
  await writeFile(path.join(source, '.gitignore'), 'node_modules/\n')
  git(source, 'init', '--quiet', '--initial-branch=dashboard')
  git(source, 'add', '--all')
  git(source, 'commit', '--quiet', '-m', 'initial')
  config = configFor()
  installs = []
  lines = []
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('setupWorkspace', () => {
  it('clone la branche courante, crée main et draft (draft extraite), écrit .env.local, installe une fois', async () => {
    await writeFile(path.join(source, 'uncommitted.txt'), 'x')
    const repo = await setupWorkspace(config, deps())
    const dir = config.paths.repo
    assert.equal(repo.dir, dir)
    assert.equal(await repo.branch(), 'draft')
    assert.equal(git(dir, 'rev-parse', 'main'), git(source, 'rev-parse', 'HEAD'))
    assert.equal(git(dir, 'rev-parse', 'draft'), git(source, 'rev-parse', 'HEAD'))
    assert.equal(git(dir, 'branch', '--format=%(refname:short)').split('\n').sort().join(','), 'draft,main')
    assert.equal(existsSync(path.join(dir, 'uncommitted.txt')), false, 'seuls les commits sont clonés')
    assert.ok(lines.some((line) => /1 uncommitted change/.test(line)))
    for (const sub of ['data', 'claude', 'shots']) assert.ok(existsSync(path.join(config.paths.workspace, sub)))
    // .env.local de l'aperçu : complet, 0600, exclu de git, jamais affiché.
    const env = await readFile(path.join(dir, '.env.local'), 'utf8')
    assert.match(env, /^KZ_EDITOR_PREVIEW=1$/m)
    assert.match(env, /^SANITY_API_READ_TOKEN=read-token-value$/m)
    assert.match(env, /^ENGINE_PREVIEW_SECRET="preview-secret-with-'quote'#"$/m)
    assert.match(env, /^ADMIN_ORIGIN=http:\/\/127\.0\.0\.1:4040$/m)
    assert.match(env, /^REACT_EDITOR=none$/m, 'SEC-06 : éditeur inerte même pour un next dev lancé à la main')
    assert.doesNotMatch(env, /ENGINE_SECRET=engine|SANITY_API_WRITE_TOKEN|ANTHROPIC/)
    assert.equal((await stat(path.join(dir, '.env.local'))).mode & 0o777, 0o600)
    assert.equal(await repo.isClean(), true)
    assert.ok(lines.every((line) => !line.includes('read-token-value') && !line.includes('preview-secret')))
    assert.deepEqual(installs, [dir])
    assert.equal((await readMeta(config))?.sourceBranch, 'dashboard')
    assert.equal(execFileSync('git', ['config', '--local', 'user.name'], { cwd: dir, encoding: 'utf8' }).trim(), 'Kuartz AI editor')

    // Idempotent : ni nouveau clone, ni nouvelle installation (node_modules présent).
    await mkdir(path.join(dir, 'node_modules'))
    const head = await repo.head()
    await setupWorkspace(config, deps())
    assert.deepEqual(installs, [dir])
    assert.equal(await repo.head(), head)
    await checkWorkspace(config)
  })

  it('ENGINE_SOURCE_BRANCH choisit la branche ; branche absente refusée', async () => {
    git(source, 'checkout', '--quiet', '-b', 'feature')
    await writeFile(path.join(source, 'f.txt'), 'f')
    git(source, 'add', '--all')
    git(source, 'commit', '--quiet', '-m', 'feature')
    git(source, 'checkout', '--quiet', 'dashboard')
    const repo = await setupWorkspace(configFor({ ENGINE_SOURCE_BRANCH: 'feature' }), deps())
    assert.equal(existsSync(path.join(repo.dir, 'f.txt')), true)
    await rm(path.join(root, 'site-engine'), { recursive: true, force: true })
    await assert.rejects(setupWorkspace(configFor({ ENGINE_SOURCE_BRANCH: 'nope' }), deps()), /does not exist/)
  })

  it('refuse un dossier repo/ qui n’est pas un clone de la source', async () => {
    await mkdir(config.paths.repo, { recursive: true })
    git(config.paths.repo, 'init', '--quiet')
    await assert.rejects(setupWorkspace(config, deps()), (error: unknown) => error instanceof WorkspaceError && /not a clone/.test(error.message))
  })

  it('checkWorkspace : message clair tant que la mise en place n’est pas faite', async () => {
    await assert.rejects(checkWorkspace(config), /engine:setup/)
  })
})

describe('syncWorkspace', () => {
  it('avance main et draft sur la source quand rien n’attend', async () => {
    const repo = await setupWorkspace(config, deps())
    await writeFile(path.join(source, 'new.txt'), 'n')
    git(source, 'add', '--all')
    git(source, 'commit', '--quiet', '-m', 'new')
    const result = await syncWorkspace(config, deps())
    assert.equal(result.changed, true)
    assert.equal(await repo.head(), git(source, 'rev-parse', 'HEAD'))
    assert.equal(git(repo.dir, 'rev-parse', 'main'), git(source, 'rev-parse', 'HEAD'))
    assert.equal((await syncWorkspace(config, deps())).changed, false)
    assert.deepEqual(installs, [repo.dir], 'package-lock inchangé : pas de réinstallation')
  })

  it('refuse : moteur lancé, travail en attente, draft devant main, source divergente', async () => {
    const repo = await setupWorkspace(config, deps())
    await assert.rejects(syncWorkspace(config, { ...deps(), engineRunning: async () => true }), /engine is running/)
    await assert.rejects(syncWorkspace(config, { ...deps(), pendingWork: async () => 'an AI change is waiting.' }), /waiting/)
    assert.equal(await pendingWork(config), null)
    await writeFile(path.join(repo.dir, 'x.css'), 'x')
    await repo.commitAll('ai change', 'A <a@b.c>')
    await assert.rejects(syncWorkspace(config, deps()), /draft is ahead of main/)
    await repo.resetHard('main')
    git(repo.dir, 'commit', '--quiet', '--allow-empty', '-m', 'local only')
    git(repo.dir, 'branch', '--force', 'main', 'draft')
    await writeFile(path.join(source, 'other.txt'), 'o')
    git(source, 'add', '--all')
    git(source, 'commit', '--quiet', '-m', 'other')
    await assert.rejects(syncWorkspace(config, deps()), /diverged/)
  })
})

describe('.env.local de l’aperçu', () => {
  it('valeurs sur une ligne, entre guillemets si besoin', () => {
    assert.equal(dotenvValue('abc-123'), 'abc-123')
    assert.equal(dotenvValue('a b#c'), "'a b#c'")
    assert.equal(dotenvValue("it's"), '"it\'s"')
    assert.throws(() => dotenvValue('a\nb'), WorkspaceError)
    assert.throws(() => dotenvValue(`'"`), WorkspaceError)
    assert.equal(previewEnvFile(config).split('\n').filter((line) => /^[A-Z_]+=/.test(line)).length, 8)
  })
})
