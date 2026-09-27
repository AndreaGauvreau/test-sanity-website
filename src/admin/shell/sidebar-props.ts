import type { AdminConfig } from '@/admin/core/contracts/manifest'
import { can, ROLE_LABEL, type AdminRole } from '@/admin/core/contracts/roles'
import type { PublicSession } from '@/admin/core/contracts/session'
import type { AvatarTone } from '@/admin/ui/Avatar'

import { buildShellNav, resolveHubUrl, toShellRouteConfig, type CollectionCounts } from './nav'
import type { ShellSidebarProps } from './ShellSidebar'

const TONE: Record<AdminRole, AvatarTone> = { kuartz: 'blue', client: 'green', editor: 'neutral' }

/**
 * Props de la sidebar (logique pure, appelée par le layout serveur). Ne garde de la session que ce que l'interface
 * affiche (nom, image, libellé du rôle) : ni e-mail, ni rôles Sanity, ni jeton ne partent vers le client.
 */
export function buildShellSidebarProps(input: {
  config: Pick<AdminConfig, 'site' | 'pages' | 'collections'>
  session: Pick<PublicSession, 'user' | 'role' | 'dev'>
  counts: CollectionCounts
  hubUrlEnv?: string | null
  devState?: { available: boolean; roles: readonly AdminRole[] } | null
}): ShellSidebarProps {
  const { config, session, counts, hubUrlEnv, devState } = input
  const role = session.role
  const imageUrl = session.user.imageUrl && /^https:\/\//.test(session.user.imageUrl) ? session.user.imageUrl : undefined
  return {
    site: { name: config.site.name, domain: config.site.domain },
    sections: buildShellNav(config, role, counts),
    routes: toShellRouteConfig(config),
    user: { name: session.user.name, roleLabel: ROLE_LABEL[role], imageUrl, tone: TONE[role] },
    askAi: can(role, 'ai.ask'),
    hubUrl: can(role, 'hub.link') ? resolveHubUrl(hubUrlEnv) : undefined,
    // Sélecteur de rôle : session de dev seulement (une vraie session Sanity reste prioritaire, il n'y ferait rien).
    devRole: session.dev && devState?.available ? { active: role, roles: devState.roles } : undefined,
  }
}
