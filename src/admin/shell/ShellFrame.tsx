import type { ReactNode } from 'react'

import styles from './Shell.module.css'

export const SHELL_MAIN_ID = 'kz-main'

/**
 * Cadre de la coque (composant serveur, sans état) : lien d'évitement, sidebar, top bar et zone de contenu qui
 * défile. Les écrans rendent leur propre `<ContentArea>` (gap, marges, largeur selon l'écran).
 */
export function ShellFrame({ sidebar, topBar, children }: { sidebar: ReactNode; topBar: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <a href={`#${SHELL_MAIN_ID}`} className={styles.skip}>
        Skip to content
      </a>
      {sidebar}
      <div className={styles.main}>
        <div className={styles.topBar}>{topBar}</div>
        <main id={SHELL_MAIN_ID} tabIndex={-1} className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  )
}
