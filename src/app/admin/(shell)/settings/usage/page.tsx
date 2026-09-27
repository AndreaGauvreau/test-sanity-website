import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { isLocalHost } from '@/admin/core/auth/dev'
import { requestHost } from '@/admin/core/auth/request'
import { requireSession } from '@/admin/core/auth/session'
import type { AdminConfig } from '@/admin/core/contracts/manifest'
import { can } from '@/admin/core/contracts/roles'
import { getUsageOverview, isUsagePeriod } from '@/admin/core/usage'
import { UsageLoadError } from '@/admin/features/usage/UsageLoadError'
import { UsageScreen } from '@/admin/features/usage/UsageScreen'
import adminConfig from '@/admin.config'

export const metadata: Metadata = { title: 'Usage' }

/** Site du manifeste lu selon le CONTRAT (`launchedAt` facultatif, rempli par site-adapter — FOLLOWUPS #28 / #33). */
const site: AdminConfig['site'] = adminConfig.site

/** « 120 » → 120 (1 à 500) ; sinon 50. */
function parseLimit(raw: string | string[] | undefined): number {
  const n = typeof raw === 'string' && /^\d{1,3}$/.test(raw) ? Number(raw) : 50
  return Math.min(Math.max(n, 1), 500)
}

/**
 * B5 · Site Settings › Usage — Kuartz et client (toute session de l'admin) ; carte « Claude connection » avec ai.access. Période dans l'URL : `?period=`
 * (month par défaut, 3-months, all-time) ; `?limit=` pour « Show more ».
 */
export default async function UsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession()
  const query = await searchParams
  // Carte « Claude connection » : Kuartz et client (ai.access). Abonnement de la machine proposé seulement si l'admin
  // est ouvert sur cette machine (le relais et le moteur le revérifient).
  const claudeConnection = can(session.role, 'ai.access') ? { adminLocal: isLocalHost(requestHost(await headers())) } : undefined
  const period = isUsagePeriod(query.period) ? query.period : 'month'
  const limit = parseLimit(query.limit)
  let overview: Awaited<ReturnType<typeof getUsageOverview>>
  try {
    overview = await getUsageOverview({ period, limit })
  } catch (err) {
    console.error('[usage] load failed', err)
    return <UsageLoadError />
  }
  return <UsageScreen period={period} limit={limit} now={new Date()} launchedAt={site.launchedAt} claudeConnection={claudeConnection} {...overview} />
}
