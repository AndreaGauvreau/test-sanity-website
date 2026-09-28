'use client'

import { usePathname } from 'next/navigation'
import { useMemo } from 'react'

import type { AdminRole } from '@/admin/core/contracts/roles'
import { useSiteLogo } from '@/admin/core/site-logo'
import { useAskAi } from '@/admin/features/ask-ai/AskAiProvider'
import { IconButton, Sidebar, Tag, type AvatarTone, type SidebarNavItem, type SidebarSection } from '@/admin/ui'

import { DevRoleMenu } from './DevRoleMenu'
import { ShellLink } from './ShellLink'
import { resolveShellLocation, type ShellNavItem, type ShellNavSection, type ShellRouteConfig } from './nav'
import styles from './Shell.module.css'

export const LOGOUT_ENDPOINT = '/admin/api/auth/logout'

export type ShellSidebarUser = {
  name: string
  /** ROLE_LABEL du rôle (« Kuartz », « Client admin », « Editor »). */
  roleLabel: string
  imageUrl?: string
  tone: AvatarTone
}

export type ShellSidebarProps = {
  /** `logo` : favicon du site (serveur, au chargement) ; suivi sans rechargement par `useSiteLogo`. */
  site: { name: string; domain: string; logo?: string }
  sections: ShellNavSection[]
  routes: ShellRouteConfig
  user: ShellSidebarUser
  /** « ✦ Ask AI » (droit ai.ask). */
  askAi: boolean
  /** Lien « ↗ Kuartz hub » (droit hub.link) ; absent pour les autres rôles. */
  hubUrl?: string
  /** Sélecteur de rôle de développement (session de dev seulement). */
  devRole?: { active: AdminRole; roles: readonly AdminRole[] }
}

function TagFor({ tag }: { tag: ShellNavItem['tag'] }) {
  if (tag === 'kuartz') return <Tag tone="info">KUARTZ</Tag>
  if (tag === 'client') return <Tag tone="success">CLIENT</Tag>
  return null
}

function toSidebarItem(item: ShellNavItem, activeId: string | null): SidebarNavItem {
  return {
    id: item.id,
    label: item.label,
    icon: item.icon,
    href: item.href,
    active: item.id === activeId,
    count: typeof item.count === 'number' ? item.count : undefined,
    tag: item.tag ? <TagFor tag={item.tag} /> : undefined,
    children: item.children?.map((child) => toSidebarItem(child, activeId)),
  }
}

/**
 * Sidebar de la coque : le composant `Sidebar` du kit, câblé à l'URL (entrée active, écran courant), à Ask AI
 * (useAskAi().open) et à la déconnexion (formulaire POST, fonctionne sans JavaScript). Les sections arrivent déjà
 * filtrées selon le rôle par le serveur (buildShellNav) ; ce composant ne reçoit aucune donnée sensible.
 */
export function ShellSidebar({ site, sections, routes, user, askAi, hubUrl, devRole }: ShellSidebarProps) {
  const pathname = usePathname()
  const { open } = useAskAi()
  const location = useMemo(() => resolveShellLocation(pathname, routes), [pathname, routes])
  // Favicon du site : valeur du serveur au chargement, puis la dernière mise à jour faite dans B2 · General.
  const logo = useSiteLogo(site.logo)

  const kitSections: SidebarSection[] = useMemo(
    () =>
      sections.map((section) => ({
        id: section.id,
        label: section.label,
        items: section.items.map((item) => toSidebarItem(item, location.activeId)),
      })),
    [sections, location.activeId],
  )

  return (
    <Sidebar
      className={styles.sidebar}
      site={{ name: site.name, domain: site.domain, screen: location.screen ?? undefined, logo }}
      sections={kitSections}
      user={{ name: user.name, role: user.roleLabel, avatar: user.imageUrl, tone: user.tone }}
      onAskAI={askAi ? open : undefined}
      hub={hubUrl ? { href: hubUrl } : undefined}
      linkAs={ShellLink}
      logout={
        <span className={styles.userActions}>
          {devRole ? <DevRoleMenu activeRole={devRole.active} roles={devRole.roles} /> : null}
          <form method="post" action={LOGOUT_ENDPOINT} className={styles.logoutForm}>
            <IconButton type="submit" icon="logout" label="Log out" tooltipPlacement="top" />
          </form>
        </span>
      }
    />
  )
}
