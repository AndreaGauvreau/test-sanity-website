import type { Metadata } from 'next'

import { requireSession } from '@/admin/core/auth/session'
import { Overview } from '@/admin/features/overview/Overview'

export const metadata: Metadata = { title: 'Overview' }

/** B1 · Overview (/admin) : page d'arrivée de l'admin, Kuartz, client admin et editor. */
export default async function OverviewPage() {
  const session = await requireSession()
  return <Overview session={session} />
}
