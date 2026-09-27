import { z } from 'zod'

import type { AiUsageDoc, ClaudeAccess, Usage } from '@/admin/core/contracts/engine'
import { isIncluded, modelLabel } from '@/admin/core/contracts/format'
import { ADMIN_ROLES, type AdminRole } from '@/admin/core/contracts/roles'

/**
 * Journal de consommation IA (B5, G4, B1) : lecture défensive des documents `aiUsage.*` et agrégats par période.
 * PUR : aucun import Next ni Sanity, testé avec des jeux de données en mémoire (jamais dans Sanity).
 *
 * Règles du Figma (B5) : des jetons et des dollars, jamais de « crédits », ni solde, ni plafond, ni alerte.
 *
 * Coût FACTURÉ / INCLUS : une demande passée par l'abonnement Claude (`access: 'subscription'`, moteur local) n'est pas
 * facturée. Dans un cumul (totaux, fonctionnalité, modèle), `costUsd` est la part FACTURÉE seulement (clé API, ou ancien
 * document sans `access`) et `includedUsd` la part incluse (prix de l'API) : tout ce qui lit `costUsd` d'un cumul
 * (« Cost », « Since launch », B1, pied de Ask AI) n'affiche donc que le facturé. Les jetons, eux, comptent tout.
 */

export type UsagePeriod = 'month' | '3-months' | 'all-time'

export const USAGE_PERIODS: readonly UsagePeriod[] = ['month', '3-months', 'all-time']

/** Libellés anglais des périodes (mêmes que le Select de la carte AI usage). */
export const USAGE_PERIOD_LABELS: Readonly<Record<UsagePeriod, string>> = {
  month: 'This month',
  '3-months': 'Last 3 months',
  'all-time': 'Since launch',
}

export type UsageFeature = AiUsageDoc['feature']

export const USAGE_FEATURE_LABELS: Readonly<Record<UsageFeature, string>> = {
  editor: 'AI editor',
  ask: 'Ask AI',
}

/** Ordre d'affichage des fonctionnalités (Figma : AI editor puis Ask AI). */
const FEATURE_ORDER: readonly UsageFeature[] = ['editor', 'ask']

export type UsageTotals = {
  inputTokens: number
  outputTokens: number
  /** Coût FACTURÉ (clé API) : ce qu'affichent « Cost », « Since launch », B1 et le pied de Ask AI. */
  costUsd: number
  /** Demandes passées par l'abonnement Claude : coût au prix de l'API, inclus, jamais facturé (0 sans elles). */
  includedUsd: number
}

/**
 * Cumul d'un groupe (fonctionnalité ou modèle). Compatible avec `ModelUsageValue` du kit (forme « cumul » de
 * `CostValue` : `costUsd` facturé + `includedUsd`).
 * `model` : pour une fonctionnalité, le modèle de sa demande la plus RÉCENTE de la période (celui qu'elle utilise
 * aujourd'hui) ; pour un modèle, lui-même. `costKind` : `estimated` dès qu'une demande FACTURÉE l'est.
 */
export type UsageAggregate = Pick<Usage, 'model' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'costKind'> & {
  /** Part facturée (clé API). */
  costUsd: number
  /** Part incluse dans l'abonnement Claude (prix de l'API, non facturée). */
  includedUsd: number
  requests: number
}

export type UsageSummary = {
  period: UsagePeriod
  totals: UsageTotals
  byFeature: { feature: UsageFeature; label: string; usage: UsageAggregate }[]
  byModel: { model: string; label: string; usage: UsageAggregate }[]
  requests: number
  /**
   * Début de la période (ISO) : 1er jour du mois (UTC) pour `month`, 1er jour du mois d'il y a deux mois pour
   * `3-months` ; pour `all-time`, la date de la première demande enregistrée (absent s'il n'y en a aucune).
   */
  since?: string
}

/** Ligne du détail « Recent requests ». */
export type UsageRow = {
  id: string
  createdAt: string
  feature: UsageFeature
  featureLabel: string
  user: { id: string; name: string; role: AdminRole }
  /** Texte de la demande (`AiUsageDoc.request`, écrit par le moteur, ≤ 120 car.) ; absent pour les anciennes demandes. */
  request?: AiUsageDoc['request']
  page?: string
  status: string
  model: string
  modelLabel: string
  inputTokens: number
  outputTokens: number
  /** Coût de la demande au prix de l'API ; facturé ou non selon `access` (`isIncluded` du contrat). */
  costUsd: number
  costKind: Usage['costKind']
  /** Accès à Claude de la demande ; absent pour un ancien document (compté comme facturé). */
  access?: ClaudeAccess
}

// ─── Lecture défensive ─────────────────────────────────────────────────────────────────────

const count = z.number().finite().nonnegative().catch(0)

/**
 * Un document du journal tel que lu dans Sanity. L'API Sanity n'applique pas le schéma : un document mal formé
 * (écrit à la main, ancien format) est ignoré plutôt que de fausser les totaux ou casser l'écran.
 */
const usageDocSchema = z.object({
  _id: z.string().regex(/^aiUsage\.[\w-]+$/),
  feature: z.enum(['editor', 'ask']),
  createdAt: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
  model: z.string().min(1).max(100),
  inputTokens: count,
  outputTokens: count,
  cacheReadTokens: count,
  cacheWriteTokens: count,
  costUsd: count,
  costKind: z.enum(['billed', 'estimated']).catch('billed'),
  // Absent (ancien document) ou inconnu : facturé, comme avant la séparation facturé / inclus.
  access: z.enum(['api-key', 'subscription', 'none']).optional().catch(undefined),
  status: z.string().max(40).catch('unknown'),
  page: z.string().max(200).optional().catch(undefined),
  request: z.string().optional().catch(undefined),
  user: z
    .object({
      id: z.string().catch(''),
      name: z.string().max(120).catch('Unknown'),
      role: z.enum(ADMIN_ROLES).catch('client'),
    })
    .catch({ id: '', name: 'Unknown', role: 'client' }),
})

export type UsageDoc = z.infer<typeof usageDocSchema>

/** Garde les documents valides (les autres sont ignorés). Entrée non fiable : résultat d'une requête Sanity. */
export function parseUsageDocs(raw: unknown): UsageDoc[] {
  if (!Array.isArray(raw)) return []
  const out: UsageDoc[] = []
  for (const item of raw) {
    const parsed = usageDocSchema.safeParse(item)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

// ─── Périodes ──────────────────────────────────────────────────────────────────────────────

export function isUsagePeriod(value: unknown): value is UsagePeriod {
  return typeof value === 'string' && (USAGE_PERIODS as readonly string[]).includes(value)
}

/**
 * Début d'une période, en UTC (mois calendaires) : `month` = 1er du mois courant, `3-months` = 1er du mois
 * d'il y a deux mois (le mois courant + les deux précédents), `all-time` = aucune borne (null).
 */
export function periodStart(period: UsagePeriod, now: Date): Date | null {
  if (period === 'all-time') return null
  const back = period === 'month' ? 0 : 2
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
}

/** Le document tombe-t-il dans la période (borne basse incluse ; les dates futures sont comptées) ? */
function inPeriod(doc: UsageDoc, start: Date | null): boolean {
  return start === null || Date.parse(doc.createdAt) >= start.getTime()
}

// ─── Agrégats ──────────────────────────────────────────────────────────────────────────────

/**
 * Arrondi des coûts cumulés au millionième de dollar : évite les restes de flottants (0.1 + 0.2) sans perdre
 * les coûts d'une demande Ask (≈ 0.003 $). L'affichage passe ensuite par `formatCost` du contrat.
 */
export function roundCost(usd: number): number {
  return Math.round(usd * 1e6) / 1e6
}

function emptyAggregate(model: string): UsageAggregate {
  return { model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, includedUsd: 0, costKind: 'billed', requests: 0 }
}

function add(acc: UsageAggregate, doc: UsageDoc): void {
  acc.inputTokens += doc.inputTokens
  acc.outputTokens += doc.outputTokens
  acc.cacheReadTokens += doc.cacheReadTokens
  acc.cacheWriteTokens += doc.cacheWriteTokens
  // Abonnement Claude : jamais ajouté au coût facturé.
  if (isIncluded(doc)) acc.includedUsd += doc.costUsd
  else {
    acc.costUsd += doc.costUsd
    if (doc.costKind === 'estimated') acc.costKind = 'estimated'
  }
  acc.requests += 1
}

function finish(acc: UsageAggregate): UsageAggregate {
  return {
    ...acc,
    inputTokens: Math.round(acc.inputTokens),
    outputTokens: Math.round(acc.outputTokens),
    cacheReadTokens: Math.round(acc.cacheReadTokens),
    cacheWriteTokens: Math.round(acc.cacheWriteTokens),
    costUsd: roundCost(acc.costUsd),
    includedUsd: roundCost(acc.includedUsd),
  }
}

/** Plus récent d'abord ; à date égale, par id (ordre stable). */
function byNewest(a: UsageDoc, b: UsageDoc): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0)
}

/**
 * Résumé d'une période : totaux, par fonctionnalité (AI editor, Ask AI : seulement celles qui ont servi, dans cet
 * ordre), par modèle (du plus coûteux au moins coûteux, au prix de l'API : facturé + inclus), nombre de demandes. Les
 * documents hors période sont ignorés. Coûts séparés facturé (`costUsd`) / inclus dans l'abonnement (`includedUsd`).
 */
export function summarizeUsage(docs: readonly UsageDoc[], period: UsagePeriod, now: Date): UsageSummary {
  const start = periodStart(period, now)
  const kept = docs.filter((doc) => inPeriod(doc, start)).sort(byNewest)

  const totals = emptyAggregate('')
  const features = new Map<UsageFeature, UsageAggregate>()
  const models = new Map<string, UsageAggregate>()
  for (const doc of kept) {
    add(totals, doc)
    // Tri du plus récent au plus ancien : le premier document vu donne le modèle de la fonctionnalité.
    if (!features.has(doc.feature)) features.set(doc.feature, emptyAggregate(doc.model))
    add(features.get(doc.feature)!, doc)
    if (!models.has(doc.model)) models.set(doc.model, emptyAggregate(doc.model))
    add(models.get(doc.model)!, doc)
  }

  const since = start ? start.toISOString() : kept.length > 0 ? kept[kept.length - 1].createdAt : undefined
  const done = finish(totals)
  return {
    period,
    totals: { inputTokens: done.inputTokens, outputTokens: done.outputTokens, costUsd: done.costUsd, includedUsd: done.includedUsd },
    byFeature: FEATURE_ORDER.filter((f) => features.has(f)).map((feature) => ({
      feature,
      label: USAGE_FEATURE_LABELS[feature],
      usage: finish(features.get(feature)!),
    })),
    byModel: [...models.values()]
      .map(finish)
      .sort((a, b) => b.costUsd + b.includedUsd - (a.costUsd + a.includedUsd) || b.requests - a.requests || a.model.localeCompare(b.model))
      .map((usage) => ({ model: usage.model, label: modelLabel(usage.model), usage })),
    requests: done.requests,
    ...(since ? { since } : {}),
  }
}

/**
 * Longueur maximale du texte d'une demande affiché : celle du contrat (`AiUsageDoc.request`, tronqué à 120 car. par
 * le moteur). Recoupé ici car le document vient de Sanity (écrit à la main, ancien format) ; CSS coupe en plus.
 */
export const REQUEST_MAX = 120

/** Lignes du détail d'une période, la plus récente en haut, `limit` au plus (1 à 500). */
export function usageRows(docs: readonly UsageDoc[], period: UsagePeriod, now: Date, limit: number): { items: UsageRow[]; total: number } {
  const start = periodStart(period, now)
  const kept = docs.filter((doc) => inPeriod(doc, start)).sort(byNewest)
  const max = Math.min(Math.max(1, Math.floor(limit) || 1), 500)
  return {
    total: kept.length,
    items: kept.slice(0, max).map((doc) => {
      const request = doc.request?.replace(/\s+/g, ' ').trim()
      return {
        id: doc._id,
        createdAt: doc.createdAt,
        feature: doc.feature,
        featureLabel: USAGE_FEATURE_LABELS[doc.feature],
        user: doc.user,
        ...(request ? { request: [...request].slice(0, REQUEST_MAX).join('') } : {}),
        ...(doc.page ? { page: doc.page } : {}),
        status: doc.status,
        model: doc.model,
        modelLabel: modelLabel(doc.model),
        inputTokens: Math.round(doc.inputTokens),
        outputTokens: Math.round(doc.outputTokens),
        costUsd: roundCost(doc.costUsd),
        costKind: doc.costKind,
        ...(doc.access ? { access: doc.access } : {}),
      }
    }),
  }
}
