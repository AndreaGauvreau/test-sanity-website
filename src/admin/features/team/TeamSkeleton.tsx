import { ContentArea, SectionHeader } from '@/admin/ui'

import skeleton from '../general/skeleton.module.css'
import styles from './team.module.css'

/** B4 · chargement : en-tête réel, quatre lignes grises à la place des membres. */
export function TeamSkeleton() {
  return (
    <ContentArea gap={24} aria-busy="true" aria-label="Loading team">
      <SectionHeader title="Team" description="Members of the Sanity project. Invitations and roles are managed in Sanity." />
      <div className={styles.members}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={skeleton.block} style={{ height: 39, margin: 4, width: 'auto' }} />
        ))}
      </div>
    </ContentArea>
  )
}
