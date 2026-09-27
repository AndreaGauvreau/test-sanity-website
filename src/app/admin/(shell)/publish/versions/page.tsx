import type { Metadata } from 'next'

import { requireCapability } from '@/admin/core/auth/session'
import { can } from '@/admin/core/contracts/roles'
import { loadPublishStatus, loadVersions } from '@/admin/features/publish/load'
import { PublishHeader } from '@/admin/features/publish/PublishHeader'
import { VersionsView } from '@/admin/features/publish/VersionsView'
import { ContentArea } from '@/admin/ui'

export const metadata: Metadata = { title: 'Versions' }

/**
 * E2 · Publish — versions (`/admin/publish/versions`). Toute session qui peut publier ; « Roll back to this version »
 * réservé à Kuartz (versions.rollback, question 5).
 */
export default async function VersionsPage() {
  const session = await requireCapability('publish.run')
  const [status, versions] = await Promise.all([loadPublishStatus(session), loadVersions(session)])
  return (
    <ContentArea gap={20}>
      <PublishHeader active="versions" initialStatus={status.data} />
      <VersionsView initial={versions.data} initialError={versions.error} canRollback={can(session.role, 'versions.rollback')} />
    </ContentArea>
  )
}
