import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { REQUEST_PATH_HEADER } from '@/admin/core/auth/constants'
import { requireSession } from '@/admin/core/auth/session'
import { isShellPathRefused } from '@/admin/shell/access'
import { loadShellSidebarProps, ShellChrome } from '@/admin/shell/ShellChrome'

/**
 * Coque des écrans de l'admin (B, C, E) : Sidebar + Top bar + zone de contenu qui défile, sous <AskAiProvider>.
 * 1. requireSession EN PREMIER (sans session : redirection vers A1 puis retour ici).
 * 2. Droit de la page d'après l'URL (en-tête x-kz-path, toujours réécrit par le proxy) : refusé → notFound() ICI,
 *    avant la frontière <Suspense> de loading.tsx, donc une vraie 404 (rendue par src/app/admin/not-found.tsx, dans
 *    la coque). Chaque page garde quand même sa propre garde : un layout ne se recalcule pas à la navigation client.
 * Hors coque : /admin/login (A1), /admin/auth/callback, /admin/editor (plein écran).
 */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()
  if (isShellPathRefused(session.role, (await headers()).get(REQUEST_PATH_HEADER))) notFound()
  const sidebar = await loadShellSidebarProps(session)
  return <ShellChrome sidebar={sidebar}>{children}</ShellChrome>
}
