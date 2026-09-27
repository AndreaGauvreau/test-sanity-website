import type { Metadata } from 'next'

import { adminConfig } from '@/admin.config'
import { requireCapability } from '@/admin/core/auth/session'
import { can } from '@/admin/core/contracts/roles'
import { loadPublishStatus } from '@/admin/features/publish/load'
import { PendingView } from '@/admin/features/publish/PendingView'
import { PublishHeader } from '@/admin/features/publish/PublishHeader'
import { ContentArea } from '@/admin/ui'

export const metadata: Metadata = { title: 'Publish' }

/**
 * E1 · Publish — pending changes (`/admin/publish`). Kuartz, client admin et editor (publish.run) ; le diff du code
 * est réservé à Kuartz (publish.diff). Données : état partagé du moteur, lu ici puis suivi côté client.
 */
export default async function PublishPage() {
  const session = await requireCapability('publish.run')
  const { data: status, error } = await loadPublishStatus(session)
  return (
    <ContentArea gap={20}>
      <PublishHeader active="pending" initialStatus={status} />
      <PendingView
        initialStatus={status}
        initialError={error}
        canDiff={can(session.role, 'publish.diff')}
        siteUrl={adminConfig.site.url}
        domain={adminConfig.site.domain}
        kinds={{ collectionTypes: adminConfig.collections.map((c) => c.type), settingsType: adminConfig.settings.type }}
      />
    </ContentArea>
  )
}
