import type { ClaudeAccess, Usage } from './engine'

/**
 * Formats partagés de la consommation IA (Figma : « 18.2k input · 1.1k output · $0.07 », « Opus 5.5 »).
 * Jamais de « crédits » : des jetons et des dollars.
 *
 * Coût FACTURÉ ou INCLUS : une demande passée par l'abonnement Claude (moteur local, `Usage.access === 'subscription'`)
 * a un coût calculé au prix de l'API mais n'est pas facturée. Tout affichage d'un coût passe par `costSplit` (ou les
 * formats qui l'utilisent) : le coût facturé n'additionne jamais la part incluse, montrée à part (« Included »).
 *
 * CONTRAT PARTAGÉ — propriétaire : l'orchestrateur.
 */

const MODEL_LABELS: Readonly<Record<string, string>> = {
  'claude-fable-5-1': 'Fable 5.1',
  'claude-opus-5-5': 'Opus 5.5',
  'claude-sonnet-5': 'Sonnet 5',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'claude-haiku-4-5': 'Haiku 4.5',
}

export function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model
}

/** 950 → « 950 », 18 240 → « 18.2k », 1 204 000 → « 1.2M ». */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${trim(n / 1000)}k`
  return `${trim(n / 1_000_000)}M`
}

function trim(value: number): string {
  return (value >= 100 ? Math.round(value).toString() : value.toFixed(1)).replace(/\.0$/, '')
}

/** 0.0712 → « $0.07 », 0.0031 → « $0.003 », 4.8 → « $4.80 ». */
export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

// ─── Coût facturé / inclus dans l'abonnement Claude ─────────────────────────

/**
 * Coût à afficher, sous l'une de deux formes :
 * - UNE demande (`Usage`, document aiUsage, ligne de B5) : `costUsd` = son coût au prix de l'API, `access` dit s'il
 *   est facturé (clé API, accès inconnu d'un ancien document) ou inclus (abonnement) ;
 * - un CUMUL déjà séparé (`includedUsd` présent, même à 0) : `costUsd` = part FACTURÉE seulement, `includedUsd` = part
 *   incluse dans l'abonnement (prix de l'API, non facturée). `access` est alors ignoré.
 * `costKind` : `estimated` → « ~ » devant le coût facturé.
 */
export type CostValue = Pick<Usage, 'costUsd'> & {
  access?: ClaudeAccess | null
  includedUsd?: number
  costKind?: Usage['costKind']
}

/** Coût séparé : `billedUsd` facturé (compte API du site), `includedUsd` inclus dans l'abonnement Claude. */
export type CostSplit = { billedUsd: number; includedUsd: number }

const amount = (usd: number | undefined) => (typeof usd === 'number' && Number.isFinite(usd) && usd > 0 ? usd : 0)

/**
 * La demande est-elle passée par l'ABONNEMENT Claude (moteur local) ? Son coût n'est alors pas facturé. Tout autre
 * accès — clé API, `none`, ancien document sans `access` — compte comme facturé.
 */
export function isIncluded(value: { access?: ClaudeAccess | null }): boolean {
  return value.access === 'subscription'
}

/** Part facturée et part incluse d'un coût (une demande ou un cumul, voir `CostValue`). Jamais négatif ni NaN. */
export function costSplit(value: CostValue): CostSplit {
  if (value.includedUsd !== undefined) return { billedUsd: amount(value.costUsd), includedUsd: amount(value.includedUsd) }
  return isIncluded(value) ? { billedUsd: 0, includedUsd: amount(value.costUsd) } : { billedUsd: amount(value.costUsd), includedUsd: 0 }
}

/** Somme séparée de plusieurs coûts (demandes ou cumuls). */
export function sumCosts(values: readonly CostValue[]): CostSplit {
  let billedUsd = 0
  let includedUsd = 0
  for (const value of values) {
    const split = costSplit(value)
    billedUsd += split.billedUsd
    includedUsd += split.includedUsd
  }
  return { billedUsd, includedUsd }
}

/** Libellé court d'un coût inclus dans l'abonnement Claude (cellule Cost de B5, lignes de consommation). */
export const INCLUDED_LABEL = 'Included'

/**
 * Coût court (lignes, en-têtes, tableaux) : « $0.07 », « ~$0.07 » (estimé), « Included » (abonnement seulement),
 * « $0.10 + included » (les deux). Le détail va dans `describeCost` (infobulle, lecteurs d'écran).
 */
export function formatCostShort(value: CostValue): string {
  const { billedUsd, includedUsd } = costSplit(value)
  if (includedUsd > 0 && billedUsd === 0) return INCLUDED_LABEL
  const billed = `${value.costKind === 'estimated' ? '~' : ''}${formatCost(billedUsd)}`
  return includedUsd > 0 ? `${billed} + included` : billed
}

/** Part non facturée : « ≈ $0.30 at API prices — included in your Claude subscription ». */
export function formatIncluded(usd: number): string {
  return `≈ ${formatCost(usd)} at API prices — included in your Claude subscription`
}

/**
 * Coût en toutes lettres (nom accessible, infobulle) : « $0.07 », « ~$0.07 (estimated) »,
 * « included in your Claude subscription (≈ $0.07 at API prices) »,
 * « $0.10 billed + ≈ $0.30 at API prices, included in your Claude subscription ».
 */
export function describeCost(value: CostValue): string {
  const { billedUsd, includedUsd } = costSplit(value)
  const billed = value.costKind === 'estimated' ? `~${formatCost(billedUsd)} (estimated)` : formatCost(billedUsd)
  if (includedUsd === 0) return billed
  const included = `≈ ${formatCost(includedUsd)} at API prices`
  if (billedUsd === 0) return `included in your Claude subscription (${included})`
  return `${billed} billed + ${included}, included in your Claude subscription`
}

/**
 * « 18.2k input · 1.1k output · $0.07 » ; le coût suit `describeCost` (« ~$0.07 (estimated) », « included in your
 * Claude subscription (≈ $0.07 at API prices) »…). Ligne lue en entier par `ModelUsage`.
 */
export function formatUsageLine(usage: Pick<Usage, 'inputTokens' | 'outputTokens'> & CostValue): string {
  return `${formatTokens(usage.inputTokens)} input · ${formatTokens(usage.outputTokens)} output · ${describeCost(usage)}`
}

/** 24 000 → « 24 s », 72 000 → « 1 min 12 s ». */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${m} min ${rest} s` : `${m} min`
}

/**
 * Additionne des consommations (conversation, période). Le modèle ET l'accès retenus sont ceux de la première : un
 * cumul qui mélange clé API et abonnement se sépare avec `sumCosts` / `costSplit`, jamais avec `access` du résultat.
 */
export function sumUsage(items: readonly Usage[]): Usage | null {
  if (items.length === 0) return null
  return items.reduce((acc, u) => ({
    ...acc,
    inputTokens: acc.inputTokens + u.inputTokens,
    outputTokens: acc.outputTokens + u.outputTokens,
    cacheReadTokens: acc.cacheReadTokens + u.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens + u.cacheWriteTokens,
    costUsd: acc.costUsd + u.costUsd,
    costKind: acc.costKind === 'estimated' || u.costKind === 'estimated' ? 'estimated' : 'billed',
    durationMs: acc.durationMs + u.durationMs,
    turns: (acc.turns ?? 0) + (u.turns ?? 0),
  }))
}
