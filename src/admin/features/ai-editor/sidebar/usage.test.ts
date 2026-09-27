import { describe, expect, it } from 'vitest'
import { entry, job, usage } from './fixtures'
import { cumulativeUsage, usageByJob } from './usage'

describe('cumulativeUsage — consommation de la conversation', () => {
  it('sans rien : zéro (« 0 input · 0 output · $0.00 »)', () => {
    const u = cumulativeUsage(null, new Map(), new Map(), 'claude-opus-5-5')
    expect(u).toMatchObject({ inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'claude-opus-5-5' })
  })
  it('D3 : 18.2k + 20.9k = 39.1k input, $0.07 + $0.09 = $0.16', () => {
    const first = usage(18_200, 1_100, 0.07)
    const loaded = usageByJob([entry(job({ id: 'a', usage: first }))])
    const current = usageByJob([entry(job({ id: 'a', usage: first })), entry(job({ id: 'b', usage: usage(20_900, 1_600, 0.09) }))])
    const u = cumulativeUsage(first, loaded, current, 'claude-opus-5-5')
    expect(u.inputTokens).toBe(39_100)
    expect(u.outputTokens).toBe(2_700)
    expect(u.costUsd).toBeCloseTo(0.16)
  })
  it('une demande déjà comptée n’est jamais additionnée deux fois (même objet ou nouvelle copie)', () => {
    const a = usage(1000, 100, 0.01)
    const loaded = usageByJob([entry(job({ id: 'a', usage: a }))])
    expect(cumulativeUsage(a, loaded, loaded, 'm').inputTokens).toBe(1000)
    const copy = usageByJob([entry(job({ id: 'a', usage: { ...a } }))])
    expect(cumulativeUsage(a, loaded, copy, 'm').inputTokens).toBe(1000)
  })
  it('le cumul du moteur garde les demandes sorties du fil (au-delà des 50 dernières)', () => {
    const base = usage(50_000, 5_000, 0.5)
    const loaded = usageByJob([entry(job({ id: 'a', usage: usage(1000, 100, 0.01) }))])
    const current = usageByJob([entry(job({ id: 'b', usage: usage(2000, 200, 0.02) }))])
    expect(cumulativeUsage(base, loaded, current, 'm').inputTokens).toBe(52_000)
  })
  it('estimé si une demande l’est (demande interrompue) ; jamais négatif', () => {
    const current = usageByJob([entry(job({ id: 'a', usage: usage(10, 1, 0.001, { costKind: 'estimated' }) }))])
    expect(cumulativeUsage(null, new Map(), current, 'm').costKind).toBe('estimated')
    const loaded = usageByJob([entry(job({ id: 'a', usage: usage(10_000, 1, 1) }))])
    expect(cumulativeUsage(null, loaded, current, 'm').inputTokens).toBe(0)
  })
})
