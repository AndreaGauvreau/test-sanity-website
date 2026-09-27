import type { Metadata } from 'next'

import { getSession } from '@/admin/core/auth/session'
import { loadShellSidebarProps, ShellChrome } from '@/admin/shell/ShellChrome'
import { ShellNotFound } from '@/admin/shell/states/ShellNotFound'

export const metadata: Metadata = { title: 'Page not found' }

/**
 * 404 de l'admin hors du segment (shell) : URL inconnue (/admin/[...missing]), page refusée par le layout de la coque
 * (vraie 404, FOLLOWUPS #21), notFound() de l'éditeur plein écran ou de la galerie en production.
 * Avec une session : dans la coque (sidebar utilisable) ; sans session, ou si l'habillage échoue : plein écran.
 */
export default async function AdminNotFound() {
  const session = await getSession()
  if (session) {
    try {
      const sidebar = await loadShellSidebarProps(session)
      return (
        <ShellChrome sidebar={sidebar}>
          <ShellNotFound />
        </ShellChrome>
      )
    } catch (err) {
      console.warn('[admin/shell] 404 shown without the shell:', err instanceof Error ? err.message : err)
    }
  }
  return <ShellNotFound standalone />
}
