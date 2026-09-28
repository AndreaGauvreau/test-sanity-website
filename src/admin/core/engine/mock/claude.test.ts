import { afterEach, describe, expect, it } from 'vitest'

import { handleClaude, mockAiSettings, resetClaudeMock } from './claude'
import { mockEditorHealth } from './editor'
import { handleMockEngineRequest } from './index'
import type { MockEngineRequest } from './types'

/** Connexion à Claude simulée (ENGINE_MOCK=1) : mêmes règles que le moteur, la clé ne revient jamais. Clés de TEST. */

const KEY = `sk-ant-api03-${'M0ck'.repeat(22)}-LAST`
const user = { id: 'u', name: 'U', email: 'u@test', role: 'client' as const }
const req = (method: 'GET' | 'POST', path: string, body?: unknown): MockEngineRequest => ({
  method,
  segments: path.split('/'),
  params: {},
  query: new URLSearchParams(),
  body,
  user,
})

afterEach(() => resetClaudeMock())

describe('mock /claude/access', () => {
  it('clé enregistrée → indice seulement ; test simulé ; clear', async () => {
    resetClaudeMock('local')
    const saved = await handleClaude(req('POST', 'claude/access', { kind: 'api-key', apiKey: KEY }))
    expect(JSON.stringify(saved)).not.toContain(KEY)
    expect(saved).toMatchObject({ status: 200, json: { access: 'api-key', source: 'stored', keyHint: 'sk-ant-…LAST' } })
    expect(await handleClaude(req('POST', 'claude/access/test', {}))).toMatchObject({ json: { lastTest: { ok: true } } })
    expect(await handleClaude(req('POST', 'claude/access/clear', {}))).toMatchObject({ json: { access: 'none' } })
  })

  it('hébergé : abonnement refusé (403) ; sk-ant-oat refusé (400)', async () => {
    resetClaudeMock('hosted')
    expect(await handleClaude(req('POST', 'claude/access', { kind: 'subscription' }))).toMatchObject({ status: 403 })
    expect(await handleClaude(req('POST', 'claude/access', { kind: 'api-key', apiKey: `sk-ant-oat01-${'x'.repeat(95)}` }))).toMatchObject({ status: 400 })
  })
})

describe('mock /claude/settings (réglages de l’IA)', () => {
  it('valeurs par défaut du contrat, enregistrement, relecture ; plus de champ askModel (Ask AI suit les réglages)', async () => {
    expect(await handleClaude(req('GET', 'claude/settings'))).toEqual({
      status: 200,
      json: { current: { model: 'claude-opus-5-5', effort: 'medium' }, defaults: { model: 'claude-opus-5-5', effort: 'medium' }, source: 'default' },
    })
    const saved = await handleClaude(req('POST', 'claude/settings', { model: 'claude-sonnet-5', effort: 'xhigh' }))
    expect(saved).toMatchObject({ status: 200, json: { current: { model: 'claude-sonnet-5', effort: 'xhigh' }, source: 'saved', updatedAt: expect.any(String) } })
    expect(await handleClaude(req('GET', 'claude/settings'))).toMatchObject({ json: { current: { model: 'claude-sonnet-5', effort: 'xhigh' } } })
  })

  it('Haiku 4.5 accepté (effort gardé) ; santé simulée : le modèle en cours pour l’éditeur ET Ask AI', async () => {
    expect(mockEditorHealth().claude).toMatchObject({ editorModel: 'claude-opus-5-5', askModel: 'claude-opus-5-5' })
    const saved = await handleClaude(req('POST', 'claude/settings', { model: 'claude-haiku-4-5', effort: 'high' }))
    expect(saved).toMatchObject({ status: 200, json: { current: { model: 'claude-haiku-4-5', effort: 'high' }, source: 'saved' } })
    expect(mockAiSettings()).toEqual({ model: 'claude-haiku-4-5', effort: 'high' })
    // GET /health simulé (répartiteur) = santé de l'éditeur simulé : le même modèle partout.
    const health = await handleMockEngineRequest(req('GET', 'health'))
    expect(health).toMatchObject({ status: 200, json: { claude: { editorModel: 'claude-haiku-4-5', askModel: 'claude-haiku-4-5' } } })
  })

  it('validation stricte comme le moteur : 400 sans rien changer', async () => {
    for (const body of [{ model: 'claude-opus-5', effort: 'high' }, { model: 'claude-sonnet-5', effort: 'huge' }, { model: 'claude-sonnet-5', effort: 'low', extra: 1 }, null]) {
      expect(await handleClaude(req('POST', 'claude/settings', body))).toMatchObject({ status: 400, json: { error: { code: 'bad_request' } } })
    }
    expect(await handleClaude(req('GET', 'claude/settings'))).toMatchObject({ json: { source: 'default' } })
  })
})
