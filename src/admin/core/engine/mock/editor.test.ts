import { describe, expect, it } from 'vitest'
import type { EditJob, EditorState, EngineErrorBody, PendingChange } from '../../contracts/engine'
import type { EngineUser } from '../../contracts/session'
import { createEditorMock, MOCK_CONTENT_DRAFTS, MOCK_QUESTION_TTL_MS } from './editor'
import type { MockEngineRequest } from './types'

const user: EngineUser = { id: 'dev-kuartz', name: 'Dev', email: 'dev@example.com', role: 'kuartz' }
const target = { zone: 'hero-title', index: 0, label: 'Hero · Title' }

function setup() {
  let t = Date.parse('2026-09-27T10:00:00Z')
  const mock = createEditorMock({ now: () => t })
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown) => {
    const url = new URL(`http://x/${path}`)
    const segments = url.pathname.slice(1).split('/')
    const params: Record<string, string> = {}
    if (segments[1] === 'jobs' || segments[1] === 'changes') params.id = segments[2]
    const req: MockEngineRequest = { method, segments, params, query: url.searchParams, body, user }
    const res = await mock.handle(req)
    if (!('json' in res)) throw new Error('binary')
    return res as { status: number; json: unknown }
  }
  return {
    mock,
    call,
    tick: (ms: number) => {
      t += ms
    },
    request: (note: string, extra: Record<string, unknown> = {}) =>
      call('POST', 'editor/requests', { page: '/', targets: [target], scope: ['style', 'text'], note, viewport: 1280, ...extra }),
  }
}

describe('mock/editor — enchaînement', () => {
  it('queued → running (étapes) → waiting (question 🟢 ⚪ 🔴) → réponse → done → validate', async () => {
    const { call, tick, request } = setup()
    const created = await request('Make the title bigger and put "solved" in bold.')
    expect(created.status).toBe(201)
    const job = created.json as EditJob
    expect(job.status).toBe('queued')
    expect(job.kind).toBe('request')

    tick(600)
    let polled = (await call('GET', `editor/jobs/${job.id}`)).json as EditJob
    expect(polled.status).toBe('running')
    expect(polled.steps[0].label).toMatch(/^Reading .*\.css$|^Reading /)

    tick(2000)
    polled = (await call('GET', `editor/jobs/${job.id}`)).json as EditJob
    expect(polled.status).toBe('waiting')
    const q = polled.question!.questions[0]
    expect(q.options.map((o) => o.tone)).toEqual(['recommended', 'neutral', 'discouraged'])
    expect(q.options[2].hardcoded).toEqual({ property: 'font-size', value: '60px' })
    expect(q.question).toMatch(/no token matches exactly/)

    const answered = await call('POST', `editor/jobs/${job.id}/answer`, { answers: [{ questionId: q.id, optionId: 'token' }] })
    expect(answered.status).toBe(200)
    expect((answered.json as EditJob).status).toBe('running')

    tick(3000)
    polled = (await call('GET', `editor/jobs/${job.id}`)).json as EditJob
    expect(polled.status).toBe('done')
    expect(polled.summary.map((s) => s.description)).toEqual(['Title: size → Heading XL (token)', '“solved” in bold'])
    expect(polled.checks.map((c) => c.label)).toEqual(['contrast', 'mobile', 'tablet'])
    expect(polled.texts).toHaveLength(1)
    expect(polled.usage).toMatchObject({ inputTokens: 20_900, outputTokens: 1_600, costUsd: 0.09 })

    let state = (await call('GET', 'editor/state?page=/')).json as EditorState
    expect(state.active).toBeNull()
    expect(state.pending?.status).toBe('to-validate')
    expect(state.preview).toEqual({ url: 'http://127.0.0.1:4040/admin/editor/harness?page=home', origin: 'http://127.0.0.1:4040' })
    expect(state.conversationUsage?.inputTokens).toBe(20_900)

    const validated = await call('POST', `editor/changes/${job.changeId}/validate`)
    expect((validated.json as PendingChange).status).toBe('validated')
    state = (await call('GET', 'editor/state?page=/')).json as EditorState
    expect(state.pending).toBeNull()
    const last = state.thread.at(-1)!
    expect(last).toMatchObject({ type: 'validated', pendingTotal: MOCK_CONTENT_DRAFTS + 1 })
  })

  it('ajustement : pas de question, « adjusted once », usage cumulé de la modification', async () => {
    const { call, tick, request } = setup()
    const first = (await request('Put solved in bold', { scope: ['text'] })).json as EditJob
    tick(6000)
    await call('GET', `editor/jobs/${first.id}`)
    const adj = await request('A bit smaller, and keep it on 2 lines.', { changeId: first.changeId, scope: ['style'] })
    expect(adj.status).toBe(201)
    expect((adj.json as EditJob).kind).toBe('adjustment')
    tick(6000)
    const state = (await call('GET', 'editor/state?page=/')).json as EditorState
    expect(state.pending).toMatchObject({ status: 'to-validate', adjustments: 1 })
    expect(state.pending?.usage?.costUsd).toBeCloseTo(0.14)
    const jobs = state.thread.filter((e) => e.type === 'job')
    expect(jobs).toHaveLength(2)
  })

  it('Stop : rien n’est modifié, la modification disparaît', async () => {
    const { call, tick, request } = setup()
    const job = (await request('Make the title bigger')).json as EditJob
    tick(800)
    const stopped = (await call('POST', `editor/jobs/${job.id}/stop`)).json as EditJob
    expect(stopped.status).toBe('stopped')
    expect(stopped.usage?.costKind).toBe('estimated')
    const state = (await call('GET', 'editor/state?page=/')).json as EditorState
    expect(state.active).toBeNull()
    expect(state.pending).toBeNull()
  })

  it('échec (« fail ») après un 2e essai, et refus (« already »)', async () => {
    const { call, tick, request } = setup()
    const job = (await request('Make it fail please', { scope: ['text'] })).json as EditJob
    tick(5000)
    const failed = (await call('GET', `editor/jobs/${job.id}`)).json as EditJob
    expect(failed.status).toBe('failed')
    expect(failed.attempts).toBe(2)
    expect(failed.error).toBeTruthy()

    const rej = (await request('It is already fine', { scope: ['text'] })).json as EditJob
    tick(3000)
    const rejected = (await call('GET', `editor/jobs/${rej.id}`)).json as EditJob
    expect(rejected.status).toBe('rejected')
    expect(rejected.message).toMatch(/Nothing to change/)
  })

  it('question sans réponse 15 min → stopped', async () => {
    const { call, tick, request } = setup()
    const job = (await request('Make the title bigger', { scope: ['style'] })).json as EditJob
    tick(3000)
    expect(((await call('GET', `editor/jobs/${job.id}`)).json as EditJob).status).toBe('waiting')
    tick(MOCK_QUESTION_TTL_MS + 10)
    expect(((await call('GET', `editor/jobs/${job.id}`)).json as EditJob).status).toBe('stopped')
  })
})

describe('mock/editor — gardes', () => {
  it('409 busy, 409 awaiting_validation, 409 conflict sur un ajustement périmé', async () => {
    const { call, tick, request } = setup()
    const job = (await request('Put solved in bold', { scope: ['text'] })).json as EditJob
    const busy = await request('Another one', { scope: ['text'] })
    expect(busy.status).toBe(409)
    expect((busy.json as EngineErrorBody).error.code).toBe('busy')
    tick(6000)
    await call('GET', `editor/jobs/${job.id}`)
    const waiting = await request('Another one', { scope: ['text'] })
    expect((waiting.json as EngineErrorBody).error.code).toBe('awaiting_validation')
    const stale = await request('Adjust', { scope: ['text'], changeId: 'chg-unknown' })
    expect((stale.json as EngineErrorBody).error.code).toBe('conflict')
    await call('POST', `editor/changes/${job.changeId}/cancel`)
    const again = await call('POST', `editor/changes/${job.changeId}/cancel`)
    expect(again.status).toBe(409)
  })

  it('400 : demande mal formée (portée vide, note trop longue, 9 éléments, viewport inconnu)', async () => {
    const { request } = setup()
    expect((await request('x', { scope: [] })).status).toBe(400)
    expect((await request('x'.repeat(601))).status).toBe(400)
    expect((await request('   ')).status).toBe(400)
    expect((await request('x', { targets: Array.from({ length: 9 }, () => target) })).status).toBe(400)
    expect((await request('x', { viewport: 1024 })).status).toBe(400)
    expect((await request('x', { targets: [{ ...target, zone: '../etc' }] })).status).toBe(400)
  })

  it('400 : réponses invalides (option inconnue, texte libre trop long, les deux à la fois)', async () => {
    const { call, tick, request } = setup()
    const job = (await request('Make the title bigger', { scope: ['style'] })).json as EditJob
    tick(3000)
    await call('GET', `editor/jobs/${job.id}`)
    const answer = (a: unknown) => call('POST', `editor/jobs/${job.id}/answer`, { answers: [a] })
    expect((await answer({ questionId: 'q1', optionId: 'nope' })).status).toBe(400)
    expect((await answer({ questionId: 'q1', other: 'x'.repeat(301) })).status).toBe(400)
    expect((await answer({ questionId: 'q1', optionId: 'token', other: 'y' })).status).toBe(400)
    expect((await answer({ questionId: 'q9', optionId: 'token' })).status).toBe(400)
    const ok = await answer({ questionId: 'q1', other: 'Use 58 px please' })
    expect(ok.status).toBe(200)
    expect((ok.json as EditJob).steps.at(-1)?.label).toBe('Your answer: Use 58 px please')
  })

  it('404 pour une demande inconnue ; page obligatoire pour l’état', async () => {
    const { call } = setup()
    expect((await call('GET', 'editor/jobs/job-x')).status).toBe(404)
    expect((await call('GET', 'editor/state')).status).toBe(400)
  })

  it('le fil est par page et garde les 50 dernières entrées', async () => {
    const { call, tick, request, mock } = setup()
    for (let i = 0; i < 26; i++) {
      const job = (await request(`Put solved in bold ${i}`, { scope: ['text'] })).json as EditJob
      tick(6000)
      await call('GET', `editor/jobs/${job.id}`)
      await call('POST', `editor/changes/${job.changeId}/cancel`)
    }
    expect(mock.world.threads.get('/')!.length).toBe(50)
    const other = (await call('GET', 'editor/state?page=/blog')).json as EditorState
    expect(other.thread).toEqual([])
    expect(other.preview.url).toContain('page=blog')
  })
})
