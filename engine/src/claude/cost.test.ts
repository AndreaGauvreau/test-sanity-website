import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  addCall,
  EMPTY_COST,
  estimateCost,
  meterUsage,
  NO_TOKENS,
  toUsage,
  totalCost,
  usageFromTokens,
  type MeteredCall,
  type Tokens,
} from './cost'
import { AI_MODELS, modelLabel } from '../../../src/admin/core/contracts'
import { PRICES_PER_MTOK, priceOf } from './pricing'

describe('pricing — tarifs par million de jetons (skill claude-api)', () => {
  it('fige les tarifs des trois modèles du moteur', () => {
    assert.deepEqual({ ...PRICES_PER_MTOK['claude-opus-5-5'] }, { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 })
    assert.deepEqual({ ...PRICES_PER_MTOK['claude-sonnet-5'] }, { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 })
    assert.deepEqual({ ...PRICES_PER_MTOK['claude-haiku-4-5-20251001'] }, { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 })
  })

  it('écriture de cache = 1,25 × l’entrée pour chaque modèle', () => {
    for (const [model, price] of Object.entries(PRICES_PER_MTOK)) {
      assert.equal(price.cacheWrite, price.input * 1.25, model)
    }
  })

  it('table gelée, modèle inconnu ou clé héritée : null', () => {
    assert.ok(Object.isFrozen(PRICES_PER_MTOK))
    assert.ok(Object.isFrozen(PRICES_PER_MTOK['claude-opus-5-5']))
    assert.equal(priceOf('claude-unknown'), null)
    assert.equal(priceOf('constructor'), null)
    assert.equal(priceOf('toString'), null)
  })
})

describe('meterUsage — jetons d’un appel interrompu', () => {
  it('compte une fois chaque réponse du modèle, avec son dernier relevé', () => {
    const cached = { cache_read_input_tokens: 5000, cache_creation_input_tokens: 800 }
    const metered = meterUsage([
      { id: 'msg_1', usage: { input_tokens: 100, output_tokens: 10, ...cached } },
      { id: 'msg_1', usage: { input_tokens: 100, output_tokens: 40, ...cached } },
      { id: 'msg_2', usage: { input_tokens: 20, output_tokens: 5, cache_read_input_tokens: null } },
    ])
    assert.equal(metered.turns, 2)
    assert.deepEqual(metered.tokens, { input: 120, output: 45, cacheRead: 5000, cacheWrite: 800 })
  })

  it('aucun message : aucun jeton ; valeurs absurdes ignorées', () => {
    assert.deepEqual(meterUsage([]), { tokens: NO_TOKENS, turns: 0 })
    assert.deepEqual(meterUsage([{ id: 'x', usage: { input_tokens: Number.NaN, output_tokens: -3 } }]).tokens, NO_TOKENS)
  })
})

describe('estimateCost', () => {
  const million = (part: keyof Tokens): Tokens => ({ ...NO_TOKENS, [part]: 1_000_000 })

  it('les trois modèles de B5 · AI settings ont un tarif (coût estimé) et un libellé', () => {
    const expected = { 'claude-opus-5-5': [4, 20], 'claude-fable-5-1': [10, 50], 'claude-sonnet-5': [2, 10] } as const
    for (const model of AI_MODELS) {
      assert.deepEqual([estimateCost(model.id, million('input')), estimateCost(model.id, million('output'))], expected[model.id])
      assert.equal(modelLabel(model.id), model.label)
    }
  })

  it('aux tarifs d’Opus 5.5', () => {
    assert.equal(estimateCost('claude-opus-5-5', million('input')), 4)
    assert.equal(estimateCost('claude-opus-5-5', million('output')), 20)
    assert.equal(estimateCost('claude-opus-5-5', million('cacheRead')), 0.2)
    assert.equal(estimateCost('claude-opus-5-5', million('cacheWrite')), 5)
  })

  it('aux tarifs de Haiku 4.5', () => {
    assert.equal(estimateCost('claude-haiku-4-5-20251001', { input: 2000, output: 1000, cacheRead: 0, cacheWrite: 0 }), 0.007)
  })

  it('modèle inconnu : pas d’estimation (jamais NaN)', () => {
    assert.equal(estimateCost('claude-inconnu', million('input')), null)
    assert.equal(estimateCost('constructor', million('input')), null)
  })
})

describe('addCall — banked / session (session reprise cumulée)', () => {
  const call = (over: Partial<MeteredCall>): MeteredCall => ({
    sessionId: 's1',
    costUsd: 0.05,
    tokens: { input: 100, output: 50, cacheRead: 1000, cacheWrite: 200 },
    turns: 4,
    apiTurns: 4,
    costKind: 'session',
    ...over,
  })

  it('2e essai sur la même session : son total REMPLACE celui du 1er (pas d’addition)', () => {
    let state = addCall(EMPTY_COST, call({}), null)
    assert.equal(totalCost(state), 0.05)
    // La session reprise rapporte le cumul : 0.05 (1er) + 0.03 (2e) = 0.08.
    state = addCall(state, call({ costUsd: 0.08, tokens: { input: 180, output: 90, cacheRead: 2500, cacheWrite: 300 }, turns: 3 }), 's1')
    assert.equal(totalCost(state), 0.08)
    assert.equal(state.turns, 7, 'num_turns est compté par appel : il s’additionne')
    assert.equal(state.estimated, false)
  })

  it('nouvelle session : la précédente passe dans banked', () => {
    let state = addCall(EMPTY_COST, call({}), null)
    state = addCall(state, call({ sessionId: 's2', costUsd: 0.02 }), 's1')
    assert.equal(totalCost(state), 0.07)
  })

  it('appel interrompu (costKind call) : estimé, ajouté à la session acquise', () => {
    let state = addCall(EMPTY_COST, call({}), null)
    state = addCall(state, call({ costUsd: 0.01, costKind: 'call' }), 's1')
    assert.equal(totalCost(state), 0.06)
    assert.equal(state.estimated, true)
  })

  it('coût NaN ou négatif : compté 0', () => {
    const state = addCall(EMPTY_COST, call({ costUsd: Number.NaN, turns: Number.NaN }), null)
    assert.equal(totalCost(state), 0)
    assert.equal(state.turns, 0)
  })
})

describe('toUsage / usageFromTokens — format du contrat', () => {
  it('inputTokens = non cachés + lus + écrits en cache', () => {
    const state = addCall(
      EMPTY_COST,
      { sessionId: 's', costUsd: 0.0712, tokens: { input: 1200, output: 1100, cacheRead: 15000, cacheWrite: 2000 }, turns: 5, apiTurns: 5, costKind: 'session' },
      null,
    )
    assert.deepEqual(toUsage(state, { model: 'claude-opus-5-5', access: 'api-key', durationMs: 24_000.4 }), {
      model: 'claude-opus-5-5',
      inputTokens: 18200,
      outputTokens: 1100,
      cacheReadTokens: 15000,
      cacheWriteTokens: 2000,
      costUsd: 0.0712,
      costKind: 'billed',
      access: 'api-key',
      durationMs: 24000,
      turns: 5,
    })
  })

  it('un appel de l’API Messages est chiffré d’après les tarifs', () => {
    const usage = usageFromTokens({ input: 2000, output: 1000, cacheRead: 0, cacheWrite: 0 }, {
      model: 'claude-haiku-4-5-20251001',
      access: 'api-key',
      durationMs: 800,
    })
    assert.equal(usage.costUsd, 0.007)
    assert.equal(usage.costKind, 'billed')
    const unknown = usageFromTokens(NO_TOKENS, { model: 'claude-x', access: 'api-key', durationMs: 1 })
    assert.equal(unknown.costKind, 'estimated')
    assert.equal(unknown.costUsd, 0)
  })
})
