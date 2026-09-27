import { describe, expect, it } from 'vitest'

import { formatCost, formatTokens } from '@/admin/core/contracts/format'

import { parseUsageDocs, periodStart, roundCost, summarizeUsage, usageRows, type UsageDoc } from './aggregate'

/**
 * Jeu de données de TEST uniquement (jamais écrit dans Sanity) : un journal fictif autour du 27/09/2026.
 */
const NOW = new Date('2026-09-27T12:00:00Z')

let seq = 0
function doc(partial: Partial<UsageDoc> & Pick<UsageDoc, 'feature' | 'createdAt' | 'model'>): Record<string, unknown> {
  seq += 1
  return {
    _id: `aiUsage.r${seq}`,
    inputTokens: 1000,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0.01,
    costKind: 'billed',
    status: 'done',
    user: { id: 'u1', name: 'Marie', role: 'client' },
    ...partial,
  }
}

const RAW = [
  // Septembre 2026 (ce mois-ci)
  doc({ feature: 'editor', createdAt: '2026-09-27T14:12:00Z', model: 'claude-sonnet-5', inputTokens: 39_100, outputTokens: 2_700, costUsd: 0.16 }),
  doc({ feature: 'ask', createdAt: '2026-09-27T14:05:00Z', model: 'claude-haiku-4-5-20251001', inputTokens: 2_100, outputTokens: 240, costUsd: 0.003 }),
  doc({ feature: 'editor', createdAt: '2026-09-01T00:00:00Z', model: 'claude-opus-5-5', inputTokens: 24_600, outputTokens: 1_900, costUsd: 0.1, costKind: 'estimated' }),
  // Août et juillet (3 derniers mois)
  doc({ feature: 'ask', createdAt: '2026-08-15T10:00:00Z', model: 'claude-haiku-4-5-20251001', inputTokens: 3_400, outputTokens: 310, costUsd: 0.005 }),
  doc({ feature: 'editor', createdAt: '2026-07-01T00:00:00Z', model: 'claude-sonnet-5', inputTokens: 33_800, outputTokens: 2_600, costUsd: 0.14 }),
  // Juin (hors 3 mois)
  doc({ feature: 'editor', createdAt: '2026-06-30T23:59:59Z', model: 'claude-sonnet-5', inputTokens: 10_000, outputTokens: 1_000, costUsd: 0.2 }),
]

describe('parseUsageDocs', () => {
  it('garde les documents valides et ignore les mal formés', () => {
    const docs = parseUsageDocs([
      ...RAW,
      { _id: 'drafts.aiUsage.x', feature: 'editor', createdAt: '2026-09-02T00:00:00Z', model: 'm' },
      { _id: 'aiUsage.bad-feature', feature: 'other', createdAt: '2026-09-02T00:00:00Z', model: 'm' },
      { _id: 'aiUsage.bad-date', feature: 'ask', createdAt: 'yesterday', model: 'm' },
      null,
      'nope',
    ])
    expect(docs).toHaveLength(RAW.length)
  })

  it('remplace les nombres invalides par 0 et le rôle inconnu par client', () => {
    const [d] = parseUsageDocs([
      { _id: 'aiUsage.z', feature: 'ask', createdAt: '2026-09-02T00:00:00Z', model: 'm', inputTokens: -5, outputTokens: 'x', costUsd: Number.NaN, user: { id: 'u', name: 'P', role: 'viewer' } },
    ])
    expect(d.inputTokens).toBe(0)
    expect(d.outputTokens).toBe(0)
    expect(d.costUsd).toBe(0)
    expect(d.user.role).toBe('client')
  })

  it('refuse autre chose qu’un tableau', () => {
    expect(parseUsageDocs(null)).toEqual([])
    expect(parseUsageDocs({})).toEqual([])
  })
})

describe('periodStart', () => {
  it('ce mois-ci : 1er du mois en UTC', () => {
    expect(periodStart('month', NOW)?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })
  it('3 derniers mois : le mois courant et les deux précédents', () => {
    expect(periodStart('3-months', NOW)?.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(periodStart('3-months', new Date('2026-02-10T00:00:00Z'))?.toISOString()).toBe('2025-12-01T00:00:00.000Z')
  })
  it('depuis la mise en ligne : aucune borne', () => {
    expect(periodStart('all-time', NOW)).toBeNull()
  })
})

describe('summarizeUsage', () => {
  const docs = parseUsageDocs(RAW)

  it('ce mois-ci : totaux, borne basse incluse', () => {
    const s = summarizeUsage(docs, 'month', NOW)
    expect(s.requests).toBe(3)
    expect(s.totals).toEqual({ inputTokens: 65_800, outputTokens: 4_840, costUsd: 0.263 })
    expect(s.since).toBe('2026-09-01T00:00:00.000Z')
  })

  it('par fonctionnalité : AI editor puis Ask AI, modèle de la demande la plus récente', () => {
    const s = summarizeUsage(docs, 'month', NOW)
    expect(s.byFeature.map((f) => [f.feature, f.label, f.usage.model, f.usage.requests])).toEqual([
      ['editor', 'AI editor', 'claude-sonnet-5', 2],
      ['ask', 'Ask AI', 'claude-haiku-4-5-20251001', 1],
    ])
    expect(s.byFeature[0].usage.costUsd).toBe(0.26)
    expect(s.byFeature[0].usage.costKind).toBe('estimated')
    expect(s.byFeature[1].usage.costKind).toBe('billed')
  })

  it('par modèle : du plus coûteux au moins coûteux, avec les libellés du contrat', () => {
    const s = summarizeUsage(docs, 'month', NOW)
    expect(s.byModel.map((m) => [m.label, m.usage.costUsd])).toEqual([
      ['Sonnet 5', 0.16],
      ['Opus 5.5', 0.1],
      ['Haiku 4.5', 0.003],
    ])
  })

  it('3 derniers mois et depuis la mise en ligne', () => {
    expect(summarizeUsage(docs, '3-months', NOW).requests).toBe(5)
    const all = summarizeUsage(docs, 'all-time', NOW)
    expect(all.requests).toBe(6)
    expect(all.since).toBe('2026-06-30T23:59:59Z')
    expect(formatCost(all.totals.costUsd)).toBe('$0.61')
  })

  it('période vide : totaux à 0, listes vides, pas de « since » pour all-time', () => {
    const s = summarizeUsage([], 'all-time', NOW)
    expect(s).toEqual({ period: 'all-time', totals: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, byFeature: [], byModel: [], requests: 0 })
    expect(summarizeUsage([], 'month', NOW).since).toBe('2026-09-01T00:00:00.000Z')
  })

  it('une seule fonctionnalité utilisée : une seule ligne', () => {
    const only = parseUsageDocs([doc({ feature: 'ask', createdAt: '2026-09-02T00:00:00Z', model: 'claude-haiku-4-5' })])
    expect(summarizeUsage(only, 'month', NOW).byFeature.map((f) => f.label)).toEqual(['Ask AI'])
  })
})

describe('arrondis', () => {
  it('au millionième de dollar, sans reste de flottant', () => {
    expect(roundCost(0.1 + 0.2)).toBe(0.3)
    expect(roundCost(0.0000004)).toBe(0)
    expect(roundCost(1.2345678)).toBe(1.234568)
  })

  it('cumul de nombreux petits coûts', () => {
    const many = parseUsageDocs(
      Array.from({ length: 1000 }, (_, i) => doc({ feature: 'ask', createdAt: `2026-09-${String((i % 26) + 1).padStart(2, '0')}T08:00:00Z`, model: 'claude-haiku-4-5', costUsd: 0.0031, inputTokens: 1234.4, outputTokens: 99.6 })),
    )
    const s = summarizeUsage(many, 'month', NOW)
    expect(s.totals.costUsd).toBe(3.1)
    expect(s.totals.inputTokens).toBe(1_234_400)
    expect(s.totals.outputTokens).toBe(99_600)
    expect(formatTokens(s.totals.inputTokens)).toBe('1.2M')
    expect(formatCost(s.totals.costUsd)).toBe('$3.10')
  })
})

describe('usageRows', () => {
  const docs = parseUsageDocs(RAW)

  it('plus récent en haut, limité, avec le total de la période', () => {
    const { items, total } = usageRows(docs, 'month', NOW, 2)
    expect(total).toBe(3)
    expect(items.map((r) => r.createdAt)).toEqual(['2026-09-27T14:12:00Z', '2026-09-27T14:05:00Z'])
    expect(items[0]).toMatchObject({ featureLabel: 'AI editor', modelLabel: 'Sonnet 5', inputTokens: 39_100, costUsd: 0.16 })
  })

  it('borne la limite (1 à 500) et raccourcit le texte de la demande à 120 caractères (contrat AiUsageDoc.request)', () => {
    const long = parseUsageDocs([doc({ feature: 'editor', createdAt: '2026-09-03T00:00:00Z', model: 'm', request: `  Make\nit ${'x'.repeat(400)}` })])
    const { items } = usageRows(long, 'month', NOW, 0)
    expect(items).toHaveLength(1)
    expect(items[0].request?.startsWith('Make it x')).toBe(true)
    expect([...items[0].request!].length).toBe(120)
    expect(usageRows(docs, 'all-time', NOW, 10_000).items).toHaveLength(6)
  })
})
