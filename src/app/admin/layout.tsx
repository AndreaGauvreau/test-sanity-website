import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { adminConfig } from '@/admin.config'
import { AdminRoot } from '@/admin/shell/AdminRoot'
import { adminFontClassName } from '@/admin/ui/fonts'
import '@/admin/ui/tokens.css'
import '@/admin/ui/base.css'

/**
 * Layout de tout /admin (propriété de shell) : tokens puis base du kit (CSS importé seulement ici et sous
 * src/app/admin/), polices, thème sombre, <ToastProvider> unique et garde « écran d'ordinateur » (AdminRoot).
 * Ne rend ni <html> ni <body> : le layout racine est partagé avec le site et le Studio.
 * Props typées à la main : les types de routes générés (.next/types) peuvent être en retard sur le dev.
 */
export const metadata: Metadata = {
  title: { default: `${adminConfig.site.name} — Admin`, template: `%s · ${adminConfig.site.name} Admin` },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'same-origin',
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminRoot fontClassName={adminFontClassName}>{children}</AdminRoot>
}
