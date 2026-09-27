import { describe, expect, it } from 'vitest'

import type { Publication, PublishStatus } from '../../contracts/engine'
import type { EngineUser } from '../../contracts/session'
import { createPublishMock, isMockPublishScenario, MOCK_PUBLISH_SCENARIOS, MOCK_STEP_MS, type MockPublishScenario } from './publish'
import type { MockEngineRequest } from './types'

const USER: EngineUser = { id: 'u1', name: 'Marie', email: 'marie@conduit.test', role: 'client' }

function setup(scenario: MockPublishScenario = 'pending') {
  let now = new Date(2026, 8, 26, 14, 0).getTime()
  const mock = createPublishMock({ now: () => now, scenario, holder: {} })
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

  it('publication complète : étapes 1 → 4 dans le temps, contenu d’abord, puis publiée et nouvelle version en ligne', () => {
    const { call, status, tick } = setup()
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
    expect(versions.publications.filter((p) => p.status === 'live')).toHaveLength(1)
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

  it('l’éditeur simulé peut ajouter une modification validée (compteur de « added to Publish »)', () => {
    const { mock, status } = setup('idle')
    const total = mock.addDesignChange({ changeId: 'chg-x', commit: 'abc', title: 'Hero · Eyebrow — color', validatedBy: 'Marie', validatedAt: new Date().toISOString(), files: [] })
    expect(total).toBe(1)
    expect(status()).toMatchObject({ state: 'pending', pending: { total: 1 } })
  })

  it('setScenario remet la simulation à zéro', () => {
    const { mock, status } = setup()
    mock.setScenario('idle')
    expect(mock.scenario()).toBe('idle')
    expect(status().pending.total).toBe(0)
  })
})
