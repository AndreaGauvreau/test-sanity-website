import { afterEach, describe, expect, it } from 'vitest'
import type { AskResponse, EngineUser } from '../../contracts'
import { createAskMock, MOCK_CUT_OFF, MOCK_DECLINED, MOCK_REFUSAL } from './ask'
import { handleClaude, resetClaudeMock } from './claude'
import { handleMockEngineRequest } from './index'
import type { MockEngineRequest } from './types'

const CLIENT: EngineUser = { id: 'dev-client', name: 'Dev', email: 'dev@conduit.test', role: 'client' }
const mock = createAskMock({ delay: async () => {} })

function request(body: unknown, user: EngineUser = CLIENT): MockEngineRequest {
  return { method: 'POST', segments: ['ask'], params: {}, query: new URLSearchParams(), body, user }
}

async function ask(body: unknown, user?: EngineUser) {
  const res = await mock(request(body, user))
  return res as { status: number; json: AskResponse & { error?: { code: string; message: string } } }
}

/** Réglages de l'IA simulés (B5 · AI settings), comme depuis la carte. */
const choose = (model: string, effort = 'medium') =>
  handleClaude({ method: 'POST', segments: ['claude', 'settings'], params: {}, query: new URLSearchParams(), body: { model, effort }, user: CLIENT })

afterEach(() => resetClaudeMock())

describe('Ask AI simulé', () => {
  it('question → réponse du Figma, liens du catalogue, consommation plausible au modèle EN COURS (Opus 5.5 par défaut)', async () => {
    const res = await ask({ question: 'Where is the hero image used?', history: [] })
    expect(res.status).toBe(200)
    expect(res.json.answer).toBe('On Home › Hero (background) and on the post “How to cut dock wait times” (cover).')
    expect(res.json.links).toEqual([
      { label: 'Open Media', href: '/admin/media' },
      { label: 'Open Home', href: '/admin/pages/home' },
    ])
    expect(res.json.usage).toMatchObject({ model: 'claude-opus-5-5', costKind: 'billed' })
    expect(res.json.usage.inputTokens).toBeGreaterThan(2000)
    // Opus 5.5 réfléchit (medium) : sortie plus longue, 4 $ / 20 $ par million.
    expect(res.json.usage.outputTokens).toBeGreaterThan(500)
    expect(res.json.usage.costUsd).toBeGreaterThan(0.01)
    expect(res.json.usage.costUsd).toBeLessThan(0.05)
  })

  it('suit le modèle choisi, à chaud : Haiku 4.5 (sans réflexion, 1 $ / 5 $), puis Fable 5.1 · Max', async () => {
    expect((await choose('claude-haiku-4-5', 'max')).status).toBe(200)
    const haiku = await ask({ question: 'Where is the hero image used?', history: [] })
    expect(haiku.json.usage.model).toBe('claude-haiku-4-5')
    expect(haiku.json.usage.outputTokens).toBeLessThan(300)
    expect(haiku.json.usage.costUsd).toBeGreaterThan(0.002)
    expect(haiku.json.usage.costUsd).toBeLessThan(0.005)
    await choose('claude-fable-5-1', 'max')
    const fable = await ask({ question: 'Where is the hero image used?', history: [] })
    expect(fable.json.usage.model).toBe('claude-fable-5-1')
    expect(fable.json.usage.outputTokens).toBeGreaterThan(2800)
  })

  it('« [mock:refusal] » / « [mock:cut] » : messages du vrai moteur, aucun lien, consommation comptée (plafond par modèle)', async () => {
    const declined = await ask({ question: '[mock:refusal] why?' })
    expect(declined.json).toMatchObject({ answer: MOCK_DECLINED, links: [], refusedChange: false })
    const cut = await ask({ question: '[mock:cut] tell me everything' })
    expect(cut.json).toMatchObject({ answer: MOCK_CUT_OFF, links: [] })
    expect(cut.json.usage.outputTokens).toBe(16_000)
    await choose('claude-haiku-4-5')
    expect((await ask({ question: '[mock:cut] again' })).json.usage.outputTokens).toBe(1_024)
  })

  it('demande de modification → refus du Figma + « Open Home in AI editor »', async () => {
    const res = await ask({ question: 'Change the hero title to “Docks, solved.”', history: [], screen: '/admin/cms/blog' })
    expect(res.json).toMatchObject({ answer: MOCK_REFUSAL, refusedChange: true, links: [{ label: 'Open Home in AI editor', href: '/admin/editor?page=home' }] })
  })

  it('« How do I change the favicon? » est une question, pas une modification', async () => {
    const res = await ask({ question: 'How do I change the favicon?' })
    expect(res.json.refusedChange).toBe(false)
    expect(res.json.links).toEqual([{ label: 'Open General', href: '/admin/settings/general' }])
  })

  it('liens filtrés par rôle : Code retiré pour le client', async () => {
    const client = await ask({ question: 'Where are the analytics scripts?' })
    expect(client.json.links).toEqual([])
    const kuartz = await ask({ question: 'Where are the analytics scripts?' }, { ...CLIENT, role: 'kuartz' })
    expect(kuartz.json.links).toEqual([{ label: 'Open Code', href: '/admin/settings/code' }])
  })

  it('mêmes limites que le moteur ; déclencheur d’erreur de développement', async () => {
    expect((await ask({ question: '' })).status).toBe(400)
    expect((await ask({ question: 'x'.repeat(1001) })).status).toBe(400)
    expect((await ask({ question: 'x', history: Array.from({ length: 11 }, () => ({ role: 'user', text: 'y' })) })).status).toBe(400)
    const error = await ask({ question: '[mock:error] please' })
    expect([error.status, error.json.error?.code]).toEqual([503, 'unavailable'])
  })

  it('branché dans le répartiteur du moteur simulé', async () => {
    const res = await handleMockEngineRequest({ ...request({ question: '[mock:error]' }) })
    expect(res.status).toBe(503)
  })
})
