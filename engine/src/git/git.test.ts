import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'vitest'
import { assertWorkRepoPath, changedFiles, fileVersions, gitAuthor, openWorkRepo, workingDiff, WorkRepoError, type WorkRepo } from './git'

/** Git du moteur sur de VRAIS dépôts temporaires (portés de git.test.ts du POC, plus la garde du clone de travail). */

let workspace: string
let dir: string
let repo: WorkRepo

const sh = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd: dir, encoding: 'utf8' }).trim()

beforeEach(async () => {
  workspace = await realpath(await mkdtemp(path.join(os.tmpdir(), 'kz-git-')))
  dir = path.join(workspace, 'repo')
  await mkdir(dir)
  await writeFile(path.join(dir, 'a.css'), '.a {\n  color: var(--color-ink);\n}\n')
  sh('init', '--quiet', '--initial-branch=draft')
  sh('add', '--all')
  sh('commit', '--quiet', '-m', 'initial')
  sh('branch', 'main')
  repo = await openWorkRepo(dir, workspace)
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('lectures', () => {
  it('fileVersions : fichier du dernier commit et de la copie de travail, sans les retoucher', async () => {
    await writeFile(path.join(dir, 'a.css'), '.a {\n  color: var(--color-rose);\n}\n')
    assert.deepEqual(await fileVersions(dir, 'a.css'), {
      file: 'a.css',
      before: '.a {\n  color: var(--color-ink);\n}\n',
      after: '.a {\n  color: var(--color-rose);\n}\n',
    })
  })

  it('null avant pour un fichier nouveau, null après pour un fichier supprimé', async () => {
    await writeFile(path.join(dir, 'b.css'), '.b {}\n')
    assert.deepEqual(await fileVersions(dir, 'b.css'), { file: 'b.css', before: null, after: '.b {}\n' })
    await rm(path.join(dir, 'a.css'))
    assert.deepEqual(await fileVersions(dir, 'a.css'), { file: 'a.css', before: '.a {\n  color: var(--color-ink);\n}\n', after: null })
  })

  it('status -z : chemins avec espaces, guillemets et accents, fichiers non suivis dans un dossier', async () => {
    await mkdir(path.join(dir, 'd ir'))
    await writeFile(path.join(dir, 'd ir', 'é "x".css'), 'x')
    await writeFile(path.join(dir, 'a.css'), 'changed')
    assert.deepEqual((await changedFiles(dir)).sort(), ['a.css', 'd ir/é "x".css'])
    assert.deepEqual((await repo.changes()).map((change) => change.file).sort(), ['a.css', 'd ir/é "x".css'])
  })

  it('workingDiff : fichiers suivis et non suivis, sans rien indexer', async () => {
    await writeFile(path.join(dir, 'a.css'), '.a {}\n')
    await writeFile(path.join(dir, 'new.css'), '.n {}\n')
    const diff = await workingDiff(dir)
    assert.match(diff, /-  color: var\(--color-ink\);/)
    assert.match(diff, /\+\.n \{\}/)
    assert.equal(sh('diff', '--cached', '--name-only'), '')
  })
})

describe('écritures, dans le clone de travail seulement', () => {
  it('commitAll : auteur = le client, committer = le robot, sha renvoyé', async () => {
    await writeFile(path.join(dir, 'a.css'), '.a {}\n')
    const sha = await repo.commitAll('[ai-editor] test', gitAuthor({ name: 'Marie <Client>', email: 'marie@conduit.test' }))
    assert.equal(sha, sh('rev-parse', 'HEAD'))
    assert.equal(sh('log', '-1', '--format=%an|%ae|%cn|%ce|%s'), 'Marie Client|marie@conduit.test|Kuartz AI editor|ai-editor@kuartz.invalid|[ai-editor] test')
    assert.equal(await repo.isClean(), true)
    assert.equal(await repo.commitsAhead('main', 'HEAD'), 1)
    assert.deepEqual(await repo.commitFiles(sha), ['a.css'])
    assert.match(await repo.showCommitDiff(sha), /\+\.a \{\}/)
  })

  it('discardWorkingChanges : retour exact au dernier commit (fichiers suivis et non suivis)', async () => {
    await writeFile(path.join(dir, 'a.css'), 'broken')
    await writeFile(path.join(dir, 'junk.css'), 'x')
    await repo.discardWorkingChanges()
    assert.equal(await repo.isClean(), true)
    assert.equal((await fileVersions(dir, 'a.css')).after, '.a {\n  color: var(--color-ink);\n}\n')
  })

  it('squashSince : plusieurs commits d’une modification réunis en UN, au nom de l’auteur', async () => {
    const base = await repo.head()
    await writeFile(path.join(dir, 'a.css'), '.a { color: red }\n')
    await repo.commitAll('one', 'Marie <marie@conduit.test>')
    await writeFile(path.join(dir, 'b.css'), '.b {}\n')
    await repo.commitAll('two', 'Paul <paul@conduit.test>')
    const sha = await repo.squashSince(base, 'squashed', 'Marie <marie@conduit.test>')
    assert.equal(sha, await repo.head())
    assert.equal(await repo.commitsAhead(base, 'HEAD'), 1)
    assert.equal(sh('log', '-1', '--format=%an|%s'), 'Marie|squashed')
    assert.deepEqual((await repo.commitFiles(sha!)).sort(), ['a.css', 'b.css'])
    assert.equal(await repo.squashSince(sha!, 'x', 'Marie <marie@conduit.test>'), null)
  })

  it('squashSince refuse une copie sale ou une base qui n’est pas un ancêtre', async () => {
    const base = await repo.head()
    await writeFile(path.join(dir, 'a.css'), 'dirty')
    await assert.rejects(repo.squashSince(base, 'x', 'A <a@b.c>'), WorkRepoError)
    await repo.discardWorkingChanges()
    sh('checkout', '--quiet', '-b', 'other')
    await writeFile(path.join(dir, 'c.css'), '.c {}\n')
    sh('add', '--all')
    sh('commit', '--quiet', '-m', 'other')
    const other = sh('rev-parse', 'HEAD')
    sh('checkout', '--quiet', 'draft')
    await writeFile(path.join(dir, 'd.css'), '.d {}\n')
    await repo.commitAll('d', 'A <a@b.c>')
    await assert.rejects(repo.squashSince(other, 'x', 'A <a@b.c>'), WorkRepoError)
    await assert.rejects(repo.squashSince('not-a-sha', 'x', 'A <a@b.c>'), WorkRepoError)
    assert.equal(await repo.isAncestor(base, 'HEAD'), true)
  })

  it('resetHard : retour arrière d’une modification ; référence douteuse refusée', async () => {
    const base = await repo.head()
    await writeFile(path.join(dir, 'a.css'), '.a {}\n')
    await repo.commitAll('x', 'A <a@b.c>')
    await repo.resetHard(base)
    assert.equal(await repo.head(), base)
    await assert.rejects(repo.resetHard('--hard'), WorkRepoError)
  })
})

describe('garde du clone de travail (piège 5 du POC)', () => {
  it('refuse tout dossier qui n’est pas exactement <ENGINE_WORKSPACE>/repo', async () => {
    assert.throws(() => assertWorkRepoPath('', workspace), WorkRepoError)
    assert.throws(() => assertWorkRepoPath('repo', workspace), WorkRepoError)
    assert.throws(() => assertWorkRepoPath(dir, ''), WorkRepoError)
    assert.throws(() => assertWorkRepoPath(workspace, workspace), WorkRepoError)
    assert.throws(() => assertWorkRepoPath(path.join(workspace, 'other'), workspace), WorkRepoError)
    assert.equal(assertWorkRepoPath(`${dir}/`, workspace), dir)
    await assert.rejects(openWorkRepo(process.cwd(), workspace), WorkRepoError)
  })

  it('refuse un dossier qui n’est pas la racine d’un dépôt git (sous-dossier d’un autre dépôt)', async () => {
    const outer = await realpath(await mkdtemp(path.join(os.tmpdir(), 'kz-outer-')))
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: outer })
      await mkdir(path.join(outer, 'ws', 'repo'), { recursive: true })
      await assert.rejects(openWorkRepo(path.join(outer, 'ws', 'repo'), path.join(outer, 'ws')), /not the root/)
      await mkdir(path.join(workspace, 'empty', 'repo'), { recursive: true })
    } finally {
      await rm(outer, { recursive: true, force: true })
    }
  })

  it('gitAuthor : nom et adresse nettoyés, adresse invalide remplacée', () => {
    assert.equal(gitAuthor({ name: 'A\nB <x>', email: 'a@b.c' }), 'A B x <a@b.c>')
    assert.equal(gitAuthor({ name: '', email: 'not an email', id: 'u-1' }), 'Admin user <u-1@users.kuartz.invalid>')
  })
})
