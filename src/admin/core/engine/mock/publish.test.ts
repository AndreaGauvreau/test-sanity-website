import { describe, expect, it } from 'vitest'

import type { PendingDesignItem, Publication, PublishStatus } from '../../contracts/engine'
import type { EngineUser } from '../../contracts/session'
import {
  createPublishMock,
  isMockPublishScenario,
  MOCK_AWAITING_MESSAGE,
  MOCK_BUSY_MESSAGE,
  MOCK_LOCAL_NOTE,
  MOCK_LOCAL_STEP3,
  MOCK_PUBLISH_SCENARIOS,
  MOCK_STEP_MS,
  type EditorPort,
  type MockPublishScenario,
} from './publish'
import type { MockEngineRequest } from './types'

const USER: EngineUser = { id: 'u1', name: 'Marie', email: 'marie@conduit.test', role: 'client' }

/** Faux éditeur simulé : modifications validées, retraits et verrou pilotés par le test. */
function fakeEditor() {
  const state = { validated: [] as PendingDesignItem[], cleared: [] as string[], blocker: null as ReturnType<EditorPort['blocker']> }
  const port: EditorPort = {
    validated: () => structuredClone(state.validated),
    clear: (ids) => {
      state.cleared.push(...ids)
      state.validated = state.validated.filter((v) => !ids.includes(v.changeId))
    },
    blocker: () => state.blocker,
  }
  return { state, port }
}

const EDITOR_CHANGE: PendingDesignItem = {
  changeId: 'chg-editor-1',
  commit: 'abc1234',
  title: 'Hero · Eyebrow — color → Accent',
  validatedBy: 'Marie',
  validatedAt: new Date(2026, 8, 26, 13, 58).toISOString(),
  files: ['src/components/sections/Hero/Hero.module.css'],
}

function setup(scenario: MockPublishScenario = 'pending', editor?: EditorPort) {
  let now = new Date(2026, 8, 26, 14, 0).getTime()
  const mock = createPublishMock({ now: () => now, scenario, holder: {}, editor })
  const call = (method: 'GET' | 'POST', path: string, body?: unknown) => {
    const segments = path.split('/')
    const params: Record<string, string> = {}
    if (segments[1] === 'diff') params.id = segments[2]
    if (segments[0] === 'versions' && segments[2] === 'rollback') params.number = segments[1]
    const req: MockEngineRequest = { method, segments, params, query: new URLSearchParams(), body, user: USER }
    return mock.handle(req) as { status: number; json: unknown }
  }
  const status = () => call('GET', 'publish/status').json as PublishStatus
  const tick = (ms: number) => {
    now += ms
  }
  return { mock, call, status, tick }
}

const expected = (s: PublishStatus) => [...s.pending.content.map((c) => c.id), ...s.pending.design.map((d) => d.changeId)]

describe('moteur simulé de publication', () => {
  it('scénarios connus', () => {
    expect(MOCK_PUBLISH_SCENARIOS.map((s) => s.id)).toContain('failed')
    expect(isMockPublishScenario('published')).toBe(true)
    expect(isMockPublishScenario('nope')).toBe(false)
  })

  it('pending : les listes du Figma (2 contenus, 1 design, N = 3)', () => {
    const { status } = setup()
    const s = status()
    expect(s.state).toBe('pending')
    expect(s.pending.total).toBe(3)
    expect(s.pending.content.map((c) => c.path)).toEqual(['Home › Hero · Title', 'Blog › Carrier portals: a checklist'])
    expect(s.pending.design[0].title).toBe('Hero · Title — size → Heading XL')
    expect(s.pending.lastValidatedAt).toBeDefined()
  })

  it('publication complète (mode Vercel) : étapes 1 → 4 dans le temps, contenu d’abord, puis publiée et nouvelle version en ligne', () => {
    const { call, status, tick } = setup('hosted')
    const res = call('POST', 'publish', { expected: expected(status()) })
    expect(res.status).toBe(200)
    expect((res.json as PublishStatus).state).toBe('publishing')
    expect(status().run?.step).toBe(1)

    tick(MOCK_STEP_MS[1] + 10)
    let s = status()
    expect(s.run?.step).toBe(2)
    expect(s.pending.content).toHaveLength(0) // le contenu est en ligne
    expect(s.pending.total).toBe(1)

    tick(MOCK_STEP_MS[2])
    expect(status().run?.step).toBe(3)
    tick(MOCK_STEP_MS[3] + MOCK_STEP_MS[4])
    s = status()
    expect(s.state).toBe('published')
    expect(s.pending.total).toBe(0)
    expect(s.run?.finishedAt).toBeDefined()
    expect(s.run?.steps.every((x) => x.status === 'done')).toBe(true)

    const versions = call('GET', 'versions').json as { publications: Publication[] }
    expect(versions.publications[0]).toMatchObject({ number: 14, status: 'live', by: 'Marie (Client admin)' })
    expect(versions.publications[0].deployUrl).toMatch(/vercel\.app$/)
    expect(versions.publications.filter((p) => p.status === 'live')).toHaveLength(1)
  })

  it('QA-4 · mode de déploiement : local par défaut (note, étape 3 sautée, pas d’URL), vercel-hook pour hosted / failed / pending-fails', () => {
    const { call, status, tick } = setup('pending')
    expect(status().deploy).toEqual({ mode: 'local', note: MOCK_LOCAL_NOTE })
    call('POST', 'publish', { expected: expected(status()) })
    tick(MOCK_STEP_MS[1] + MOCK_STEP_MS[2] + MOCK_STEP_MS[4] + 10)
    const s = status()
    expect(s.state).toBe('published')
    expect(s.run?.steps.find((x) => x.step === 3)).toMatchObject({ status: 'skipped', detail: MOCK_LOCAL_STEP3 })
    const { publications } = call('GET', 'versions').json as { publications: Publication[] }
    expect(publications[0]).toMatchObject({ number: 14, status: 'live', note: 'Local mode: not deployed.' })
    expect(publications[0].deployUrl).toBeUndefined()

    for (const scenario of ['hosted', 'failed', 'pending-fails'] as const) {
      expect(setup(scenario).status().deploy.mode).toBe('vercel-hook')
    }
    for (const scenario of ['idle', 'content-only', 'empty', 'published', 'publishing'] as const) {
      expect(setup(scenario).status().deploy.mode).toBe('local')
    }
  })

  it('contenu seul : étapes 2 et 3 sautées, en ligne en quelques secondes', () => {
    const { call, status, tick } = setup('content-only')
    call('POST', 'publish', { expected: expected(status()) })
    tick(MOCK_STEP_MS[1] + MOCK_STEP_MS[4] + 10)
    const s = status()
    expect(s.state).toBe('published')
    expect(s.run?.steps.map((x) => x.status)).toEqual(['done', 'skipped', 'skipped', 'done'])
  })

  it('409 conflict si la liste affichée a changé ; 400 si rien à publier ; 409 pendant une publication', () => {
    const { call, status } = setup()
    const res = call('POST', 'publish', { expected: ['dockSchedulingPage'] })
    expect(res.status).toBe(409)
    expect(res.json).toMatchObject({ error: { code: 'conflict' } })
    expect(call('POST', 'publish', { expected: 'x' }).status).toBe(400)
    call('POST', 'publish', { expected: expected(status()) })
    expect(call('POST', 'publish', { expected: [] }).json).toMatchObject({ error: { code: 'publishing' } })
    expect(call('POST', 'publish/discard', { kind: 'design', changeId: 'chg-hero-title-size' }).status).toBe(409)
    const idle = setup('idle')
    expect(idle.call('POST', 'publish', { expected: [] }).json).toMatchObject({ error: { code: 'bad_request', message: 'Nothing to publish.' } })
  })

  it('échec au build puis Retry : reprend à l’étape en échec et complète la publication en échec', () => {
    const { call, status, tick } = setup('pending-fails')
    call('POST', 'publish', { expected: expected(status()) })
    tick(MOCK_STEP_MS[1] + MOCK_STEP_MS[2] + MOCK_STEP_MS[3] + 10)
    let s = status()
    expect(s.state).toBe('failed')
    expect(s.run?.error?.message).toMatch(/build failed/i)
    expect(s.run?.error?.log).toBeTruthy()
    expect(s.pending.total).toBe(1) // le contenu est déjà en ligne, le design attend
    let versions = call('GET', 'versions').json as { publications: Publication[] }
    expect(versions.publications[0].status).toBe('failed')

    expect(call('POST', 'publish/retry').status).toBe(200)
    expect(status().run?.step).toBe(3)
    tick(MOCK_STEP_MS[3] + MOCK_STEP_MS[4] + 10)
    s = status()
    expect(s.state).toBe('published')
    versions = call('GET', 'versions').json as { publications: Publication[] }
    expect(versions.publications[0]).toMatchObject({ status: 'live', number: 14 })
    expect(call('POST', 'publish/retry').status).toBe(409)
  })

  it('scénarios figés pour les captures : publishing (step 2 / 4), published, failed', () => {
    const p = setup('publishing')
    p.tick(60_000)
    expect(p.status()).toMatchObject({ state: 'publishing', run: { step: 2 } })
    const done = setup('published')
    done.tick(60_000)
    const s = done.status()
    expect(s.state).toBe('published')
    expect(Date.parse(s.run!.finishedAt!)).toBeGreaterThan(Date.parse(s.run!.startedAt))
    expect(setup('failed').status()).toMatchObject({ state: 'failed', run: { step: 3 } })
  })

  it('discard : retire l’élément ; 404 s’il n’existe plus', () => {
    const { call } = setup()
    const res = call('POST', 'publish/discard', { kind: 'content', id: 'dockSchedulingPage' })
    expect((res.json as PublishStatus).pending.total).toBe(2)
    expect(call('POST', 'publish/discard', { kind: 'content', id: 'dockSchedulingPage' }).status).toBe(404)
    expect(call('POST', 'publish/discard', { kind: 'other' }).status).toBe(400)
  })

  it('diff : modification connue ; 404 sinon', () => {
    const { call } = setup()
    expect(call('GET', 'publish/diff/chg-hero-title-size').json).toMatchObject({ diff: expect.stringContaining('+  font: var(--text-heading-xl);') })
    expect(call('GET', 'publish/diff/chg-unknown').status).toBe(404)
  })

  it('versions : 12 publications du Figma, la plus récente en haut, Live / Failed / first delivery', () => {
    const { call } = setup()
    const { publications, rollback } = call('GET', 'versions').json as { publications: Publication[]; rollback: { available: boolean } }
    expect(publications).toHaveLength(12)
    expect(publications.map((p) => p.number)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
    expect(publications[0].status).toBe('live')
    expect(publications[2].status).toBe('failed')
    expect(publications.find((p) => p.number === 5)?.note).toBe('first delivery')
    expect(publications[1].commit?.slice(0, 7)).toBe('7f3c2a1')
    expect(rollback.available).toBe(false)
  })

  it('retour arrière : 501 en mode local ; permis en mode hébergé', () => {
    const local = setup()
    const res = local.call('POST', 'versions/12/rollback')
    expect(res.status).toBe(501)
    expect(res.json).toMatchObject({ error: { code: 'not_implemented' } })

    const hosted = setup('hosted')
    expect(hosted.call('POST', 'versions/99/rollback').status).toBe(404)
    expect(hosted.call('POST', 'versions/11/rollback').status).toBe(409) // build en échec
    const ok = hosted.call('POST', 'versions/12/rollback')
    expect(ok.status).toBe(200)
    const { publications } = hosted.call('GET', 'versions').json as { publications: Publication[] }
    expect(publications.find((p) => p.number === 12)?.status).toBe('live')
    expect(publications.find((p) => p.number === 13)?.status).toBe('rolled-back')
  })

  it('offline : 502 partout ; empty : aucune version', () => {
    expect(setup('offline').call('GET', 'publish/status').status).toBe(502)
    const empty = setup('empty')
    expect((empty.call('GET', 'versions').json as { publications: Publication[] }).publications).toEqual([])
    expect(empty.status().state).toBe('idle')
  })

  it('FOLLOWUPS #32 · Design de E1 alimenté par les modifications validées de l’éditeur simulé, retirées une fois publiées', () => {
    const editor = fakeEditor()
    const { call, status, tick } = setup('idle', editor.port)
    expect(status().pending.total).toBe(0)
    editor.state.validated.push(EDITOR_CHANGE)
    let s = status()
    expect(s).toMatchObject({ state: 'pending', pending: { total: 1, lastValidatedAt: EDITOR_CHANGE.validatedAt } })
    expect(s.pending.design).toEqual([EDITOR_CHANGE])
    expect(status().pending.design).toHaveLength(1) // pas de doublon à la lecture suivante

    call('POST', 'publish', { expected: expected(s) })
    tick(MOCK_STEP_MS[1] + MOCK_STEP_MS[2] + MOCK_STEP_MS[4] + 10)
    s = status()
    expect(s.state).toBe('published')
    expect(s.pending.total).toBe(0)
    expect(editor.state.cleared).toEqual(['chg-editor-1'])
    const { publications } = call('GET', 'versions').json as { publications: Publication[] }
    expect(publications[0].design).toEqual([{ changeId: 'chg-editor-1', title: EDITOR_CHANGE.title, commit: 'abc1234' }])
  })

  it('FOLLOWUPS #32 · Discard d’une modification de l’éditeur simulé : retirée des deux côtés', () => {
    const editor = fakeEditor()
    editor.state.validated.push(EDITOR_CHANGE)
    const { call, status } = setup('pending', editor.port)
    expect(status().pending.total).toBe(4) // Figma (2 + 1) + celle de l'éditeur
    const res = call('POST', 'publish/discard', { kind: 'design', changeId: 'chg-editor-1' })
    expect((res.json as PublishStatus).pending.total).toBe(3)
    expect(editor.state.cleared).toEqual(['chg-editor-1'])
    expect(status().pending.total).toBe(3)
  })

  it('AI-05 · verrou croisé : 409 busy / awaiting_validation pour Publish, Retry et Discard tant que l’éditeur n’est pas libre', () => {
    const editor = fakeEditor()
    const { call, status } = setup('pending', editor.port)
    const list = expected(status())
    editor.state.blocker = 'busy'
    const busy = call('POST', 'publish', { expected: list })
    expect(busy.status).toBe(409)
    expect(busy.json).toMatchObject({ error: { code: 'busy', message: MOCK_BUSY_MESSAGE } })
    expect(call('POST', 'publish/discard', { kind: 'content', id: 'dockSchedulingPage' }).json).toMatchObject({ error: { code: 'busy' } })
    expect(call('POST', 'publish/retry').json).toMatchObject({ error: { code: 'busy' } })

    editor.state.blocker = 'awaiting_validation'
    const awaiting = call('POST', 'publish', { expected: list })
    expect(awaiting.status).toBe(409)
    expect(awaiting.json).toMatchObject({ error: { code: 'awaiting_validation', message: MOCK_AWAITING_MESSAGE } })
    expect(call('POST', 'publish/discard', { kind: 'content', id: 'dockSchedulingPage' }).json).toMatchObject({ error: { code: 'awaiting_validation' } })
    expect(status().state).toBe('pending') // rien n'est parti

    editor.state.blocker = null
    expect(call('POST', 'publish', { expected: list }).status).toBe(200)
  })

  it('stage / unstage : dépublier ou supprimer au prochain Publish (PendingContentItem.action)', () => {
    const { call, status, tick } = setup('pending')
    // Document publié sans brouillon : une ligne apparaît.
    let res = call('POST', 'publish/stage', { kind: 'unpublish', id: 'post-old' })
    expect(res.status).toBe(200)
    let s = res.json as PublishStatus
    expect(s.pending.total).toBe(4)
    expect(s.pending.content.find((c) => c.id === 'post-old')).toMatchObject({ action: 'unpublish', path: 'post-old', author: 'Marie' })
    // Document avec brouillon en attente : la ligne change d'action, unstage la rend telle qu'avant.
    res = call('POST', 'publish/stage', { kind: 'delete', id: 'post-demo-carrier-portals-a-checklist' })
    s = res.json as PublishStatus
    const staged = s.pending.content.find((c) => c.id === 'post-demo-carrier-portals-a-checklist')
    expect(staged).toMatchObject({ action: 'delete', path: 'Blog › Carrier portals: a checklist' })
    expect(s.pending.total).toBe(4)
    s = call('POST', 'publish/unstage', { id: 'post-demo-carrier-portals-a-checklist' }).json as PublishStatus
    const back = s.pending.content.find((c) => c.id === 'post-demo-carrier-portals-a-checklist')
    expect(back?.action).toBeUndefined()
    expect(back?.summary).toBe('Body and excerpt edited')
    expect(call('POST', 'publish/unstage', { id: 'post-demo-carrier-portals-a-checklist' }).status).toBe(404)
    // Entrées refusées.
    expect(call('POST', 'publish/stage', { kind: 'publish', id: 'x' }).status).toBe(400)
    expect(call('POST', 'publish/stage', { kind: 'delete', id: 'drafts.x' }).status).toBe(400)
    expect(call('POST', 'publish/stage', { kind: 'delete', id: '../x' }).status).toBe(400)
    // Publiée avec le reste : la ligne disparaît à l'étape 1 et figure dans la version.
    call('POST', 'publish', { expected: expected(status()) })
    expect(call('POST', 'publish/stage', { kind: 'delete', id: 'post-other' }).json).toMatchObject({ error: { code: 'publishing' } })
    tick(MOCK_STEP_MS[1] + 10)
    expect(status().pending.content).toHaveLength(0)
    tick(MOCK_STEP_MS[2] + MOCK_STEP_MS[4])
    expect(status().state).toBe('published')
    expect(call('POST', 'publish/unstage', { id: 'post-old' }).status).toBe(404)
    const { publications } = call('GET', 'versions').json as { publications: Publication[] }
    expect(publications[0].content.map((c) => c.id)).toContain('post-old')
  })

  it('stage puis unstage d’un document sans brouillon : la ligne disparaît', () => {
    const { call } = setup('idle')
    call('POST', 'publish/stage', { kind: 'delete', id: 'post-old' })
    const s = call('POST', 'publish/unstage', { id: 'post-old' }).json as PublishStatus
    expect(s).toMatchObject({ state: 'idle', pending: { total: 0 } })
  })

  it('monde d’une forme plus ancienne (rechargement à chaud) : reconstruit avec son scénario, sans champ manquant', () => {
    type Holder = NonNullable<NonNullable<Parameters<typeof createPublishMock>[0]>['holder']>
    const holder = { world: { scenario: 'idle', content: [], design: [] } } as unknown as Holder
    const mock = createPublishMock({ holder })
    expect(mock.scenario()).toBe('idle')
    const res = mock.handle({ method: 'POST', segments: ['publish', 'stage'], params: {}, query: new URLSearchParams(), body: { kind: 'delete', id: 'post-old' }, user: USER })
    expect(res.status).toBe(200)
    expect((res as { json: PublishStatus }).json.deploy.mode).toBe('local')
  })

  it('setScenario remet la simulation à zéro', () => {
    const { mock, status } = setup()
    mock.setScenario('idle')
    expect(mock.scenario()).toBe('idle')
    expect(status().pending.total).toBe(0)
  })
})
