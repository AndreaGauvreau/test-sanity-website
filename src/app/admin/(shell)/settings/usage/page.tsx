import type { Metadata } from 'next'

import { requireSession } from '@/admin/core/auth/session'
import { getUsageOverview, isUsagePeriod } from '@/admin/core/usage'
import { UsageLoadError } from '@/admin/features/usage/UsageLoadError'
import { UsageScreen } from '@/admin/features/usage/UsageScreen'

export const metadata: Metadata = { title: 'Usage' }

/** « 120 » → 120 (1 à 500) ; sinon 50. */
function parseLimit(raw: string | string[] | undefined): number {
  const n = typeof raw === 'string' && /^\d{1,3}$/.test(raw) ? Number(raw) : 50
  return Math.min(Math.max(n, 1), 500)
}

/**
 * B5 · Site Settings › Usage — Kuartz et client (toute session de l'admin). Période dans l'URL : `?period=`
 * (month par défaut, 3-months, all-time) ; `?limit=` pour « Show more ».
 */
export default async function UsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSession()
  const query = await searchParams
  const period = isUsagePeriod(query.period) ? query.period : 'month'
  const limit = parseLimit(query.limit)
  let overview: Awaited<ReturnType<typeof getUsageOverview>>
  try {
    overview = await getUsageOverview({ period, limit })
  } catch (err) {
    console.error('[usage] load failed', err)
    return <UsageLoadError />
  }
  return <UsageScreen period={period} limit={limit} now={new Date()} {...overview} />
}
