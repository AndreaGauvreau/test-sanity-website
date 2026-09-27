import { PageHeader } from '@/admin/ui'

import styles from './general.module.css'
import skeleton from './skeleton.module.css'

/** B2 · état de chargement (loading.tsx) : mêmes colonnes que l'écran, blocs gris sans mouvement superflu. */
export function GeneralSkeleton() {
  return (
    <div className={styles.layout} aria-busy="true" aria-label="Loading site settings">
      <div className={styles.form}>
        <PageHeader title="General" meta="Site settings" />
        <div className={skeleton.block} style={{ height: 36 }} />
        <div className={skeleton.block} style={{ height: 76 }} />
        <div className={skeleton.block} style={{ height: 130 }} />
        <div className={skeleton.block} style={{ height: 19, width: 120 }} />
        <div className={skeleton.block} style={{ height: 147 }} />
        <div className={skeleton.block} style={{ height: 197 }} />
      </div>
      <div className={styles.previews}>
        <div className={skeleton.block} style={{ height: 15, width: 60 }} />
        <div className={skeleton.block} style={{ height: 116 }} />
        <div className={skeleton.block} style={{ height: 301 }} />
        <div className={skeleton.block} style={{ height: 58 }} />
      </div>
    </div>
  )
}
