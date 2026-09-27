import type { Usage } from './engine'

/**
 * Formats partagés de la consommation IA (Figma : « 18.2k input · 1.1k output · $0.07 », « Opus 5.5 »).
 * Jamais de « crédits » : des jetons et des dollars.
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

/** « 18.2k input · 1.1k output · $0.07 » */
export function formatUsageLine(usage: Pick<Usage, 'inputTokens' | 'outputTokens' | 'costUsd'>): string {
  return `${formatTokens(usage.inputTokens)} input · ${formatTokens(usage.outputTokens)} output · ${formatCost(usage.costUsd)}`
}

/** 24 000 → « 24 s », 72 000 → « 1 min 12 s ». */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${m} min ${rest} s` : `${m} min`
}

/** Additionne des consommations (conversation, période). Le modèle retenu est celui de la première. */
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
