import { AIUsage, ContentArea, PageHeader, StatCard } from '@/admin/ui'

import styles from './Usage.module.css'

/** État de chargement de B5 : mêmes cartes, chiffres « — » (AIUsage en chargement), carte des demandes vide. */
export function UsageSkeleton() {
  return (
    <ContentArea gap={24} aria-busy="true">
      <PageHeader title="Usage" meta="AI consumption on the site's own Claude account: model, input and output tokens, cost." />
      <div className={styles.cards}>
        <AIUsage className={styles.card} totals={null} loading />
        <StatCard icon="history" label="Since launch" value="—" hint="Loading…" className={styles.card} />
      </div>
      <section className={styles.requests} aria-label="Recent requests">
        <div className={styles.requestsHeader}>
          <h2 className={styles.requestsTitle}>Recent requests</h2>
        </div>
        <p className={styles.empty} role="status">
          Loading…
        </p>
      </section>
    </ContentArea>
  )
}
