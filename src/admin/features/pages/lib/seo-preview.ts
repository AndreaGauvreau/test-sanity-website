import type { Metadata } from 'next'

import { articleMetadata, layoutMetadata, pageMetadata, type ArticleTemplate, type SiteSettings } from '@/lib/seo'
import { resolveTemplate, type TemplateValues } from '@/lib/template-variables'

/**
 * Aperçus Google et réseaux sociaux de C2 / C6, FIDÈLES au rendu du site : on appelle les mêmes fonctions que le
 * site (`src/lib/seo.ts` : layoutMetadata, pageMetadata, articleMetadata), puis on résout les métadonnées comme
 * Next le fait (modèle de titre du layout, og:title / og:description hérités du titre et de la description,
 * openGraph de la page qui remplace celui du layout). Pur : importable côté client (mise à jour à la frappe).
 */

export type SeoPreview = {
  /** <title> (résultat Google). */
  title: string
  /** meta description. */
  description: string
  ogTitle: string
  ogDescription: string
  ogImage: string | null
  /** Indexation effective (le site l'emporte sur la page). */
  indexed: boolean
}

type SanityImageValue = { asset?: { _ref: string } | null; crop?: unknown; hotspot?: unknown } | null | undefined

export type PageSeoValues = {
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: SanityImageValue
  allowIndexing?: boolean | null
}

function firstImageUrl(images: unknown): string | null {
  const list = Array.isArray(images) ? images : images ? [images] : []
  const first = list[0] as { url?: unknown } | string | undefined
  if (!first) return null
  if (typeof first === 'string') return first
  return typeof first.url === 'string' ? first.url : first.url instanceof URL ? first.url.toString() : null
}

function stringTitle(title: Metadata['title']): string | null {
  if (typeof title === 'string') return title
  if (title && typeof title === 'object' && 'absolute' in title && typeof title.absolute === 'string') return title.absolute
  return null
}

/**
 * Résolution Next d'une page sous le layout du site. `segmentRoot` : page dans le segment du layout (« / »),
 * où le modèle de titre ne s'applique pas (pageMetadata a déjà ajouté le suffixe).
 */
export function resolveMetadata(layout: Metadata, page: Metadata, segmentRoot: boolean): SeoPreview {
  const layoutTitle = layout.title && typeof layout.title === 'object' && 'template' in layout.title ? layout.title : null
  const template = layoutTitle?.template ?? '%s'
  const fallbackTitle = layoutTitle && 'default' in layoutTitle ? String(layoutTitle.default) : (stringTitle(layout.title) ?? '')
  const own = stringTitle(page.title)
  const title = own ? (segmentRoot || (page.title && typeof page.title === 'object') ? own : template.replace('%s', own)) : fallbackTitle
  const description = page.description ?? layout.description ?? ''
  const openGraph = (page.openGraph ?? layout.openGraph ?? {}) as { title?: unknown; description?: unknown; images?: unknown }
  const robots = (page.robots ?? layout.robots) as { index?: boolean } | undefined
  return {
    title,
    description,
    ogTitle: typeof openGraph.title === 'string' && openGraph.title ? openGraph.title : title,
    ogDescription: typeof openGraph.description === 'string' && openGraph.description ? openGraph.description : description,
    ogImage: firstImageUrl(openGraph.images),
    indexed: robots?.index !== false,
  }
}

/** Aperçu d'une page (C2), avec les valeurs du formulaire en cours. */
export function pageSeoPreview({
  settings,
  seo,
  path,
  defaultTitle,
}: {
  settings: SiteSettings | null
  seo: PageSeoValues
  /** Chemin public (« / » : segment racine du layout). */
  path: string
  /** Titre par défaut de la page (sans meta title), comme le site. Absent : titre du site. */
  defaultTitle?: string | null
}): SeoPreview {
  const segmentRoot = path === '/'
  const layout = layoutMetadata(settings)
  const page = pageMetadata({ settings, seo: seo as Parameters<typeof pageMetadata>[0]['seo'], defaultTitle, segmentRoot })
  return resolveMetadata(layout, page, segmentRoot)
}

/** Aperçu de la page article d'un élément (C6), avec le modèle en cours et les valeurs de l'article choisi. */
export function articleSeoPreview({
  settings,
  template,
  values,
  cover,
}: {
  settings: SiteSettings | null
  template: ArticleTemplate
  values: TemplateValues
  cover: { url: string | null; alt?: string | null }
}): SeoPreview {
  const layout = layoutMetadata(settings)
  const page = articleMetadata({ settings, template, values, cover })
  return resolveMetadata(layout, page, false)
}

/** Longueur estimée d'un champ à variables pour un article (C6 « ≈ 43 / 60 with … »), en points de code. */
export function estimatedLength(text: string, values: TemplateValues): number {
  return [...resolveTemplate(text, values, 'text').value].length
}

/** URL affichée par Google : « https://conduit.com › blog › carrier-portals ». */
export function displayUrl(domain: string, path: string): string {
  const parts = path.split('/').filter(Boolean)
  return [`https://${domain}`, ...parts].join(' › ')
}

/** « /blog/:slug » → « /blog/carrier-portals ». */
export function articlePath(pattern: string, slug: string): string {
  return pattern.replace(':slug', slug)
}
