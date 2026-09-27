import { ContentArea } from '@/admin/ui'

import styles from './ShellStates.module.css'

/**
 * Chargement d'un écran de la coque (loading.tsx du groupe (shell)) : la sidebar et la top bar restent en place,
 * la zone de contenu montre un squelette sobre (en-tête, rangée de cartes, bloc). Annoncé par role="status".
 */
export function ShellSkeleton() {
  return (
    <ContentArea gap={24} className={styles.skeleton} role="status" aria-live="polite" aria-busy="true">
      <span className="kz-visually-hidden">Loading…</span>
      <div className={styles.header} aria-hidden="true">
        <span className={`${styles.bar} ${styles.title}`} />
        <span className={`${styles.bar} ${styles.meta}`} />
      </div>
      <div className={styles.cards} aria-hidden="true">
        <span className={styles.card} />
        <span className={styles.card} />
        <span className={styles.card} />
        <span className={styles.card} />
      </div>
      <div className={styles.block} aria-hidden="true" />
    </ContentArea>
  )
}
