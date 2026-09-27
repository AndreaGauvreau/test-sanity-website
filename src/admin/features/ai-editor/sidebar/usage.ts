import { costSplit, isIncluded, sumUsage, type ThreadEntry, type Usage } from '@/admin/core/contracts'

/**
 * Consommation cumulée de la conversation (en-tête de la sidebar, D3 : « 39.1k input · 2.7k output · $0.16 »). PUR.
 *
 * Le moteur donne `conversationUsage` au chargement (il peut compter des demandes sorties des 50 dernières du fil).
 * Ensuite, la sidebar suit les demandes par sondage : total = cumul du moteur + (usage actuel − usage au chargement)
 * pour chaque demande. Une demande déjà comptée n'est jamais additionnée deux fois (son usage est remplacé, pas cumulé).
 *
 * Coût séparé DEMANDE PAR DEMANDE (`Usage.access`) : `costUsd` du cumul = part FACTURÉE (clé API) seulement,
 * `includedUsd` = demandes passées par l'abonnement Claude (prix de l'API, non facturées) — forme « cumul » de
 * `CostValue` (contrat), affichée par `ModelUsage` (« Included », « $0.10 + included »).
 */

export type UsageSnapshot = ReadonlyMap<string, Usage>

/** Cumul de la conversation : `costUsd` = part facturée, `includedUsd` = part incluse dans l'abonnement Claude. */
export type ConversationUsage = Usage & { includedUsd: number }

/** Usage par demande (id → Usage) des entrées du fil qui en ont un. */
export function usageByJob(thread: readonly ThreadEntry[]): Map<string, Usage> {
  const map = new Map<string, Usage>()
  for (const entry of thread) if (entry.type === 'job' && entry.job.usage) map.set(entry.job.id, entry.job.usage)
  return map
}

const ZERO = (model: string): Usage => ({
  model,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
  costKind: 'billed',
  access: 'none',
  durationMs: 0,
  turns: 0,
})

function negate(u: Usage): Usage {
  return {
    ...u,
    inputTokens: -u.inputTokens,
    outputTokens: -u.outputTokens,
    cacheReadTokens: -u.cacheReadTokens,
    cacheWriteTokens: -u.cacheWriteTokens,
    costUsd: -u.costUsd,
    durationMs: -u.durationMs,
    turns: -(u.turns ?? 0),
    // Le retrait ne doit pas rendre le total « estimé » : seul un usage réellement estimé le fait.
    costKind: 'billed',
  }
}

/**
 * Cumul affiché. `base` = conversationUsage du moteur au chargement ; `loaded` = usages des demandes du fil au
 * chargement ; `current` = usages actuels. Jamais négatif ; `model` = modèle de la conversation.
 */
export function cumulativeUsage(base: Usage | null, loaded: UsageSnapshot, current: UsageSnapshot, model: string): ConversationUsage {
  const parts: Usage[] = [base ?? ZERO(model)]
  for (const [id, usage] of current) {
    const before = loaded.get(id)
    if (before === usage) continue
    parts.push(usage)
    if (before) parts.push(negate(before))
  }
  // Une demande présente au chargement puis sortie du fil (limite de 50) reste comptée : rien à retirer.
  const total = sumUsage(parts) ?? ZERO(model)

  // Coût séparé, même calcul (cumul du moteur + écarts) : le cumul du moteur (`sumUsage`) ne garde que l'accès de sa
  // première demande, on le reprend donc demande par demande depuis le fil chargé (dont il est la somme) ; un écart
  // éventuel (demandes hors du fil) suit l'accès du cumul.
  let billed = 0
  let included = 0
  let estimated = false
  const add = (usage: Usage, sign: 1 | -1) => {
    const split = costSplit(usage)
    billed += sign * split.billedUsd
    included += sign * split.includedUsd
    if (sign === 1 && !isIncluded(usage) && usage.costKind === 'estimated') estimated = true
  }
  if (base) {
    let loadedCost = 0
    for (const usage of loaded.values()) {
      add(usage, 1)
      loadedCost += usage.costUsd
    }
    const rest = base.costUsd - loadedCost
    if (Math.abs(rest) > 1e-9) add({ ...base, costUsd: Math.abs(rest) }, rest > 0 ? 1 : -1)
  }
  for (const [id, usage] of current) {
    const before = loaded.get(id)
    if (before === usage) continue
    add(usage, 1)
    if (before) add(before, -1)
  }

  return {
    ...total,
    model: base?.model ?? model,
    inputTokens: Math.max(0, total.inputTokens),
    outputTokens: Math.max(0, total.outputTokens),
    cacheReadTokens: Math.max(0, total.cacheReadTokens),
    cacheWriteTokens: Math.max(0, total.cacheWriteTokens),
    costUsd: Math.max(0, billed),
    includedUsd: Math.max(0, included),
    // « ~ » seulement si un coût FACTURÉ est estimé (la part incluse est déjà un « ≈ »).
    costKind: estimated ? 'estimated' : 'billed',
    durationMs: Math.max(0, total.durationMs),
    turns: Math.max(0, total.turns ?? 0),
  }
}
