import { afterEach, describe, expect, it } from 'vitest'

import { handleClaude, resetClaudeMock } from './claude'
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
