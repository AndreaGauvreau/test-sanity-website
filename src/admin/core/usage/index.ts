import 'server-only'

import { requireSession } from '@/admin/core/auth/session'
import { getReadClient } from '@/admin/core/sanity/clients'

import {
  isUsagePeriod,
  parseUsageDocs,
  periodStart,
  summarizeUsage,
  usageRows,
  type UsageDoc,
  type UsagePeriod,
  type UsageRow,
  type UsageSummary,
} from './aggregate'

/**
 * Journal de consommation IA, côté SERVEUR : lit les documents PRIVÉS `aiUsage.<id>` (le point les rend illisibles
 * sans jeton) avec le jeton Viewer en perspective `raw`, puis agrège (aggregate.ts, pur).
 *
 * Exige une session (défense en profondeur : les appelants — pages B1 / B5, Ask AI — ont déjà appelé
 * `requireSession`). Sans session : `AdminAuthError(401)`, jamais de redirection depuis ici.
 *
 * Signature STABLE, utilisée par settings (B1), ask-ai (G4) et usage (B5) : `getUsageSummary(period)`.
 */

export {
  USAGE_FEATURE_LABELS,
  USAGE_PERIOD_LABELS,
  USAGE_PERIODS,
  isUsagePeriod,
  type UsageAggregate,
  type UsageFeature,
  type UsagePeriod,
  type UsageRow,
  type UsageSummary,
  type UsageTotals,
} from './aggregate'

/** Champs lus (jamais le document entier). `request` est lu s'il existe (demande de contrat : texte de la demande). */
const PROJECTION = `{
  _id, feature, createdAt, model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd, costKind,
  status, page, request, "user": user{ id, name, role }
}`

/** Documents publiés du journal (jamais `drafts.aiUsage.*`), depuis `$since` s'il est donné. */
export const USAGE_QUERY = `*[_type == "aiUsage" && _id in path("aiUsage.**") && ($since == null || createdAt >= $since)] | order(createdAt desc) ${PROJECTION}`

export type UsageDeps = {
  /** Requête GROQ (tests : faux client). Défaut : client Viewer, perspective raw. */
  fetch?: (query: string, params: Record<string, unknown>) => Promise<unknown>
  now?: Date
}

async function loadDocs(period: UsagePeriod, deps: UsageDeps): Promise<{ docs: UsageDoc[]; now: Date }> {
  await requireSession('route')
  if (!isUsagePeriod(period)) throw new Error('Invalid usage period.')
  const now = deps.now ?? new Date()
  const start = periodStart(period, now)
  const fetcher = deps.fetch ?? ((query, params) => getReadClient({ perspective: 'raw' }).fetch(query, params))
  const raw = await fetcher(USAGE_QUERY, { since: start ? start.toISOString() : null })
  return { docs: parseUsageDocs(raw), now }
}

/**
 * Résumé d'une période : `{ period, totals, byFeature, byModel, requests, since? }` (voir aggregate.ts).
 * Période vide : totaux à 0, listes vides.
 */
export async function getUsageSummary(period: UsagePeriod, deps: UsageDeps = {}): Promise<UsageSummary> {
  const { docs, now } = await loadDocs(period, deps)
  return summarizeUsage(docs, period, now)
}

/**
 * Tout l'écran B5 en UNE lecture du journal : résumé de la période, résumé « Since launch » et détail de la période.
 */
export async function getUsageOverview(
  { period, limit = 50 }: { period: UsagePeriod; limit?: number },
  deps: UsageDeps = {},
): Promise<{ summary: UsageSummary; allTime: UsageSummary; rows: { items: UsageRow[]; total: number } }> {
  const { docs, now } = await loadDocs('all-time', deps)
  if (!isUsagePeriod(period)) throw new Error('Invalid usage period.')
  return {
    summary: summarizeUsage(docs, period, now),
    allTime: summarizeUsage(docs, 'all-time', now),
    rows: usageRows(docs, period, now, limit),
  }
}

/** Détail des demandes d'une période, la plus récente en haut (`limit` : 1 à 500, défaut 50), et leur nombre total. */
export async function listUsage(
  { period, limit = 50 }: { period: UsagePeriod; limit?: number },
  deps: UsageDeps = {},
): Promise<{ items: UsageRow[]; total: number }> {
  const { docs, now } = await loadDocs(period, deps)
  return usageRows(docs, period, now, limit)
}
