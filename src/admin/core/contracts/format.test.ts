import { describe, expect, it } from 'vitest'

import { costSplit, describeCost, formatCostShort, formatIncluded, formatUsageLine, isIncluded, sumCosts } from './format'

/**
 * Coût FACTURÉ / INCLUS (abonnement Claude, `Usage.access`) : règles partagées par B5, B1, l'éditeur IA et Ask AI.
 * Une demande passée par l'abonnement (moteur local) a un coût calculé au prix de l'API mais n'est pas facturée.
 */

describe('costSplit — une demande (`access`) ou un cumul (`includedUsd`)', () => {
  it('une demande : facturée (clé API, none, ancien document sans access), incluse seulement par l’abonnement', () => {
    expect(costSplit({ costUsd: 0.18, access: 'subscription' })).toEqual({ billedUsd: 0, includedUsd: 0.18 })
    expect(costSplit({ costUsd: 0.02, access: 'api-key' })).toEqual({ billedUsd: 0.02, includedUsd: 0 })
    expect(costSplit({ costUsd: 0.02, access: 'none' })).toEqual({ billedUsd: 0.02, includedUsd: 0 })
    expect(costSplit({ costUsd: 0.02 })).toEqual({ billedUsd: 0.02, includedUsd: 0 })
    expect(isIncluded({ access: 'subscription' })).toBe(true)
    expect(isIncluded({ access: null })).toBe(false)
  })

  it('un cumul : `costUsd` = part facturée, `includedUsd` = part incluse ; `access` ignoré', () => {
    expect(costSplit({ costUsd: 0.1, includedUsd: 0.3, access: 'subscription' })).toEqual({ billedUsd: 0.1, includedUsd: 0.3 })
    expect(costSplit({ costUsd: 0.1, includedUsd: 0, access: 'subscription' })).toEqual({ billedUsd: 0.1, includedUsd: 0 })
  })

  it('jamais négatif ni NaN ; somme séparée', () => {
    expect(costSplit({ costUsd: Number.NaN, access: 'subscription' })).toEqual({ billedUsd: 0, includedUsd: 0 })
    expect(costSplit({ costUsd: -1, includedUsd: -2 })).toEqual({ billedUsd: 0, includedUsd: 0 })
    const sum = sumCosts([
      { costUsd: 0.02, access: 'api-key' },
      { costUsd: 0.18, access: 'subscription' },
      { costUsd: 0.12, access: 'subscription' },
      { costUsd: 0.05, includedUsd: 0.01 },
    ])
    expect(sum.billedUsd).toBeCloseTo(0.07)
    expect(sum.includedUsd).toBeCloseTo(0.31)
  })
})

describe('formats du coût', () => {
  it('court : facturé, estimé, inclus, les deux', () => {
    expect(formatCostShort({ costUsd: 0.0712 })).toBe('$0.07')
    expect(formatCostShort({ costUsd: 0.39, costKind: 'estimated' })).toBe('~$0.39')
    expect(formatCostShort({ costUsd: 0.18, access: 'subscription', costKind: 'estimated' })).toBe('Included')
    expect(formatCostShort({ costUsd: 0, includedUsd: 0.3 })).toBe('Included')
    expect(formatCostShort({ costUsd: 0.1, includedUsd: 0.3 })).toBe('$0.10 + included')
    expect(formatCostShort({ costUsd: 0, includedUsd: 0 })).toBe('$0.00')
  })

  it('long (infobulle, lecteurs d’écran) et part incluse', () => {
    expect(describeCost({ costUsd: 0.07 })).toBe('$0.07')
    expect(describeCost({ costUsd: 0.5, costKind: 'estimated' })).toBe('~$0.50 (estimated)')
    expect(describeCost({ costUsd: 0.18, access: 'subscription' })).toBe('included in your Claude subscription (≈ $0.18 at API prices)')
    expect(describeCost({ costUsd: 0.1, includedUsd: 0.3 })).toBe('$0.10 billed + ≈ $0.30 at API prices, included in your Claude subscription')
    expect(formatIncluded(0.3)).toBe('≈ $0.30 at API prices — included in your Claude subscription')
  })

  it('ligne complète de ModelUsage', () => {
    expect(formatUsageLine({ inputTokens: 18_240, outputTokens: 1_100, costUsd: 0.0712 })).toBe('18.2k input · 1.1k output · $0.07')
    expect(formatUsageLine({ inputTokens: 120_000, outputTokens: 2_800, costUsd: 0.39, access: 'subscription' })).toBe(
      '120k input · 2.8k output · included in your Claude subscription (≈ $0.39 at API prices)',
    )
  })
})
