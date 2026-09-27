import { ContentArea } from '@/admin/ui'

import styles from './PageSkeleton.module.css'

/** Squelette de C1 / C2 / C6 pendant le chargement : formes statiques (pas d'animation), annoncé « Loading page ». */
export function PageSkeleton() {
  return (
    <ContentArea padding="tabs" gap={20} aria-busy="true" aria-label="Loading page">
      <div className={styles.header}>
        <span className={styles.bar} style={{ width: 120, height: 20 }} />
        <span className={styles.bar} style={{ width: 145, height: 29, marginLeft: 'auto' }} />
      </div>
      <div className={styles.tabs}>
        <span className={styles.bar} style={{ width: 52, height: 14 }} />
        <span className={styles.bar} style={{ width: 28, height: 14 }} />
      </div>
      <div className={styles.body}>
        <div className={styles.column}>
          <span className={styles.block} style={{ height: 220 }} />
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={styles.block} style={{ height: 36 }} />
          ))}
        </div>
        <span className={styles.block} style={{ width: 440, height: 520 }} />
      </div>
      <span className="kz-visually-hidden" role="status">
        Loading page…
      </span>
    </ContentArea>
  )
}
