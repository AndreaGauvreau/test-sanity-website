import type { ReactNode } from 'react'

import { adminConfig } from '@/admin.config'
import { getDevLoginState } from '@/admin/core/auth/session'
import { toPublicSession, type Session } from '@/admin/core/contracts/session'
import { AskAiProvider } from '@/admin/features/ask-ai/AskAiProvider'
import { PublishStatusBar } from '@/admin/features/publish/PublishStatusBar'

import { getCollectionCounts } from './counts'
import { ShellFrame } from './ShellFrame'
import { ShellSidebar, type ShellSidebarProps } from './ShellSidebar'
import { buildShellSidebarProps } from './sidebar-props'

/**
 * SERVEUR : props de la sidebar pour une session (comptes des collections et état de dev en parallèle). Les comptes
 * ne lèvent jamais (null si Sanity est lent ou en erreur). La session complète ne quitte pas le serveur :
 * `buildShellSidebarProps` ne garde que nom, image https et libellé du rôle.
 */
export async function loadShellSidebarProps(session: Session): Promise<ShellSidebarProps> {
  const [counts, devState] = await Promise.all([
    getCollectionCounts(adminConfig.collections),
    session.dev ? getDevLoginState() : Promise.resolve(null),
  ])
  return buildShellSidebarProps({
    config: adminConfig,
    session: toPublicSession(session),
    counts,
    hubUrlEnv: process.env.KUARTZ_HUB_URL,
    devState,
  })
}

/**
 * Habillage complet de la coque : Ask AI (fournisseur), Sidebar, Top bar (`<PublishStatusBar>`), zone de contenu.
 * Utilisé par le layout `(shell)` et par le 404 de l'admin (`src/app/admin/not-found.tsx`) quand une session existe.
 */
export function ShellChrome({ sidebar, children }: { sidebar: ShellSidebarProps; children: ReactNode }) {
  return (
    <AskAiProvider>
      <ShellFrame sidebar={<ShellSidebar {...sidebar} />} topBar={<PublishStatusBar siteUrl={adminConfig.site.url} />}>
        {children}
      </ShellFrame>
    </AskAiProvider>
  )
}
