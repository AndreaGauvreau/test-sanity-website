import { ContentArea, PageHeader } from '@/admin/ui'

import styles from './publish.module.css'

/** Squelette de E1 / E2 (Server Component) : même grille que l'écran, blocs gris qui pulsent (coupé en mouvement réduit). */
export function PublishSkeleton() {
  return (
    <ContentArea gap={20} aria-busy="true">
      <PageHeader title="Publish" meta={<span className="kz-visually-hidden">Loading…</span>} />
      <div className={styles.skeleton} style={{ height: 35, maxWidth: 160 }} />
      <div className={styles.body}>
        <div className={styles.changes}>
          <div className={styles.skeleton} style={{ height: 150 }} />
          <div className={styles.skeleton} style={{ height: 96 }} />
        </div>
        <div className={styles.aside}>
          <div className={styles.skeleton} style={{ height: 292 }} />
          <div className={styles.skeleton} style={{ height: 37 }} />
        </div>
      </div>
    </ContentArea>
  )
}
