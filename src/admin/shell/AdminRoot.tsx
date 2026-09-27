import type { ReactNode } from 'react'

import { Icon, ToastProvider, cx } from '@/admin/ui'

import styles from './AdminRoot.module.css'

export const COMPUTER_ONLY_MESSAGE = 'This admin is designed for a computer.'

/**
 * Racine de tout /admin (posée par src/app/admin/layout.tsx) : `data-kz-admin` + `data-theme="dark"` + classes des
 * polices sur LE MÊME élément (tokens.css y résout les polices), `<ToastProvider>` une seule fois, et la garde
 * « écran d'ordinateur » : sous 1 024 px, l'admin est masqué (display: none, donc aussi pour les lecteurs d'écran)
 * et seul le message du Figma s'affiche. En CSS pur : aucun écart serveur / client, rien à hydrater.
 */
export function AdminRoot({ fontClassName, children }: { fontClassName?: string; children: ReactNode }) {
  return (
    <div data-kz-admin="" data-theme="dark" className={cx(fontClassName, styles.root)}>
      <div className={styles.app} data-kz-admin-app="">
        <ToastProvider>{children}</ToastProvider>
      </div>
      <div className={styles.guard} data-kz-computer-guard="">
        <Icon name="desktop" size={18} className={styles.guardIcon} />
        <p className={styles.guardText}>{COMPUTER_ONLY_MESSAGE}</p>
      </div>
    </div>
  )
}
