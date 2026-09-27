import type { ReactNode } from 'react'

import { adminConfig } from '@/admin.config'
import { getDevLoginState, requireSession } from '@/admin/core/auth/session'
import { toPublicSession } from '@/admin/core/contracts/session'
import { AskAiProvider } from '@/admin/features/ask-ai/AskAiProvider'
import { PublishStatusBar } from '@/admin/features/publish/PublishStatusBar'
import { getCollectionCounts } from '@/admin/shell/counts'
import { ShellFrame } from '@/admin/shell/ShellFrame'
import { ShellSidebar } from '@/admin/shell/ShellSidebar'
import { buildShellSidebarProps } from '@/admin/shell/sidebar-props'

/**
 * Coque des écrans de l'admin (B, C, E) : Sidebar + Top bar + zone de contenu qui défile, sous <AskAiProvider>.
 * requireSession EN PREMIER (sans session : redirection vers A1 puis retour ici). Chaque page appelle aussi sa
 * propre garde : un layout ne se recalcule pas à chaque navigation.
 * Hors coque : /admin/login (A1), /admin/auth/callback, /admin/editor (plein écran).
 */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()
  const [counts, devState] = await Promise.all([
    getCollectionCounts(adminConfig.collections),
    session.dev ? getDevLoginState() : Promise.resolve(null),
  ])
  const sidebar = buildShellSidebarProps({
    config: adminConfig,
    session: toPublicSession(session),
    counts,
    hubUrlEnv: process.env.KUARTZ_HUB_URL,
    devState,
  })

  return (
    <AskAiProvider>
      <ShellFrame sidebar={<ShellSidebar {...sidebar} />} topBar={<PublishStatusBar siteUrl={adminConfig.site.url} />}>
        {children}
      </ShellFrame>
    </AskAiProvider>
  )
}
