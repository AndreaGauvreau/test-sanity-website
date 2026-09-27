import { describe, expect, it } from 'vitest'
import type { EngineHealth, Session } from '@/admin/core/contracts'
import { MOCK_HEALTH } from '@/admin/core/engine/mock/health'
import { INFO_MESSAGES, loadAskAiInfo } from './info'

const SESSION: Session = {
  user: { id: 'dev-client', name: 'Dev', email: 'dev@conduit.test' },
  role: 'client',
  sanityRoles: ['administrator'],
  sanityToken: 'sk-user-token-never-leaks',
  dev: true,
  expiresAt: '2026-09-28T00:00:00Z',
}

class AdminAuthError extends Error {
  constructor(readonly status: 401 | 403) {
    super('auth')
    this.name = 'AdminAuthError'
  }
}

describe('loadAskAiInfo (server action du panneau)', () => {
  it('modèle de la santé du moteur + totaux du mois ; jamais le jeton', async () => {
    const info = await loadAskAiInfo({
      requireSession: async () => SESSION,
      health: async () => MOCK_HEALTH,
      monthTotals: async () => ({ inputTokens: 1_200_000, outputTokens: 147_000, costUsd: 4.8 }),
    })
    expect(info).toEqual({ ok: true, userId: 'dev-client', model: 'claude-haiku-4-5-20251001', month: { inputTokens: 1_200_000, outputTokens: 147_000, costUsd: 4.8 } })
    expect(JSON.stringify(info)).not.toContain('sk-user-token')
  })

  it('moteur injoignable ou journal illisible : panneau utilisable sans modèle ni pied', async () => {
    const lines: string[] = []
    const info = await loadAskAiInfo({
      requireSession: async () => SESSION,
      health: async (): Promise<EngineHealth> => Promise.reject(new Error('502')),
      monthTotals: async () => Promise.reject(new Error('sanity down')),
      log: (l) => lines.push(l),
    })
    expect(info).toEqual({ ok: true, userId: 'dev-client', model: null, month: null })
    expect(lines.join()).toContain('month usage unavailable')
  })

  it('droits : session expirée (401) ou droit manquant (403) → message clair', async () => {
    const deps = (status: 401 | 403) => ({
      requireSession: async (): Promise<Session> => Promise.reject(new AdminAuthError(status)),
      health: async () => MOCK_HEALTH,
      monthTotals: async () => ({ inputTokens: 0, outputTokens: 0, costUsd: 0 }),
    })
    expect(await loadAskAiInfo(deps(401))).toEqual({ ok: false, code: 'unauthorized', error: INFO_MESSAGES.unauthorized })
    expect(await loadAskAiInfo(deps(403))).toEqual({ ok: false, code: 'forbidden', error: INFO_MESSAGES.forbidden })
    const crash = await loadAskAiInfo({ ...deps(401), requireSession: async () => Promise.reject(new Error('boom')), log: () => {} })
    expect(crash).toEqual({ ok: false, code: 'internal', error: INFO_MESSAGES.internal })
  })
})
