import { can, type AdminRole } from '@/admin/core/contracts/roles'
import type { AdminConfig, CollectionDef, PageDef } from '@/admin/core/contracts/manifest'
import { ICON_NAMES, type IconName } from '@/admin/ui/icons'

/**
 * Navigation de la coque (Sidebar), en fonctions PURES : construite côté serveur à partir du manifeste
 * (`admin.config.ts`), du rôle et des comptes d'éléments, puis rendue côté client (état actif selon l'URL).
 * Données sérialisables uniquement (passent du Server Component au composant client).
 *
 * Figma : « ÉLÉMENTS COMMUNS À TOUS LES ÉCRANS » (docs/admin/figma/README.md) et fiche Sidebar (333:1247).
 * Routes : docs/admin/ARCHITECTURE.md § 3.
 */

export const ADMIN_BASE = '/admin'

/** Tag d'une entrée : « KUARTZ » (bleu, Code) ou « CLIENT » (vert, Team). */
export type ShellNavTag = 'kuartz' | 'client'

export type ShellNavItem = {
  /** Identifiant stable : `settings.general`, `page:home`, `page:blog:article`, `cms:blog`, `media`. */
  id: string
  label: string
  icon: IconName
  href: string
  /** Nombre d'éléments (collection, page article). `null` : inconnu (requête en échec) → rien d'affiché. */
  count?: number | null
  tag?: ShellNavTag
  /** Page listing → sa page article (« slug: »). */
  children?: ShellNavItem[]
}

export type ShellNavSection = { id: string; label: string; items: ShellNavItem[] }

/** Nombre d'éléments par collection (`CollectionDef.id`) ; `null` si le comptage a échoué. */
export type CollectionCounts = Readonly<Record<string, number | null>>

const ICONS = new Set<string>(ICON_NAMES)

function iconOr(name: string, fallback: IconName): IconName {
  return ICONS.has(name) ? (name as IconName) : fallback
}

/** Collection d'une page article : `article.collection` désigne le type Sanity (« post ») ou, à défaut, l'id. */
export function articleCollection(page: PageDef, collections: readonly CollectionDef[]): CollectionDef | undefined {
  const key = page.article?.collection
  if (!key) return undefined
  return collections.find((c) => c.type === key) ?? collections.find((c) => c.id === key)
}

function countOf(counts: CollectionCounts, id: string | undefined): number | null {
  if (!id) return null
  const n = counts[id]
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Libellé d'une page dans la sidebar : « Home » pour la racine, sinon son chemin (« /blog »), comme le Figma. */
export function pageNavLabel(page: PageDef): string {
  return page.path === '/' ? page.label : page.path
}

export function buildShellNav(
  config: Pick<AdminConfig, 'pages' | 'collections'>,
  role: AdminRole,
  counts: CollectionCounts = {},
): ShellNavSection[] {
  const settings: ShellNavItem[] = [
    { id: 'settings.general', label: 'General', icon: 'sliders', href: `${ADMIN_BASE}/settings/general` },
  ]
  if (can(role, 'settings.code')) {
    settings.push({ id: 'settings.code', label: 'Code', icon: 'code', href: `${ADMIN_BASE}/settings/code`, tag: 'kuartz' })
  }
  if (can(role, 'settings.team')) {
    settings.push({ id: 'settings.team', label: 'Team', icon: 'team', href: `${ADMIN_BASE}/settings/team`, tag: 'client' })
  }
  settings.push({ id: 'settings.usage', label: 'Usage', icon: 'usage', href: `${ADMIN_BASE}/settings/usage` })

  const pages: ShellNavItem[] = config.pages.map((page) => {
    const item: ShellNavItem = {
      id: `page:${page.id}`,
      label: pageNavLabel(page),
      icon: page.path === '/' ? 'house' : 'page',
      href: `${ADMIN_BASE}/pages/${encodeURIComponent(page.id)}`,
    }
    if (page.article) {
      const collection = articleCollection(page, config.collections)
      item.children = [
        {
          id: `page:${page.id}:article`,
          label: 'slug:',
          icon: 'database',
          href: `${ADMIN_BASE}/pages/${encodeURIComponent(page.id)}/slug/seo`,
          count: countOf(counts, collection?.id),
        },
      ]
    }
    return item
  })

  const cms: ShellNavItem[] = config.collections.map((collection) => ({
    id: `cms:${collection.id}`,
    label: collection.label,
    icon: iconOr(collection.icon, 'database'),
    href: `${ADMIN_BASE}/cms/${encodeURIComponent(collection.id)}`,
    count: countOf(counts, collection.id),
  }))

  const sections: ShellNavSection[] = [{ id: 'settings', label: 'SITE SETTINGS', items: settings }]
  if (pages.length > 0) sections.push({ id: 'pages', label: 'PAGES', items: pages })
  if (cms.length > 0) sections.push({ id: 'cms', label: 'CMS', items: cms })
  sections.push({ id: 'assets', label: 'ASSETS', items: [{ id: 'media', label: 'Media', icon: 'image', href: `${ADMIN_BASE}/media` }] })
  return sections
}

export type ShellLocation = {
  /** Entrée active de la sidebar (null : Overview, Publish, page inconnue). */
  activeId: string | null
  /** Écran courant affiché après le domaine (« conduit.com · Overview »). */
  screen: string | null
}

/** Ce que la résolution de l'URL doit connaître du manifeste (forme réduite, passée au composant client). */
export type ShellRouteConfig = {
  pages: readonly { id: string; label: string; article?: unknown }[]
  collections: readonly { id: string; label: string }[]
}

/** Forme réduite du manifeste pour le client (pas de définitions de champs dans le bundle de la coque). */
export function toShellRouteConfig(config: Pick<AdminConfig, 'pages' | 'collections'>): ShellRouteConfig {
  return {
    pages: config.pages.map((p) => ({ id: p.id, label: p.label, article: p.article ? true : undefined })),
    collections: config.collections.map((c) => ({ id: c.id, label: c.label })),
  }
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * Entrée active et nom de l'écran d'après l'URL (routes : ARCHITECTURE § 3). Les sous-routes gardent l'entrée
 * de leur écran (C2 `…/seo` → la page ; C4 `/admin/cms/<collection>/<id>` → la collection).
 */
export function resolveShellLocation(pathname: string | null | undefined, config: ShellRouteConfig): ShellLocation {
  const path = (pathname ?? '').split(/[?#]/)[0].replace(/\/+$/, '')
  if (path !== ADMIN_BASE && !path.startsWith(`${ADMIN_BASE}/`)) return { activeId: null, screen: null }
  const segments = path.slice(ADMIN_BASE.length).split('/').filter(Boolean).map(safeDecode)
  const [area, first, second] = segments

  if (!area) return { activeId: null, screen: 'Overview' }

  switch (area) {
    case 'settings': {
      const labels: Record<string, string> = { general: 'General', code: 'Code', team: 'Team', usage: 'Usage' }
      return first && Object.hasOwn(labels, first) ? { activeId: `settings.${first}`, screen: labels[first] } : { activeId: null, screen: null }
    }
    case 'pages': {
      const page = config.pages.find((p) => p.id === first)
      if (!page) return { activeId: null, screen: null }
      if (second === 'slug' && page.article) return { activeId: `page:${page.id}:article`, screen: `${page.label} article page` }
      return { activeId: `page:${page.id}`, screen: page.label }
    }
    case 'cms': {
      const collection = config.collections.find((c) => c.id === first)
      return collection ? { activeId: `cms:${collection.id}`, screen: collection.label } : { activeId: null, screen: null }
    }
    case 'media':
      return { activeId: 'media', screen: 'Media' }
    case 'publish':
      return { activeId: null, screen: first === 'versions' ? 'Versions' : 'Publish' }
    default:
      return { activeId: null, screen: null }
  }
}

/** Lien « ↗ Kuartz hub » : URL absolue http(s) configurée (`KUARTZ_HUB_URL`), sinon le site de Kuartz. */
export const DEFAULT_KUARTZ_HUB_URL = 'https://kuartz.studio'

export function resolveHubUrl(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_KUARTZ_HUB_URL
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return DEFAULT_KUARTZ_HUB_URL
    if (url.username || url.password) return DEFAULT_KUARTZ_HUB_URL
    return url.toString()
  } catch {
    return DEFAULT_KUARTZ_HUB_URL
  }
}

/** Lien externe (nouvel onglet) : URL absolue, ou autre origine que l'admin. */
export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')
}
