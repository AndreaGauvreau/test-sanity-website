import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'vitest'
import type { EditJob } from '../../../src/admin/core/contracts'
import { openJsonFile } from './json-file'
import { openEngineStore, THREAD_KEEP, type StoredJob } from './store'

/** Magasin JSON du moteur : écritures atomiques et sérialisées, relecture, fils par page, publications. */

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'kz-store-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const user = { id: 'u', name: 'U', email: 'u@x.test', role: 'client' as const }
const job = (id: string, status: EditJob['status'] = 'done'): StoredJob => ({
  job: {
    id,
    changeId: 'chg_aaaaaaaa',
    kind: 'request',
    request: { page: '/', targets: [], scope: ['style'], note: 'n', viewport: 1280 },
    requestedBy: user,
    createdAt: new Date().toISOString(),
    status,
    steps: [],
    summary: [],
    checks: [],
    texts: [],
    hardcoded: [],
    attempts: 0,
  },
  internal: { headBefore: null },
})

describe('openJsonFile', () => {
  it('crée, met à jour en mémoire tout de suite, écrit dans l’ordre, relit', async () => {
    const file = path.join(dir, 'sub', 'x.json')
    const store = await openJsonFile(file, () => ({ n: 0 }))
    const writes = [1, 2, 3].map((n) => store.update((draft) => void (draft.n = n)))
    assert.equal(store.get().n, 3)
    await Promise.all(writes)
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { n: 3 })
    assert.deepEqual((await openJsonFile(file, () => ({ n: -1 }))).get(), { n: 3 })
    // Aucun fichier temporaire laissé derrière.
    assert.deepEqual(await readdir(path.join(dir, 'sub')), ['x.json'])
  })

  it('un fichier illisible n’est jamais écrasé en silence', async () => {
    const file = path.join(dir, 'bad.json')
    await writeFile(file, '{ not json')
    await assert.rejects(openJsonFile(file, () => ({})), /unreadable/)
    assert.equal(await readFile(file, 'utf8'), '{ not json')
  })
})

describe('openEngineStore', () => {
  it('refuse un dossier relatif ou vide', async () => {
    await assert.rejects(openEngineStore(''), /absolute/)
    await assert.rejects(openEngineStore('data'), /absolute/)
  })

  it('demandes, modifications, fils résolus, persistance', async () => {
    const store = await openEngineStore(dir)
    await store.editor.putJob(job('job_aaaaaaaa', 'running'))
    await store.editor.putChange({
      change: { id: 'chg_aaaaaaaa', page: '/', targets: [], status: 'to-validate', jobIds: ['job_aaaaaaaa'], adjustments: 0, summary: [], checks: [], createdAt: '', createdBy: user },
      internal: { baseCommit: 'abc1234', commits: [] },
    })
    await store.editor.appendThread('/', { type: 'job', jobId: 'job_aaaaaaaa' })
    await store.editor.appendThread('/', { type: 'cancelled', changeId: 'chg_aaaaaaaa', at: 't' })
    assert.equal(store.editor.activeJobs().length, 1)
    assert.equal(store.editor.openChange()?.change.id, 'chg_aaaaaaaa')
    assert.deepEqual(store.editor.thread('/').map((entry) => entry.type), ['job', 'cancelled'])
    assert.deepEqual(store.editor.thread('/blog'), [])
    await store.editor.updateJob('job_aaaaaaaa', (stored) => void (stored.job.status = 'done'))
    await assert.rejects(store.editor.updateJob('job_missing0', () => {}), /Unknown job/)

    const reopened = await openEngineStore(dir)
    assert.equal(reopened.editor.job('job_aaaaaaaa')?.job.status, 'done')
    assert.equal(reopened.editor.activeJobs().length, 0)
    assert.equal(reopened.editor.job('__proto__'), null)
  })

  it('fil borné par page ; demandes qui ne sont plus référencées retirées', async () => {
    const store = await openEngineStore(dir)
    for (let i = 0; i < THREAD_KEEP + 5; i++) {
      const id = `job_${String(i).padStart(8, '0')}`
      await store.editor.putJob(job(id))
      await store.editor.appendThread('/', { type: 'job', jobId: id })
    }
    assert.equal(store.editor.data().threads['/'].length, THREAD_KEEP)
    assert.equal(store.editor.job('job_00000000'), null)
    assert.equal(store.editor.thread('/').length, 50)
  })

  it('publications : numéro suivant, état libre pour engine-publish', async () => {
    const store = await openEngineStore(dir)
    assert.equal(store.publications.nextNumber(), 1)
    await store.publications.update((data) => {
      data.publications.push({ number: 1, at: 't', by: 'U', content: [], design: [], status: 'live' })
      data.extra.lastTag = 'publication-1'
    })
    assert.equal((await openEngineStore(dir)).publications.nextNumber(), 2)
    assert.equal((await openEngineStore(dir)).publications.get().extra.lastTag, 'publication-1')
  })
})
