'use client'

import { useId, useState, type ElementType, type HTMLAttributes, type MouseEventHandler, type ReactNode, type Ref } from 'react'
import { Avatar, type AvatarTone } from '../Avatar'
import { Button } from '../Button'
import { IconButton } from '../IconButton'
import { Icon, type IconName } from '../icons'
import { NavItem } from '../NavItem'
import { NavSection } from '../NavSection'
import { Tag } from '../Tag'
import { cx } from '../utils/cx'
import styles from './Sidebar.module.css'

export type SidebarSite = {
  /** « Conduit » (Label Large). */
  name: string
  /** « conduit.com ». */
  domain: string
  /** Écran courant, après le domaine : « conduit.com · Overview ». */
  screen?: string
  /** Logo / favicon (28 px) ; défaut : globe. */
  logo?: string
}

export type SidebarNavItem = {
  id: string
  label: string
  icon?: IconName
  href?: string
  onClick?: MouseEventHandler<HTMLElement>
  active?: boolean
  /** Compteur (nombre d'éléments d'une collection, d'articles d'une page listing). */
  count?: ReactNode
  /** Tag (« KUARTZ » bleu, « CLIENT » vert). */
  tag?: ReactNode
  /** Sous-pages (page listing → sa page article « slug: »). Présentes : chevron pour déplier. */
  children?: readonly SidebarNavItem[]
  /** Dépliée au départ (défaut true, ou forcément si une sous-page est active). */
  defaultExpanded?: boolean
}

export type SidebarSection = {
  id: string
  /** « SITE SETTINGS », « PAGES », « CMS », « ASSETS ». */
  label: string
  /** Action à droite du titre (IconButton xsmall). */
  action?: ReactNode
  items: readonly SidebarNavItem[]
}

export type SidebarUser = {
  name: string
  /** « Kuartz », « Client » : affiché « Andrea · Kuartz ». */
  role: string
  avatar?: string
  initials?: string
  /** blue = Kuartz, green = client. */
  tone?: AvatarTone
}

export type SidebarProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  site: SidebarSite
  sections: readonly SidebarSection[]
  user: SidebarUser
  /** Bouton « ✦ Ask AI » (ouvre la fenêtre Ask AI de la feature ask-ai). Absent : bouton masqué. */
  onAskAI?: () => void
  /** Déconnexion (IconButton « Log out »). Pour un formulaire POST, passer `logout`. */
  onLogout?: () => void
  /** Contrôle de déconnexion sur mesure (ex. `<form action={logout}><IconButton type="submit" …/></form>`). */
  logout?: ReactNode
  /** Lien vers le hub Kuartz (rôle Kuartz seulement). */
  hub?: { href: string; label?: string }
  /** Composant de lien (next/link) pour les entrées à `href`. */
  linkAs?: ElementType
  /** Entrées dépliées (contrôlé) : id → dépliée. */
  expanded?: Record<string, boolean>
  onExpandedChange?: (id: string, expanded: boolean) => void
  ref?: Ref<HTMLElement>
}

/**
 * Sidebar de l'admin d'un site (Figma « Sidebar » 333:1247) : 240 px, bg/primary, trait droit border/subtle.
 * En-tête (logo 28, nom, domaine · écran, bouton Ask AI), navigation par sections (Nav section + Nav item),
 * pied (lien hub optionnel, utilisateur, Log out). Présentationnelle : l'appelant fournit sections, entrées,
 * état actif et liens (shell). Pages listing : chevron pour déplier la page article (« slug: » + compteur).
 */
export function Sidebar({
  site,
  sections,
  user,
  onAskAI,
  onLogout,
  logout,
  hub,
  linkAs,
  expanded: expandedProp,
  onExpandedChange,
  className,
  'aria-label': ariaLabel = 'Admin',
  ref,
  ...rest
}: SidebarProps) {
  const idBase = useId()
  const [innerExpanded, setInnerExpanded] = useState<Record<string, boolean>>({})

  const isExpanded = (item: SidebarNavItem) => {
    const source = expandedProp ?? innerExpanded
    if (source[item.id] !== undefined) return source[item.id]
    if (item.children?.some((c) => c.active)) return true
    return item.defaultExpanded ?? true
  }
  const setExpanded = (id: string, next: boolean) => {
    if (!expandedProp) setInnerExpanded((prev) => ({ ...prev, [id]: next }))
    onExpandedChange?.(id, next)
  }

  const renderItem = (item: SidebarNavItem, depth: 0 | 1) => {
    const hasChildren = depth === 0 && item.children && item.children.length > 0
    const open = hasChildren ? isExpanded(item) : undefined
    return (
      <li key={item.id} className={styles.li}>
        <NavItem
          label={item.label}
          icon={item.icon}
          count={item.count}
          tag={item.tag}
          href={item.href}
          as={item.href != null ? linkAs : undefined}
          onClick={item.onClick}
          active={item.active}
          depth={depth}
          expanded={open}
          onExpandedChange={hasChildren ? (next) => setExpanded(item.id, next) : undefined}
        />
        {hasChildren && open ? <ul className={styles.list}>{item.children!.map((child) => renderItem(child, 1))}</ul> : null}
      </li>
    )
  }

  return (
    <aside ref={ref} className={cx(styles.sidebar, className)} {...rest}>
      <div className={styles.header}>
        <div className={styles.site}>
          <span className={styles.logo}>
            {site.logo ? <img src={site.logo} alt="" className={styles.logoImage} /> : <Icon name="globe" size={16} set={18} />}
          </span>
          <span className={styles.siteText}>
            <span className={styles.siteName}>{site.name}</span>
            <span className={styles.siteUrl}>
              {site.domain}
              {site.screen ? ` · ${site.screen}` : ''}
            </span>
          </span>
        </div>
        {onAskAI ? (
          <Button variant="secondary" size="small" iconLeft="ai" block onClick={onAskAI} className={styles.askAI}>
            Ask AI
          </Button>
        ) : null}
      </div>

      <nav aria-label={ariaLabel} className={styles.nav}>
        {sections.map((section) => {
          const labelId = `${idBase}-${section.id}`
          return (
            <div key={section.id} className={styles.section}>
              <NavSection label={section.label} labelId={labelId} action={section.action} />
              <ul className={styles.list} aria-labelledby={labelId}>
                {section.items.map((item) => renderItem(item, 0))}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className={styles.footer}>
        {hub ? (
          <NavItem
            label={hub.label ?? 'Kuartz hub'}
            icon="hub"
            href={hub.href}
            as={linkAs}
            tag={<Tag tone="info">KUARTZ</Tag>}
          />
        ) : null}
        <div className={styles.user}>
          <Avatar name={user.name} initials={user.initials} src={user.avatar} size={20} tone={user.tone ?? 'blue'} decorative />
          <span className={styles.userName}>
            {user.name} · {user.role}
          </span>
          {logout ?? (onLogout ? <IconButton icon="logout" label="Log out" onClick={onLogout} tooltipPlacement="top" /> : null)}
        </div>
      </div>
    </aside>
  )
}
