import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EditJob, PublishStatus } from '../../contracts/engine'
import type { EngineUser } from '../../contracts/session'
import { clearValidatedDesignChanges, handleEditor, listValidatedDesignChanges } from './editor'
import { createPublishMock, MOCK_EDITOR_PORT } from './publish'
import type { MockEngineRequest } from './types'

/**
 * Lien RÉEL entre la publication simulée et l'éditeur simulé du processus (mock/editor.ts, instance sur globalThis) :
 * FOLLOWUPS #32 (Design de E1 depuis listValidatedDesignChanges) et AI-05 (409 busy / awaiting_validation).
 * L'éditeur lit Date.now() : l'horloge est factice.
 */

const USER: EngineUser = { id: 'u1', name: 'Marie', email: 'marie@conduit.test', role: 'client' }

function req(method: 'GET' | 'POST', path: string, body?: unknown): MockEngineRequest {
  const url = new URL(`http://x/${path}`)
  const segments = url.pathname.slice(1).split('/')
  const params: Record<string, string> = {}
  if (segments[1] === 'jobs' || segments[1] === 'changes') params.id = segments[2]
  return { method, segments, params, query: url.searchParams, body, user: USER }
}

async function editor(method: 'GET' | 'POST', path: string, body?: unknown) {
  const res = await handleEditor(req(method, path, body))
  return res as { status: number; json: unknown }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T10:00:00Z'))
  clearValidatedDesignChanges()
})
afterEach(() => {
  clearValidatedDesignChanges()
  vi.useRealTimers()
})

describe('publication simulée ↔ éditeur simulé (instance du processus)', () => {
  it('demande en cours → busy ; à valider → awaiting_validation ; validée → rejoint E1 puis quitte l’éditeur à la publication', async () => {
    const publish = createPublishMock({ scenario: 'idle', holder: {}, editor: MOCK_EDITOR_PORT })
    const call = (method: 'GET' | 'POST', path: string, body?: unknown) => publish.handle(req(method, path, body)) as { status: number; json: unknown }
    expect(MOCK_EDITOR_PORT.blocker()).toBeNull()

    const created = await editor('POST', 'editor/requests', {
      page: '/',
      targets: [{ zone: 'hero-title', index: 0, label: 'Hero · Title' }],
      scope: ['text'],
      note: 'Put “solved” in bold.',
      viewport: 1280,
    })
    expect(created.status).toBe(201)
    const job = created.json as EditJob
    expect(MOCK_EDITOR_PORT.blocker()).toBe('busy')
    expect(call('POST', 'publish/discard', { kind: 'design', changeId: 'x' }).json).toMatchObject({ error: { code: 'busy' } })

    vi.advanceTimersByTime(30_000)
    expect(((await editor('GET', `editor/jobs/${job.id}`)).json as EditJob).status).toBe('done')
    expect(MOCK_EDITOR_PORT.blocker()).toBe('awaiting_validation')
    expect(call('POST', 'publish', { expected: [] }).json).toMatchObject({ error: { code: 'awaiting_validation' } })

    expect((await editor('POST', `editor/changes/${job.changeId}/validate`)).status).toBe(200)
    expect(MOCK_EDITOR_PORT.blocker()).toBeNull()
    const status = call('GET', 'publish/status').json as PublishStatus
    expect(status.state).toBe('pending')
    expect(status.pending.design.map((d) => d.changeId)).toEqual([job.changeId])

    expect(call('POST', 'publish', { expected: [job.changeId] }).status).toBe(200)
    vi.advanceTimersByTime(60_000)
    expect((call('GET', 'publish/status').json as PublishStatus).state).toBe('published')
    expect(listValidatedDesignChanges()).toEqual([])
  })
})
