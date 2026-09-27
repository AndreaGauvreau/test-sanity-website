import type { AdminConfig } from '@/admin/core/contracts/manifest'
import { can, ROLE_LABEL, type AdminRole } from '@/admin/core/contracts/roles'
import type { PublicSession } from '@/admin/core/contracts/session'
import type { AvatarTone } from '@/admin/ui/Avatar'

import { buildShellNav, resolveHubUrl, toShellRouteConfig, type CollectionCounts } from './nav'
import type { ShellSidebarProps } from './ShellSidebar'

const TONE: Record<AdminRole, AvatarTone> = { kuartz: 'blue', client: 'green', editor: 'neutral' }

/**
 * Nom affiché dans la ligne utilisateur (« <nom> · <rôle> »). auth-core nomme l'utilisateur de dev « Dev · <rôle> » :
 * en session de dev, on retire ce suffixe pour ne pas afficher le rôle deux fois (la ligne était tronquée). Une vraie
 * session garde son nom Sanity tel quel.
 */
function displayName(name: string, roleLabel: string, dev: boolean): string {
  const suffix = ` · ${roleLabel}`
  return dev && name.endsWith(suffix) && name.length > suffix.length ? name.slice(0, -suffix.length) : name
}

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
    user: { name: displayName(session.user.name, ROLE_LABEL[role], session.dev), roleLabel: ROLE_LABEL[role], imageUrl, tone: TONE[role] },
    askAi: can(role, 'ai.ask'),
    hubUrl: can(role, 'hub.link') ? resolveHubUrl(hubUrlEnv) : undefined,
    // Sélecteur de rôle : session de dev seulement (une vraie session Sanity reste prioritaire, il n'y ferait rien).
    devRole: session.dev && devState?.available ? { active: role, roles: devState.roles } : undefined,
  }
}
