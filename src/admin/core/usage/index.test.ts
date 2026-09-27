import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * core/usage côté serveur avec un faux Sanity et une fausse session : lecture du journal privé (requête, borne de
 * période), session exigée. Données de TEST en mémoire uniquement.
 */

const state: { session: unknown } = { session: { role: 'client' } }

vi.mock('server-only', () => ({}))
vi.mock('@/admin/core/auth/session', () => ({
  requireSession: async () => {
    if (!state.session) throw Object.assign(new Error('Your session has expired.'), { status: 401 })
    return state.session
  },
}))
const clientFetch = vi.fn()
vi.mock('@/admin/core/sanity/clients', () => ({
  getReadClient: (options: { perspective?: string }) => {
    if (options.perspective !== 'raw') throw new Error('perspective raw attendue')
    return { fetch: clientFetch }
  },
}))

const { getUsageOverview, getUsageSummary, listUsage, USAGE_QUERY } = await import('./index')

const NOW = new Date('2026-09-27T12:00:00Z')
const DOCS = [
  { _id: 'aiUsage.a', feature: 'editor', createdAt: '2026-09-20T10:00:00Z', model: 'claude-sonnet-5', inputTokens: 900_000, outputTokens: 107_000, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 4.3, costKind: 'billed', status: 'done', user: { id: 'u1', name: 'Marie', role: 'client' } },
  { _id: 'aiUsage.b', feature: 'ask', createdAt: '2026-09-21T10:00:00Z', model: 'claude-haiku-4-5-20251001', inputTokens: 300_000, outputTokens: 40_000, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.5, costKind: 'billed', status: 'done', user: { id: 'u2', name: 'Andrea', role: 'kuartz' } },
  { _id: 'aiUsage.c', feature: 'editor', createdAt: '2026-05-02T10:00:00Z', model: 'claude-sonnet-5', inputTokens: 10, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 14.1, costKind: 'billed', status: 'done', user: { id: 'u1', name: 'Marie', role: 'client' } },
]

beforeEach(() => {
  state.session = { role: 'client' }
  clientFetch.mockReset()
})

describe('getUsageSummary', () => {
  it('lit le journal privé avec la borne de la période et agrège', async () => {
    clientFetch.mockResolvedValue(DOCS.slice(0, 2))
    const summary = await getUsageSummary('month', { now: NOW })
    expect(clientFetch).toHaveBeenCalledWith(USAGE_QUERY, { since: '2026-09-01T00:00:00.000Z' })
    expect(summary.totals).toEqual({ inputTokens: 1_200_000, outputTokens: 147_000, costUsd: 4.8, includedUsd: 0 })
    expect(summary.byFeature.map((f) => f.label)).toEqual(['AI editor', 'Ask AI'])
  })

  it('la requête ne vise que les documents publiés aiUsage.* et lit leur accès à Claude', () => {
    expect(USAGE_QUERY).toContain('_id in path("aiUsage.**")')
    expect(USAGE_QUERY).toContain('_type == "aiUsage"')
    expect(USAGE_QUERY).toMatch(/\baccess\b/)
  })

  it('une demande par l’abonnement Claude n’est pas ajoutée au coût facturé', async () => {
    clientFetch.mockResolvedValue([...DOCS.slice(0, 2), { ...DOCS[0], _id: 'aiUsage.sub', costUsd: 0.18, access: 'subscription' }])
    const summary = await getUsageSummary('month', { now: NOW })
    expect(summary.totals).toMatchObject({ costUsd: 4.8, includedUsd: 0.18 })
  })

  it('all-time : aucune borne', async () => {
    clientFetch.mockResolvedValue(DOCS)
    const s = await getUsageSummary('all-time', { now: NOW })
    expect(clientFetch).toHaveBeenCalledWith(USAGE_QUERY, { since: null })
    expect(s.totals.costUsd).toBe(18.9)
    expect(s.since).toBe('2026-05-02T10:00:00Z')
  })

  it('exige une session', async () => {
    state.session = null
    await expect(getUsageSummary('month', { now: NOW, fetch: async () => [] })).rejects.toThrow('expired')
  })

  it('refuse une période inconnue', async () => {
    await expect(getUsageSummary('week' as never, { now: NOW, fetch: async () => [] })).rejects.toThrow('Invalid usage period')
  })
})

describe('listUsage et getUsageOverview', () => {
  it('détail limité', async () => {
    const { items, total } = await listUsage({ period: 'all-time', limit: 2 }, { now: NOW, fetch: async () => DOCS })
    expect(total).toBe(3)
    expect(items.map((r) => r.id)).toEqual(['aiUsage.b', 'aiUsage.a'])
  })

  it('une seule lecture pour tout l’écran B5', async () => {
    const fetch = vi.fn(async () => DOCS)
    const o = await getUsageOverview({ period: 'month' }, { now: NOW, fetch })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(o.summary.requests).toBe(2)
    expect(o.allTime.requests).toBe(3)
    expect(o.rows.total).toBe(2)
  })
})
