import type { Metadata } from 'next'

import { openGraphDefaults, siteName } from '@/lib/site'
import { resolveTemplate, type TemplateValues } from '@/lib/template-variables'
import { urlFor } from '@/sanity/lib/image'
import type { ARTICLE_SEO_QUERY_RESULT, SITE_SETTINGS_QUERY_RESULT } from '@/sanity/types'

/**
 * Métadonnées du site depuis Sanity (B2, C2, C6). Règles :
 * - titre d'une page = son meta title + « — Conduit » (modèle du layout, comme avant l'admin) ;
 *   sans meta title : le titre par défaut de la page, sinon celui du site (siteSettings.title) ;
 * - description, image OG : celles de la page, sinon celles du site ;
 * - indexation : noindex si le site (siteSettings.allowIndexing) OU la page (seo.allowIndexing) la coupe ;
 *   rien n'est émis tant que l'indexation est permise (sortie identique à celle d'avant l'admin) ;
 * - favicons clair / sombre (media prefers-color-scheme) : le clair sert partout si le sombre manque.
 */

export type SiteSettings = NonNullable<SITE_SETTINGS_QUERY_RESULT>

type SanityImage = { asset?: { _ref: string } | null; crop?: unknown; hotspot?: unknown } | null | undefined

type PageSeo = {
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: SanityImage
  allowIndexing?: boolean | null
}

/** URL 1200 × 630 d'une image Sanity (recadrage et point focal respectés), ou null. */
export function ogImageUrl(image: SanityImage): string | null {
  if (!image?.asset?._ref) return null
  return urlFor(image as Parameters<typeof urlFor>[0])
    .width(1200)
    .height(630)
    .url()
}

function ogImages(url: string | null, alt = '') {
  return url ? [{ url, width: 1200, height: 630, alt }] : undefined
}

/** robots : seulement quand l'indexation est coupée (le site l'emporte sur la page). */
export function robotsFor(settings: SiteSettings | null | undefined, page?: boolean | null): Metadata['robots'] {
  return settings?.allowIndexing === false || page === false ? { index: false, follow: false } : undefined
}

/** Métadonnées communes du layout du site : modèle de titre, défauts du site, favicons, indexation. */
export function layoutMetadata(settings: SiteSettings | null | undefined): Metadata {
  const icons = [
    settings?.faviconLight ? { url: settings.faviconLight } : null,
    settings?.faviconDark ? { url: settings.faviconDark, media: '(prefers-color-scheme: dark)' } : null,
  ].filter((icon): icon is NonNullable<typeof icon> => icon !== null)
  const images = ogImages(ogImageUrl(settings?.socialImage))
  return {
    title: { template: `%s — ${siteName}`, default: settings?.title || siteName },
    ...(settings?.description ? { description: settings.description } : {}),
    openGraph: { ...openGraphDefaults, ...(images ? { images } : {}) },
    twitter: { card: 'summary_large_image' },
    ...(icons.length ? { icons: { icon: icons } } : {}),
    ...(robotsFor(settings) ? { robots: robotsFor(settings) } : {}),
  }
}

/**
 * Métadonnées d'une page (C2). `segmentRoot` : la page est dans le même segment que le layout (« / »),
 * où le modèle de titre ne s'applique pas : le suffixe est ajouté ici.
 */
export function pageMetadata({
  settings,
  seo,
  defaultTitle,
  segmentRoot = false,
}: {
  settings: SiteSettings | null | undefined
  seo: PageSeo | null | undefined
  /** Titre quand la page n'a pas de meta title (ex. « Blog »). Absent : titre du site. */
  defaultTitle?: string | null
  segmentRoot?: boolean
}): Metadata {
  const ownTitle = seo?.metaTitle || defaultTitle || null
  const title = ownTitle ? (segmentRoot ? `${ownTitle} — ${siteName}` : ownTitle) : settings?.title || siteName
  const description = seo?.metaDescription || settings?.description || undefined
  const images = ogImages(ogImageUrl(seo?.ogImage) ?? ogImageUrl(settings?.socialImage))
  const robots = robotsFor(settings, seo?.allowIndexing)
  // openGraph d'une page remplace tout celui du layout (fusion superficielle) : repartir des défauts.
  // Rien à préciser (ni description, ni meta title propre, ni image) : on garde celui du layout.
  const needsOpenGraph = Boolean(seo?.metaTitle || description || images)
  return {
    title,
    ...(description ? { description } : {}),
    ...(needsOpenGraph
      ? {
          openGraph: {
            ...openGraphDefaults,
            // og:title explicite seulement à la racine (comme avant l'admin) ; ailleurs Next reprend le
            // titre résolu avec le modèle (« Blog — Conduit »).
            ...(ownTitle && segmentRoot ? { title: ownTitle } : {}),
            ...(description ? { description } : {}),
            ...(images ? { images } : {}),
          },
        }
      : {}),
    ...(robots ? { robots } : {}),
  }
}

export type ArticleTemplate = NonNullable<ARTICLE_SEO_QUERY_RESULT>

/**
 * Modèle par défaut d'une page article, tant que le document articleSeo-post n'existe pas : il reproduit
 * les métadonnées d'avant l'admin (titre, résumé, image de l'article).
 */
export const DEFAULT_ARTICLE_TEMPLATE: ArticleTemplate = {
  metaTitle: '{{title}}',
  metaDescription: '{{excerpt}}',
  ogImageField: 'cover',
  ogImage: null,
  allowIndexing: true,
}

/**
 * Modèles par défaut des pages /testimonials/:slug et /faq/:slug, tant que leur document (articleSeo-testimonial,
 * articleSeo-faq) n'existe pas ; la migration crée les documents avec ces mêmes valeurs. Pas d'image « From
 * field » : ces collections n'ont pas d'image (image fixe du modèle, sinon image de partage du site).
 */
export const DEFAULT_TESTIMONIAL_TEMPLATE: ArticleTemplate = {
  metaTitle: 'Testimonial from {{name}}, {{company}}',
  metaDescription: '{{quote}}',
  ogImageField: null,
  ogImage: null,
  allowIndexing: true,
}

export const DEFAULT_FAQ_TEMPLATE: ArticleTemplate = {
  metaTitle: '{{question}}',
  metaDescription: '{{answer}}',
  ogImageField: null,
  ogImage: null,
  allowIndexing: true,
}

/**
 * Métadonnées d'une page article (C6) : variables {{…}} remplacées par les valeurs de l'article ; une
 * variable vide fait retomber le champ sur la valeur du site (C6, proposé).
 */
export function articleMetadata({
  settings,
  template,
  values,
  cover,
  publishedTime,
}: {
  settings: SiteSettings | null | undefined
  template: ArticleTemplate | null | undefined
  values: TemplateValues
  /** Image de l'article (champ « cover »), pour l'image OG « From field ». */
  cover: { url: string | null; alt?: string | null }
  publishedTime?: string
}): Metadata {
  const model = template ?? DEFAULT_ARTICLE_TEMPLATE
  const field = (text: string | null | undefined) => {
    if (!text) return null
    const resolved = resolveTemplate(text, values, 'text')
    return resolved.empty.length || !resolved.value.trim() ? null : resolved.value
  }
  const title = field(model.metaTitle) ?? settings?.title ?? siteName
  const description = field(model.metaDescription) ?? settings?.description ?? undefined
  const imageUrl = model.ogImageField === 'cover' ? cover.url : ogImageUrl(model.ogImage)
  const images = ogImages(imageUrl ?? ogImageUrl(settings?.socialImage), imageUrl === cover.url ? (cover.alt ?? '') : '')
  const robots = robotsFor(settings, model.allowIndexing)
  return {
    title,
    ...(description ? { description } : {}),
    openGraph: {
      ...openGraphDefaults,
      type: 'article',
      title,
      ...(description ? { description } : {}),
      ...(publishedTime ? { publishedTime } : {}),
      ...(images ? { images } : {}),
    },
    ...(robots ? { robots } : {}),
  }
}
