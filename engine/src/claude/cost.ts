import type { ClaudeAccess, Usage } from '../../../src/admin/core/contracts'
import { priceOf } from './pricing'

/**
 * Métrage du coût et des jetons d'une demande (porté de `agent.ts` et `job.ts` du POC, tâche 24).
 *
 * Deux sources :
 * - le message `result` du SDK : `total_cost_usd` et `modelUsage`, CUMULÉS depuis le début de la session — une session
 *   reprise (2e essai, `resume`) rapporte donc déjà le coût du 1er essai : ne jamais additionner deux résultats d'une
 *   même session ; `num_turns`, lui, est compté par appel ;
 * - les messages `assistant` reçus : jetons relevés une seule fois par `message.id` (le SDK envoie une réponse en
 *   plusieurs messages de même id, un par bloc), pour estimer un appel interrompu sans `result`.
 */

/** Jetons consommés, tous modèles confondus. `input` = jetons d'entrée NON cachés (comme l'API). */
export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number }

export const NO_TOKENS: Tokens = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

export const addTokens = (a: Tokens, b: Tokens): Tokens => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
})

/** Relevé de jetons d'une réponse du modèle (champ `usage` d'un message assistant ou de l'API Messages). */
export type UsageLike = {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

const count = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)

export const tokensOf = (usage: UsageLike): Tokens => ({
  input: count(usage.input_tokens),
  output: count(usage.output_tokens),
  cacheRead: count(usage.cache_read_input_tokens),
  cacheWrite: count(usage.cache_creation_input_tokens),
})

/**
 * Jetons et allers-retours d'un appel, d'après les messages assistant reçus : chaque id compte une fois, avec son
 * DERNIER relevé (le relevé d'un bloc intermédiaire n'est pas final).
 */
export function meterUsage(messages: readonly { id: string; usage: UsageLike }[]): { tokens: Tokens; turns: number } {
  const last = new Map<string, UsageLike>()
  for (const { id, usage } of messages) last.set(id, usage)
  let tokens: Tokens = NO_TOKENS
  for (const usage of last.values()) tokens = addTokens(tokens, tokensOf(usage))
  return { tokens, turns: last.size }
}

/** Coût estimé en dollars, ou null pour un modèle dont le tarif n'est pas connu. Jamais NaN. */
export function estimateCost(model: string, tokens: Tokens): number | null {
  const price = priceOf(model)
  if (!price) return null
  const { input, output, cacheRead, cacheWrite } = tokens
  const cost = (input * price.input + output * price.output + cacheRead * price.cacheRead + cacheWrite * price.cacheWrite) / 1_000_000
  return Number.isFinite(cost) ? cost : null
}

/** Ce que rapporte un appel de runAgent, pour le métrage (sous-ensemble d'AgentResult). */
export type MeteredCall = {
  sessionId: string | null
  costUsd: number
  tokens: Tokens
  turns: number
  apiTurns: number
  /** session : cumul de la session rapporté par le SDK ; call : appel interrompu, estimé sur ses seules réponses. */
  costKind: 'session' | 'call'
}

export type CostState = {
  /** Sessions terminées (ou appels interrompus) déjà comptés. */
  banked: { cost: number; tokens: Tokens }
  /** Total de la session en cours, tel que rapporté par son dernier appel. */
  session: { cost: number; tokens: Tokens }
  sessionId: string | null
  turns: number
  apiTurns: number
  /** Au moins un montant estimé (appel interrompu, modèle sans tarif…). */
  estimated: boolean
}

export const EMPTY_COST: CostState = Object.freeze({
  banked: { cost: 0, tokens: NO_TOKENS },
  session: { cost: 0, tokens: NO_TOKENS },
  sessionId: null,
  turns: 0,
  apiTurns: 0,
  estimated: false,
}) as CostState

const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)

/**
 * Ajoute un appel au cumul d'une demande (logique `banked` + `session` de job.ts, tâche 24) :
 * - même session reprise (`resumed` = id de session passé en `resume`, et le résultat porte ce même id) : son total inclut
 *   déjà les appels précédents → il REMPLACE `session` ;
 * - nouvelle session, session différente, ou appel interrompu (`costKind: 'call'`, qui ne rapporte que son propre coût
 *   estimé) : la session en cours passe dans `banked`, puis ce résultat devient la session en cours.
 */
export function addCall(state: CostState, call: MeteredCall, resumed: string | null): CostState {
  const sameSession = call.costKind === 'session' && resumed !== null && call.sessionId === resumed
  const banked = sameSession
    ? state.banked
    : { cost: state.banked.cost + state.session.cost, tokens: addTokens(state.banked.tokens, state.session.tokens) }
  return {
    banked,
    session: { cost: safe(call.costUsd), tokens: call.tokens },
    sessionId: call.sessionId ?? state.sessionId,
    turns: state.turns + safe(call.turns),
    apiTurns: state.apiTurns + safe(call.apiTurns),
    estimated: state.estimated || call.costKind === 'call',
  }
}

/** Coût total de la demande en dollars (4 décimales). À comparer au plafond par demande côté moteur. */
export const totalCost = (state: CostState) => Math.round((state.banked.cost + state.session.cost) * 10_000) / 10_000

export const totalTokens = (state: CostState) => addTokens(state.banked.tokens, state.session.tokens)

/**
 * Consommation au format du contrat (`Usage`, core/contracts/engine.ts) :
 * `inputTokens` = total des jetons d'entrée traités (non cachés + lus en cache + écrits en cache).
 */
export function toUsage(
  state: CostState,
  meta: { model: string; access: ClaudeAccess; durationMs: number },
): Usage {
  const tokens = totalTokens(state)
  return {
    model: meta.model,
    inputTokens: tokens.input + tokens.cacheRead + tokens.cacheWrite,
    outputTokens: tokens.output,
    cacheReadTokens: tokens.cacheRead,
    cacheWriteTokens: tokens.cacheWrite,
    costUsd: totalCost(state),
    costKind: state.estimated ? 'estimated' : 'billed',
    access: meta.access,
    durationMs: Math.max(0, Math.round(meta.durationMs)),
    turns: state.turns,
  }
}

/**
 * Consommation d'un appel terminé (Ask AI, `complete()`). Coût : celui rapporté par le SDK (`costUsd`, Agent SDK), sinon
 * calculé d'après les jetons FINAUX de la réponse et le tarif publié (API Messages, qui ne renvoie pas de montant) —
 * c'est ce qui est facturé, donc `billed`. Modèle sans tarif connu : 0 $ et `estimated`.
 */
export function usageFromTokens(
  tokens: Tokens,
  meta: { model: string; access: ClaudeAccess; durationMs: number; costUsd?: number; turns?: number },
): Usage {
  const computed = estimateCost(meta.model, tokens)
  const costUsd = meta.costUsd ?? computed ?? 0
  return {
    model: meta.model,
    inputTokens: tokens.input + tokens.cacheRead + tokens.cacheWrite,
    outputTokens: tokens.output,
    cacheReadTokens: tokens.cacheRead,
    cacheWriteTokens: tokens.cacheWrite,
    costUsd: Math.round(safe(costUsd) * 10_000) / 10_000,
    costKind: meta.costUsd !== undefined || computed !== null ? 'billed' : 'estimated',
    access: meta.access,
    durationMs: Math.max(0, Math.round(meta.durationMs)),
    ...(meta.turns !== undefined ? { turns: meta.turns } : {}),
  }
}
