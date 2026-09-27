import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, it } from 'vitest'
import { CLIENT, KUARTZ, makeWorkspace } from '../jobs/testing'
import type { EngineError } from '../server/errors'
import { openEngineStore } from '../store/store'
import { createVersionsService, HOSTED_ROLLBACK_REASON, LOCAL_ROLLBACK_REASON } from './versions'

/** Versions (E2) : magasin + tags git publication-N ; retour arrière 501 en mode local (Kuartz seulement). */

let cleanup: (() => Promise<void>) | null = null
afterEach(async () => {
  await cleanup?.()
  cleanup = null
})

async function setup(mode: 'local' | 'hosted' = 'local') {
  const ws = await makeWorkspace()
  cleanup = () => rm(ws.workspace, { recursive: true, force: true })
  const store = await openEngineStore(path.join(ws.workspace, 'data'))
  const service = createVersionsService({ repo: ws.repo, publications: store.publications, mode })
  return { ws, store, service }
}

async function code(promise: Promise<unknown>): Promise<[number, string, string]> {
  try {
    await promise
  } catch (error) {
    const e = error as EngineError
    return [e.status, e.code, e.message]
  }
  assert.fail('expected an error')
}

describe('versions', () => {
  it('liste : magasin (plus récente en haut, live/previous/failed) + tags git absents du magasin', async () => {
    const { ws, store, service } = await setup()
    const head = ws.git('rev-parse', 'HEAD')
    ws.git('tag', 'publication-1', head)
    ws.git('tag', 'publication-3', head)
    ws.git('tag', 'not-a-publication', head)
    await store.publications.update((data) => {
      data.publications = [
        { number: 2, at: '2026-09-24T10:00:00Z', by: 'Andrea', content: [], design: [], status: 'failed', note: 'Build failed' },
        { number: 3, at: '2026-09-27T10:00:00Z', by: 'Marie', content: [{ id: 'dockSchedulingPage', path: 'Home › Hero · Title' }], design: [], status: 'live' },
      ]
    })
    const { publications, rollback } = await service.list()
    assert.deepEqual(
      publications.map((p) => [p.number, p.status, p.tag, p.by]),
      [
        [3, 'live', 'publication-3', 'Marie'],
        [2, 'failed', undefined, 'Andrea'],
        [1, 'previous', 'publication-1', 'Test'],
      ],
    )
    assert.equal(publications[0].commit, head)
    assert.match(publications[2].note ?? '', /Found in git only/)
    assert.deepEqual(rollback, { available: false, reason: LOCAL_ROLLBACK_REASON })
  })

  it('sans magasin : le tag le plus récent est « live »', async () => {
    const { ws, service } = await setup()
    ws.git('tag', 'publication-1')
    ws.git('commit', '--allow-empty', '--quiet', '-m', 'next')
    ws.git('tag', 'publication-2')
    const { publications } = await service.list()
    assert.deepEqual(publications.map((p) => [p.number, p.status]), [
      [2, 'live'],
      [1, 'previous'],
    ])
  })

  it('retour arrière : 501 not_implemented en mode local (message clair), 404 inconnue, 409 version en échec, 403 client', async () => {
    const { store, service } = await setup()
    await store.publications.update((data) => {
      data.publications = [
        { number: 1, at: '2026-09-20T10:00:00Z', by: 'Andrea', content: [], design: [], status: 'previous' },
        { number: 2, at: '2026-09-24T10:00:00Z', by: 'Andrea', content: [], design: [], status: 'failed' },
      ]
    })
    assert.deepEqual(await code(service.rollback(KUARTZ, 1)), [501, 'not_implemented', LOCAL_ROLLBACK_REASON])
    assert.deepEqual((await code(service.rollback(KUARTZ, 9))).slice(0, 2), [404, 'not_found'])
    assert.deepEqual((await code(service.rollback(KUARTZ, 2))).slice(0, 2), [409, 'conflict'])
    assert.deepEqual((await code(service.rollback(CLIENT, 1))).slice(0, 2), [403, 'forbidden'])
  })

  it('mode hébergé : prévu pour Vercel Instant Rollback, pas encore branché (501)', async () => {
    const { store, service } = await setup('hosted')
    await store.publications.update((data) => {
      data.publications = [{ number: 1, at: '2026-09-20T10:00:00Z', by: 'Andrea', content: [], design: [], status: 'live' }]
    })
    assert.deepEqual(await code(service.rollback(KUARTZ, 1)), [501, 'not_implemented', HOSTED_ROLLBACK_REASON])
    assert.equal((await service.list()).rollback.reason, HOSTED_ROLLBACK_REASON)
  })
})
