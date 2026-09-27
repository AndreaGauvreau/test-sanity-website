import { afterEach, describe, expect, it, vi } from 'vitest'
import { EDITOR_VIEWPORTS, type EditJob, type EditorState, type EngineErrorBody, type PendingChange } from '../../contracts/engine'
import type { EngineUser } from '../../contracts/session'
import {
  createEditorMock,
  MOCK_CONTENT_DRAFTS,
  MOCK_EDITOR_MESSAGES,
  MOCK_QUESTION_TTL_MS,
  editorMock,
  handleEditor,
  listValidatedDesignChanges,
  mockEditorHealth,
  setEditorMockScenario,
  type EditorPublishPort,
  type MockEditorScenario,
} from './editor'
import { publishMock } from './publish'
import type { MockEngineRequest } from './types'

const user: EngineUser = { id: 'dev-kuartz', name: 'Dev', email: 'dev@example.com', role: 'kuartz' }
const target = { zone: 'hero-title', index: 0, label: 'Hero · Title' }

function setup(options: { scenario?: MockEditorScenario; publish?: EditorPublishPort } = {}) {
  let t = Date.parse('2026-09-27T10:00:00Z')
  const mock = createEditorMock({ now: () => t, ...options })
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
  it('409 busy, 409 awaiting_validation ; ajustement inconnu 404, périmé 409 conflict ; Cancel idempotent', async () => {
    const { call, tick, request } = setup()
    const job = (await request('Put solved in bold', { scope: ['text'] })).json as EditJob
    const busy = await request('Another one', { scope: ['text'] })
    expect(busy.status).toBe(409)
    expect((busy.json as EngineErrorBody).error).toEqual({ code: 'busy', message: MOCK_EDITOR_MESSAGES.busy })
    tick(6000)
    await call('GET', `editor/jobs/${job.id}`)
    const waiting = await request('Another one', { scope: ['text'] })
    expect((waiting.json as EngineErrorBody).error).toEqual({ code: 'awaiting_validation', message: MOCK_EDITOR_MESSAGES.awaiting })
    const unknown = await request('Adjust', { scope: ['text'], changeId: 'chg-unknown' })
    expect(unknown.status).toBe(404)
    expect((unknown.json as EngineErrorBody).error.code).toBe('not_found')
    const cancelled = await call('POST', `editor/changes/${job.changeId}/cancel`)
    expect((cancelled.json as PendingChange).status).toBe('cancelled')
    // Comme le vrai moteur : une décision déjà prise est renvoyée telle quelle, l'autre est refusée.
    const again = await call('POST', `editor/changes/${job.changeId}/cancel`)
    expect(again.status).toBe(200)
    expect((again.json as PendingChange).status).toBe('cancelled')
    const validate = await call('POST', `editor/changes/${job.changeId}/validate`)
    expect(validate.status).toBe(409)
    expect((validate.json as EngineErrorBody).error.code).toBe('conflict')
    const stale = await request('Adjust', { scope: ['text'], changeId: job.changeId })
    expect(stale.status).toBe(409)
    expect((stale.json as EngineErrorBody).error.code).toBe('conflict')
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

  it('formats de l’aperçu du contrat (EDITOR_VIEWPORTS), comme le vrai moteur : Tablet 810 accepté, l’ancien 768 refusé', async () => {
    const { request } = setup()
    const old = await request('x', { viewport: 768 })
    expect([old.status, (old.json as EngineErrorBody).error.message]).toEqual([400, 'Invalid screen size.'])
    const tablet = await request('Tablet layout.', { viewport: EDITOR_VIEWPORTS.tablet })
    expect(tablet.status).toBe(201)
    expect((tablet.json as EditJob).request.viewport).toBe(810)
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

// ─── AI-04 : mêmes refus que le vrai moteur (409 publishing, 503 unavailable), santé cohérente ──────────────

const code = (res: { json: unknown }) => (res.json as EngineErrorBody).error

async function doneChange(s: ReturnType<typeof setup>, note = 'Put solved in bold', scope = ['text']) {
  const job = (await s.request(note, { scope, targets: [{ zone: 'hero.title', index: 0, label: 'Hero · Title' }] })).json as EditJob
  s.tick(6000)
  await s.call('GET', `editor/jobs/${job.id}`)
  return job
}

describe('mock/editor — santé et scénarios nommés (AI-04)', () => {
  it('par défaut (« ready ») : santé configurée (accès Claude, aperçu prêt, jeton Sanity), ok = true', async () => {
    const { call, mock } = setup()
    const state = (await call('GET', 'editor/state?page=/')).json as EditorState
    expect(mock.scenario()).toBe('ready')
    expect(state.health.ok).toBe(true)
    expect(state.health.claude.access).not.toBe('none')
    expect(state.health.sanityWrite).toBe(true)
    expect(state.health.preview.ready).toBe(true)
    expect(state.health).toEqual(mock.health())
  })

  it('l’usage annonce le même accès que la santé', async () => {
    const s = setup()
    const job = await doneChange(s)
    const polled = (await s.call('GET', `editor/jobs/${job.id}`)).json as EditJob
    expect(polled.usage?.access).toBe(s.mock.health().claude.access)
  })

  it('« no-claude » : santé ok = false, access none, demande → 503 unavailable (message du vrai moteur)', async () => {
    const { call, request } = setup({ scenario: 'no-claude' })
    const state = (await call('GET', 'editor/state?page=/')).json as EditorState
    expect(state.health.ok).toBe(false)
    expect(state.health.claude.access).toBe('none')
    const res = await request('Make the title bigger', { scope: ['style'] })
    expect(res.status).toBe(503)
    expect(code(res)).toEqual({ code: 'unavailable', message: MOCK_EDITOR_MESSAGES.noClaude })
    expect(((await call('GET', 'editor/state?page=/')).json as EditorState).thread).toEqual([])
  })

  it('« preview-starting » : santé ok = false, aperçu pas prêt, demande → 503', async () => {
    const { call, request } = setup({ scenario: 'preview-starting' })
    const state = (await call('GET', 'editor/state?page=/')).json as EditorState
    expect(state.health.ok).toBe(false)
    expect(state.health.preview.ready).toBe(false)
    const res = await request('Make the title bigger', { scope: ['style'] })
    expect(res.status).toBe(503)
    expect(code(res).message).toBe(MOCK_EDITOR_MESSAGES.previewNotReady)
  })

  it('« restore-pending » : toute nouvelle demande → 503, santé inchangée', async () => {
    const { call, request } = setup({ scenario: 'restore-pending' })
    expect(((await call('GET', 'editor/state?page=/')).json as EditorState).health.ok).toBe(true)
    const res = await request('Make the title bigger', { scope: ['style'] })
    expect(res.status).toBe(503)
    expect(code(res).message).toBe(MOCK_EDITOR_MESSAGES.restorePending)
  })

  it('« no-sanity-token » : Style passe ; Text sur une zone Sanity → 503 ; Cancel d’une modification avec textes → 503', async () => {
    const s = setup()
    const withTexts = await doneChange(s)
    s.mock.setScenario('no-sanity-token')
    const state = (await s.call('GET', 'editor/state?page=/')).json as EditorState
    expect(state.health.sanityWrite).toBe(false)
    expect(state.health.ok).toBe(true)
    // Le fil et la modification en attente survivent au changement de scénario.
    expect(state.pending?.id).toBe(withTexts.changeId)
    const cancel = await s.call('POST', `editor/changes/${withTexts.changeId}/cancel`)
    expect(cancel.status).toBe(503)
    expect(code(cancel).message).toBe(MOCK_EDITOR_MESSAGES.cancelNoToken)
    expect((await s.call('POST', `editor/changes/${withTexts.changeId}/validate`)).status).toBe(200)

    const sanityZone = [{ zone: 'hero.title', index: 0, label: 'Hero · Title' }]
    const text = await s.request('Put solved in bold', { scope: ['text'], targets: sanityZone })
    expect(text.status).toBe(503)
    expect(code(text).message).toBe(MOCK_EDITOR_MESSAGES.noSanityToken)
    const style = await s.request('Make the title bigger', { scope: ['style'], targets: sanityZone })
    expect(style.status).toBe(201)
  })
})

describe('mock/editor — verrou de publication (AI-04)', () => {
  it('publication en cours : demande, ajustement, Validate et Cancel → 409 publishing ; libre ensuite', async () => {
    let running = false
    const s = setup({ publish: { isPublishing: () => running } })
    const job = await doneChange(s)
    running = true
    const blocked = [
      await s.request('Another one', { scope: ['style'] }),
      await s.request('Adjust', { scope: ['style'], changeId: job.changeId }),
      await s.call('POST', `editor/changes/${job.changeId}/validate`),
      await s.call('POST', `editor/changes/${job.changeId}/cancel`),
    ]
    for (const res of blocked) {
      expect(res.status).toBe(409)
      expect(code(res)).toEqual({ code: 'publishing', message: MOCK_EDITOR_MESSAGES.publishing })
    }
    running = false
    expect((await s.call('POST', `editor/changes/${job.changeId}/validate`)).status).toBe(200)
  })

  it('409 publishing passe avant 409 busy (ordre d’assertCanStart)', async () => {
    let running = false
    const s = setup({ publish: { isPublishing: () => running } })
    await s.request('Put solved in bold', { scope: ['text'] })
    running = true
    expect(code(await s.request('Another one', { scope: ['style'] })).code).toBe('publishing')
  })

  it('« Validated — added to Publish (N changes) » : N vient de la publication simulée ; E1 reçoit la page (#32)', async () => {
    const s = setup({ publish: { isPublishing: () => false, pendingTotal: () => 7 } })
    const job = await doneChange(s)
    await s.call('POST', `editor/changes/${job.changeId}/validate`)
    const state = (await s.call('GET', 'editor/state?page=/')).json as EditorState
    expect(state.thread.at(-1)).toMatchObject({ type: 'validated', pendingTotal: 7 })
    expect(s.mock.world.validated).toEqual([expect.objectContaining({ changeId: job.changeId, page: '/', files: expect.any(Array) })])
  })

  it('#41 : `page` des modifications validées = page de la modification (pas une constante), pour le View ↗ de E1', async () => {
    const s = setup({ publish: { isPublishing: () => false, pendingTotal: () => 1 } })
    const job = (await s.request('Put solved in bold', { page: '/pricing', scope: ['text'] })).json as EditJob
    s.tick(6000)
    await s.call('GET', `editor/jobs/${job.id}`)
    expect((await s.call('POST', `editor/changes/${job.changeId}/validate`)).status).toBe(200)
    expect(s.mock.world.validated).toEqual([expect.objectContaining({ changeId: job.changeId, page: '/pricing' })])
    // Le fil de la bonne page reçoit l'entrée « validated », pas celui de l'accueil.
    const pricing = (await s.call('GET', 'editor/state?page=/pricing')).json as EditorState
    expect(pricing.thread.at(-1)).toMatchObject({ type: 'validated', changeId: job.changeId })
    const home = (await s.call('GET', 'editor/state?page=/')).json as EditorState
    expect(home.thread.some((e) => e.type === 'validated')).toBe(false)
  })
})

describe('mock/editor — instance du processus branchée sur mock/publish.ts (AI-04, #32)', () => {
  const at = (segments: string[], method: 'GET' | 'POST' = 'POST', body: unknown = {}, id?: string) =>
    handleEditor({
      method,
      segments,
      params: id ? { id } : {},
      query: new URLSearchParams(method === 'GET' ? { page: '/' } : {}),
      body,
      user,
    }) as { status: number; json: unknown }
  const post = (note: string, scope: string[]) =>
    at(['editor', 'requests'], 'POST', { page: '/', targets: [{ zone: 'hero.title', index: 0, label: 'Hero · Title' }], scope, note, viewport: 1280 })

  afterEach(() => {
    publishMock().setScenario('pending')
    setEditorMockScenario('ready')
    editorMock().reset()
    vi.useRealTimers()
  })

  it('publication simulée « publishing » → 409 publishing ; sinon la demande part', () => {
    publishMock().setScenario('publishing')
    const blocked = post('Make the title bigger', ['style'])
    expect(blocked.status).toBe(409)
    expect(code(blocked).code).toBe('publishing')
    publishMock().setScenario('pending')
    expect(post('Make the title bigger', ['style']).status).toBe(201)
  })

  it('santé : GET /editor/state = mockEditorHealth(), configurée par défaut, suit setEditorMockScenario', () => {
    const state = at(['editor', 'state'], 'GET').json as EditorState
    expect(state.health).toEqual(mockEditorHealth())
    expect(state.health.ok).toBe(true)
    setEditorMockScenario('no-claude')
    expect((at(['editor', 'state'], 'GET').json as EditorState).health.claude.access).toBe('none')
    expect(post('Make the title bigger', ['style']).status).toBe(503)
  })

  it('Validate : la modification arrive dans E1 « Design » (avec sa page) et N compte la liste de E1 (#32)', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-09-27T10:00:00Z') })
    const job = post('Put solved in bold', ['text']).json as EditJob
    vi.setSystemTime(Date.now() + 6000)
    at(['editor', 'jobs', job.id], 'GET', undefined, job.id)
    expect(at(['editor', 'changes', job.changeId, 'validate'], 'POST', {}, job.changeId).status).toBe(200)
    expect(listValidatedDesignChanges().map((d) => d.changeId)).toEqual([job.changeId])
    const status = publishMock().handle({ method: 'GET', segments: ['publish', 'status'], params: {}, query: new URLSearchParams(), body: null, user })
    const pending = (status as { json: { pending: { design: { changeId: string; page?: string }[]; total: number } } }).json.pending
    expect(pending.design.find((d) => d.changeId === job.changeId)).toMatchObject({ page: '/' })
    const state = at(['editor', 'state'], 'GET').json as EditorState
    expect(state.thread.at(-1)).toMatchObject({ type: 'validated', pendingTotal: pending.total })
  })
})
