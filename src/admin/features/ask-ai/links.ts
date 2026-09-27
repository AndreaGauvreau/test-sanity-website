import type { AskLink } from '../../core/contracts/engine'
import type { AdminConfig } from '../../core/contracts/manifest'
import { can, type AdminRole } from '../../core/contracts/roles'

/**
 * Catalogue des écrans de l'admin vers lesquels Ask AI (G4) a le droit de renvoyer (« Open Media ↗ »,
 * « Open Home in AI editor ↗ »). Construit depuis le manifeste (`src/admin.config.ts`) et le rôle : un lien vers un
 * écran que le rôle ne voit pas (Code pour le client, Team pour Kuartz) n'existe pas.
 *
 * PUR et en imports RELATIFS seulement : ce fichier est importé tel quel par le moteur (`engine/src/ask`), par le moteur
 * simulé (`core/engine/mock/ask.ts`) et par le panneau. Jamais d'alias `@/`, de React, de Next ni de Node ici.
 *
 * Les libellés des boutons sont TOUJOURS ceux du catalogue (jamais un texte écrit par le modèle) et un lien hors
 * catalogue est retiré (`resolveAskLinks`).
 */

export type AskRoute = {
  /** Chemin de l'admin (« /admin/media », « /admin/editor?page=home »). */
  href: string
  /** Libellé du bouton (« Open Media »). */
  label: string
  /** Nom court de l'écran (« Media », « Home › SEO »), pour citer l'écran dans une réponse. */
  screen: string
  /** Ce qu'on fait sur cet écran (anglais, donné au modèle comme donnée). */
  description: string
}

/** Nombre maximal de liens sous une réponse. */
export const MAX_ASK_LINKS = 3

/** Écrans de l'admin permis pour ce rôle, dans l'ordre de la sidebar. */
export function askRoutes(config: AdminConfig, role: AdminRole): AskRoute[] {
  const routes: AskRoute[] = [
    { href: '/admin', label: 'Open Overview', screen: 'Overview', description: 'Summary of the site: pages, collections, recent activity.' },
    {
      href: '/admin/settings/general',
      label: 'Open General',
      screen: 'Site Settings › General',
      description: 'Site title, site description, favicons (light and dark), social sharing image, search engine indexing.',
    },
  ]
  if (can(role, 'settings.code')) {
    routes.push({
      href: '/admin/settings/code',
      label: 'Open Code',
      screen: 'Site Settings › Code',
      description: 'Scripts added to the site (analytics, tags): placement, pages, when they run.',
    })
  }
  if (can(role, 'settings.team')) {
    routes.push({
      href: '/admin/settings/team',
      label: 'Open Team',
      screen: 'Site Settings › Team',
      description: 'Members of the admin and their roles, invitations.',
    })
  }
  routes.push({
    href: '/admin/settings/usage',
    label: 'Open Usage',
    screen: 'Site Settings › Usage',
    description: 'AI usage: input and output tokens and cost, by period, feature and model.',
  })

  const collectionLabels = new Set(config.collections.map((c) => c.label.toLowerCase()))
  for (const page of config.pages) {
    // « Blog » est à la fois une page et une collection : la page devient « Open Blog page ».
    const name = collectionLabels.has(page.label.toLowerCase()) ? `${page.label} page` : page.label
    routes.push({
      href: `/admin/pages/${page.id}`,
      label: `Open ${name}`,
      screen: `Pages › ${page.label} › Content`,
      description: page.document
        ? `Texts of the ${page.label} page (${page.path}), section by section.`
        : `The ${page.label} page (${page.path}) has no editable content.`,
    })
    if (page.seo) {
      routes.push({
        href: `/admin/pages/${page.id}/seo`,
        label: `Open ${page.label} SEO`,
        screen: `Pages › ${page.label} › SEO`,
        description: `Meta title, meta description, social image and indexing of ${page.path}; its JSON-LD (read only).`,
      })
    }
    if (page.article) {
      const collection = config.collections.find((c) => c.type === page.article?.collection)
      const noun = collection?.singular ?? 'Article'
      routes.push({
        href: `/admin/pages/${page.id}/slug/seo`,
        label: `Open ${noun} page SEO`,
        screen: `Pages › ${page.article.path} › SEO`,
        description: `SEO template of every ${noun.toLowerCase()} page (${page.article.path}), with {{field}} variables.`,
      })
    }
    if (page.aiEditor && can(role, 'ai.editor')) {
      routes.push({
        href: editorHref(page.id),
        label: `Open ${page.label} in AI editor`,
        screen: `AI editor › ${page.label}`,
        description: `Change texts and styles of the ${page.label} page with Claude, on a draft to validate.`,
      })
    }
  }

  for (const collection of config.collections) {
    routes.push({
      href: `/admin/cms/${collection.id}`,
      label: `Open ${collection.label}`,
      screen: `CMS › ${collection.label}`,
      description: `List of ${collection.label} items (${collection.singular.toLowerCase()}s): add, edit, reorder, search.`,
    })
  }

  routes.push(
    {
      href: '/admin/media',
      label: 'Open Media',
      screen: 'Assets › Media',
      description: 'Media library: images, alt text, where each media is used. A used media cannot be deleted.',
    },
    {
      href: '/admin/publish',
      label: 'Open Publish',
      screen: 'Publish',
      description: 'Unpublished changes waiting to go live (content and AI design changes), and the Publish button.',
    },
    {
      href: '/admin/publish/versions',
      label: 'Open Versions',
      screen: 'Publish › Versions',
      description: 'History of the publications of the site.',
    },
  )
  return routes
}

export function editorHref(pageId: string): string {
  return `/admin/editor?page=${encodeURIComponent(pageId)}`
}

/**
 * Normalise un lien proposé (espaces, guillemets, ponctuation finale, barre finale, origine du site) ; null si ce n'est
 * pas un chemin de l'admin plausible.
 */
export function normalizeAskHref(raw: string): string | null {
  let href = raw.trim().replace(/^[<"'“‘`(\[]+|[>"'”’`)\].,;:!]+$/g, '')
  // Une URL absolue vers ce même admin est ramenée à son chemin ; toute autre origine est refusée plus bas.
  href = href.replace(/^https?:\/\/[^/\s]+(?=\/admin(?:[/?]|$))/i, '')
  if (!href.startsWith('/admin')) return null
  if (href.length > 200 || /\s|\/\/|\\|\.\./.test(href)) return null
  if (href.length > '/admin'.length && href.endsWith('/') && !href.includes('?')) href = href.slice(0, -1)
  return href
}

export function findAskRoute(routes: readonly AskRoute[], raw: string): AskRoute | null {
  const href = normalizeAskHref(raw)
  if (!href) return null
  return routes.find((route) => route.href === href) ?? null
}

/**
 * Liens proposés → liens du catalogue, dédoublonnés, `MAX_ASK_LINKS` au plus. Tout lien hors catalogue est retiré ;
 * le libellé vient toujours du catalogue.
 */
export function resolveAskLinks(routes: readonly AskRoute[], proposed: readonly string[]): AskLink[] {
  const out: AskLink[] = []
  for (const raw of proposed) {
    const route = findAskRoute(routes, raw)
    if (!route || out.some((link) => link.href === route.href)) continue
    out.push({ label: route.label, href: route.href })
    if (out.length === MAX_ASK_LINKS) break
  }
  return out
}

/** Écran correspondant à une route ouverte (« /admin/cms/blog/abc » → CMS › Blog), le plus long préfixe l'emporte. */
export function screenOf(routes: readonly AskRoute[], pathname: string | undefined): AskRoute | null {
  if (!pathname) return null
  const path = pathname.split(/[?#]/)[0] ?? ''
  if (path === '/admin/editor') {
    const page = new URLSearchParams(pathname.split('?')[1]?.split('#')[0] ?? '').get('page')
    return page ? (routes.find((route) => route.href === editorHref(page)) ?? null) : null
  }
  let best: AskRoute | null = null
  for (const route of routes) {
    if (route.href.includes('?')) continue
    const match = route.href === '/admin' ? path === '/admin' : path === route.href || path.startsWith(`${route.href}/`)
    if (match && (!best || route.href.length > best.href.length)) best = route
  }
  return best
}

/** Forme d'un lien sûr côté navigateur (défense en profondeur : chemin de l'admin, sans origine ni schéma). */
const SAFE_ADMIN_HREF = /^\/admin(?:\/[A-Za-z0-9_-]+)*(?:\?page=[A-Za-z0-9_%-]+)?$/

export function isSafeAskHref(href: unknown): href is string {
  return typeof href === 'string' && href.length <= 200 && SAFE_ADMIN_HREF.test(href)
}
