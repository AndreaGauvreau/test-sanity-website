'use client'

import Link from 'next/link'

import type { PublishStatus } from '@/admin/core/contracts/engine'
import { PageHeader, Tabs } from '@/admin/ui'

import { pendingHeaderMeta, pendingTabLabel } from './format'
import { useNow } from './use-now'
import { usePublishStatus } from './use-publish-status'

/**
 * En-tête commun de E1 et E2 : « Publish » + « 3 changes waiting · last validated 5 min ago » (ou « Everything is
 * published. ») et les onglets de route « Pending (N) | Versions ». Lit l'état partagé (compteur à jour).
 */
export function PublishHeader({ active, initialStatus }: { active: 'pending' | 'versions'; initialStatus: PublishStatus | null }) {
  const { status } = usePublishStatus(initialStatus)
  const now = useNow()
  const count = status?.pending.total ?? 0
  return (
    <PageHeader
      title="Publish"
      meta={<span suppressHydrationWarning>{status ? pendingHeaderMeta(count, status.pending.lastValidatedAt, now) : ''}</span>}
      tabs={
        <Tabs
          aria-label="Publish"
          value={active}
          linkAs={Link}
          items={[
            { value: 'pending', label: status ? pendingTabLabel(count) : 'Pending', href: '/admin/publish' },
            { value: 'versions', label: 'Versions', href: '/admin/publish/versions' },
          ]}
        />
      }
    />
  )
}
