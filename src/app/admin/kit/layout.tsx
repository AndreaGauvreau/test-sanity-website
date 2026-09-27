import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { adminFontClassName } from '@/admin/ui/fonts'
import '@/admin/ui/tokens.css'
import '@/admin/ui/base.css'
import styles from './kit.module.css'

export const metadata: Metadata = {
  title: 'Kit — Kuartz Admin',
  robots: { index: false, follow: false },
}

// Galerie de développement du kit UI (ui-foundations). Pose elle-même la racine de l'admin :
// tokens, base, polices, thème sombre. Ne rend ni <html> ni <body> (layout racine commun au site).
// Props typées à la main : les types de routes générés (.next/types) peuvent être en retard sur le dev.
export default function KitLayout({ children }: { children: ReactNode }) {
  return (
    <div data-kz-admin="" data-theme="dark" className={`${adminFontClassName} ${styles.root}`}>
      {children}
    </div>
  )
}
