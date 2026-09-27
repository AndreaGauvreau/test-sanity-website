import 'server-only'

import { cache } from 'react'

import { adminConfig } from '@/admin.config'
import type { PageDef } from '@/admin/core/contracts'
import { getReadClient } from '@/admin/core/sanity/clients'
import { getDocumentState } from '@/admin/core/sanity/drafts'
import { faqTemplateValues, testimonialTemplateValues } from '@/lib/article-values'
import type { ArticleTemplate, SiteSettings } from '@/lib/seo'
import type { TemplateValues } from '@/lib/template-variables'
import { urlFor } from '@/sanity/lib/image'

import { extractHeadings, extractJsonLd, MAX_HTML_LENGTH, type Heading } from '../lib/html'
import { collectionByType } from '../lib/manifest'
import { defaultArticleTemplate } from '../lib/seo-preview'

/**
 * Lectures serveur des écrans C1, C2, C6 (jeton Viewer, sans CDN ni stega). Valeur affichée = brouillon s'il existe,
 * sinon le publié (getDocumentState). Rien de sensible ne sort d'ici : pas de jeton, pas de code de script.
 */

type Doc = Record<string, unknown>
type ImageValue = { asset?: { _ref: string } | null; crop?: unknown; hotspot?: unknown } | null

// ─── Document de la page (C1, C2) ──────────────────────────────────────────

export type PageDocument = { value: Doc | null; hasDraft: boolean; hasPublished: boolean }

export const loadPageDocument = cache(async (id: string): Promise<PageDocument> => {
  const state = await getDocumentState<Doc>(id)
  return { value: state.value ? stripSystem(state.value) : null, hasDraft: Boolean(state.draft), hasPublished: Boolean(state.published) }
})

function stripSystem(doc: Doc): Doc {
  const { _rev: _r, _createdAt: _c, _updatedAt: _u, ...rest } = doc
  return rest
}

// ─── Réglages du site (valeurs par défaut des aperçus, B2) ─────────────────

function imageUrl(image: ImageValue | undefined): string | null {
  if (!image?.asset?._ref) return null
  try {
    return urlFor(image as Parameters<typeof urlFor>[0]).url()
  } catch {
    return null
  }
}

/**
 * Réglages utiles aux aperçus, au format `SiteSettings` de src/lib/seo.ts (brouillon B2 s'il existe). Les scripts du
 * site ne sont JAMAIS transmis (code exécuté sur le site, réservé à Kuartz) : `scripts: null`.
 */
export const loadSiteSettings = cache(async (): Promise<SiteSettings> => {
  const state = await getDocumentState<Doc>(adminConfig.settings.id)
  const doc: Doc = state.value ?? {}
  return {
    title: typeof doc.title === 'string' ? doc.title : null,
    description: typeof doc.description === 'string' ? doc.description : null,
    allowIndexing: typeof doc.allowIndexing === 'boolean' ? doc.allowIndexing : null,
    faviconLight: imageUrl(doc.faviconLight as ImageValue),
    faviconDark: imageUrl(doc.faviconDark as ImageValue),
    socialImage: (doc.socialImage as SiteSettings['socialImage']) ?? null,
    scripts: null,
  } as SiteSettings
})

// ─── Options des champs référence (C1) ─────────────────────────────────────

export type ReferenceOption = { value: string; label: string }

function referenceTypes(page: PageDef): string[] {
  const types = new Set<string>()
  const walk = (fields: PageDef['sections'][number]['fields']) => {
    for (const field of fields) {
      if (field.kind === 'reference') field.to?.forEach((t) => types.add(t))
      if (field.fields) walk(field.fields)
    }
  }
  page.sections.forEach((s) => walk(s.fields))
  return [...types]
}

/** Éléments PUBLIÉS des collections ciblées (une référence pointe toujours vers un id publié). */
export async function loadReferenceOptions(page: PageDef): Promise<Record<string, ReferenceOption[]>> {
  const types = referenceTypes(page)
  if (types.length === 0) return {}
  const client = getReadClient({ perspective: 'published' })
  const entries = await Promise.all(
    types.map(async (type) => {
      const titleField = collectionByType(type)?.titleField ?? 'title'
      const rows = await client.fetch<{ _id: string; label: string | null }[]>(
        `*[_type == $type] | order(coalesce(orderRank, "~") asc, _createdAt desc)[0...200]{ _id, "label": coalesce(@[$field], _id) }`,
        { type, field: titleField },
      )
      return [type, rows.map((r) => ({ value: r._id, label: r.label ?? r._id }))] as const
    }),
  )
  return Object.fromEntries(entries)
}

// ─── HTML public de la page (C2 : JSON-LD et titres) ───────────────────────

export type PageHtml = { ok: true; html: string; url: string } | { ok: false; url: string; error: string }

/** URL publique d'un chemin du site (adminConfig.site.url : NEXT_PUBLIC_SITE_URL, sinon le serveur local). */
export function publicUrl(path: string): string {
  return new URL(path, adminConfig.site.url).toString()
}

/**
 * HTML rendu d'une page du site, lu comme du texte (jamais exécuté). Origine = celle du manifeste (pas d'URL venue
 * du navigateur : aucun SSRF possible). Délai 12 s, 3 Mo au plus. Mis en cache le temps d'un rendu (JSON-LD et
 * titres lisent la même réponse).
 */
export const loadPageHtml = cache(async (path: string): Promise<PageHtml> => {
  const url = publicUrl(path)
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      headers: { accept: 'text/html' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) return { ok: false, url, error: `The page answered ${response.status}.` }
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) return { ok: false, url, error: 'The page is not HTML.' }
    const html = (await response.text()).slice(0, MAX_HTML_LENGTH)
    return { ok: true, html, url }
  } catch {
    return { ok: false, url, error: "The page couldn't be reached." }
  }
})

export async function loadJsonLd(path: string): Promise<{ ok: true; blocks: string[] } | { ok: false; error: string }> {
  const page = await loadPageHtml(path)
  return page.ok ? { ok: true, blocks: extractJsonLd(page.html) } : { ok: false, error: page.error }
}

export async function loadHeadings(path: string): Promise<{ ok: true; headings: Heading[] } | { ok: false; error: string }> {
  const page = await loadPageHtml(path)
  return page.ok ? { ok: true, headings: extractHeadings(page.html) } : { ok: false, error: page.error }
}

// ─── Page article (C6) ─────────────────────────────────────────────────────

export type ArticleOption = {
  id: string
  /** Libellé de « Preview with » et de « ≈ 43 / 60 with “…” » : titre (post), nom (testimonial), question (faq). */
  title: string
  slug: string
  /** Valeurs des {{variables}}, comme la page article du site les calcule. */
  values: TemplateValues
  /** Image « From field » (cover d'un post) ; null pour les collections sans image. */
  coverUrl: string | null
  coverAlt: string | null
}

type Block = { _type?: string; children?: { text?: string | null }[] | null }

type PostRow = {
  _id: string
  title: string | null
  slug: string | null
  publishedAt: string | null
  excerpt: string | null
  author: string | null
  category: string | null
  image: (ImageValue & { alt?: string | null }) | null
}

type TestimonialRow = { _id: string; name: string | null; slug: string | null; company: string | null; role: string | null; quote: string | null }

type FaqRow = { _id: string; question: string | null; slug: string | null; answer: Block[] | null }

/**
 * Lecture « Preview with » d'une collection : requête GROQ (100 éléments au plus, ordre de la liste du site),
 * filtre du compte (mêmes éléments que ceux qui ont une page article) et conversion en ArticleOption.
 */
type ArticleSource = { filter: string; query: string; toOption: (row: unknown) => ArticleOption }

/** Typage d'une source : chaque `toOption` reçoit les lignes de SA requête (seul point de conversion). */
function articleSource<Row>(source: { filter: string; query: string; toOption: (row: Row) => ArticleOption }): ArticleSource {
  return source as ArticleSource
}

/** {{date}} = AAAA-MM-JJ, {{cover}} = URL 1200 × 630 (src/app/(site)/blog/[slug]/page.tsx). */
function postOption(row: PostRow): ArticleOption {
  const cover = row.image?.asset?._ref
    ? urlFor(row.image as Parameters<typeof urlFor>[0])
        .width(1200)
        .height(630)
        .url()
    : null
  return {
    id: row._id,
    title: row.title ?? row.slug ?? row._id,
    slug: row.slug ?? '',
    values: {
      title: row.title,
      slug: row.slug,
      date: row.publishedAt ? row.publishedAt.slice(0, 10) : null,
      excerpt: row.excerpt,
      cover,
      author: row.author,
      category: row.category,
    },
    coverUrl: cover,
    coverAlt: row.image?.alt ?? null,
  }
}

const ARTICLE_SOURCES: Record<string, ArticleSource> = {
  post: articleSource<PostRow>({
    filter: 'defined(slug.current)',
    query: `| order(publishedAt desc)[0...100]{
      _id, title, "slug": slug.current, publishedAt, excerpt, author, category,
      image{ asset, crop, hotspot, "alt": coalesce(alt, asset->altText) }
    }`,
    toOption: postOption,
  }),
  // Même ordre que /testimonials (TESTIMONIALS_QUERY) ; seuls les témoignages avec slug ont une page.
  testimonial: articleSource<TestimonialRow>({
    filter: 'defined(slug.current)',
    query: `| order(coalesce(orderRank, "~") asc, _createdAt desc)[0...100]{ _id, name, "slug": slug.current, company, role, quote }`,
    toOption: (row) => ({
      id: row._id,
      title: row.name ?? row.slug ?? row._id,
      slug: row.slug ?? '',
      values: testimonialTemplateValues(row),
      coverUrl: null,
      coverAlt: null,
    }),
  }),
  // Même ordre que /faq (FAQ_LIST_QUERY) ; une question sans réponse n'a pas de page.
  faq: articleSource<FaqRow>({
    filter: 'defined(slug.current) && defined(answer)',
    query: `| order(coalesce(orderRank, "~") asc, order asc)[0...100]{ _id, question, "slug": slug.current, answer }`,
    toOption: (row) => ({
      id: row._id,
      title: row.question ?? row.slug ?? row._id,
      slug: row.slug ?? '',
      values: faqTemplateValues(row),
      coverUrl: null,
      coverAlt: null,
    }),
  }),
}

/**
 * Éléments publiés de la collection qui ont une page article, pour « Preview with ». Les valeurs suivent la page
 * article du site : `templateValues` du blog, `testimonialTemplateValues` / `faqTemplateValues`
 * (src/lib/article-values.ts). Collection sans lecture connue : aucun élément.
 */
export async function loadArticleOptions(type: string): Promise<{ options: ArticleOption[]; total: number }> {
  const source = ARTICLE_SOURCES[type]
  if (!source) return { options: [], total: 0 }
  const client = getReadClient({ perspective: 'published' })
  const [rows, total] = await Promise.all([
    client.fetch<unknown[]>(`*[_type == $type && ${source.filter}] ${source.query}`, { type }),
    client.fetch<number>(`count(*[_type == $type && ${source.filter}])`, { type }),
  ])
  return { options: rows.map((row) => source.toOption(row)), total }
}

export type ArticleTemplateState = { template: ArticleTemplate; exists: boolean }

/** Modèle SEO d'article (brouillon s'il existe) ; sans document : le modèle par défaut du site pour la collection. */
export async function loadArticleTemplate(id: string, collection: string): Promise<ArticleTemplateState> {
  const state = await getDocumentState<Doc>(id)
  const doc = state.value
  if (!doc) return { template: defaultArticleTemplate(collection), exists: false }
  return {
    exists: true,
    template: {
      metaTitle: typeof doc.metaTitle === 'string' ? doc.metaTitle : null,
      metaDescription: typeof doc.metaDescription === 'string' ? doc.metaDescription : null,
      ogImageField: typeof doc.ogImageField === 'string' ? doc.ogImageField : null,
      ogImage: (doc.ogImage as ArticleTemplate['ogImage']) ?? null,
      allowIndexing: typeof doc.allowIndexing === 'boolean' ? doc.allowIndexing : null,
    } as ArticleTemplate,
  }
}

/**
 * JSON-LD du modèle d'article (C6), écrit par Kuartz avec les mêmes {{…}} : les blocs `application/ld+json` des
 * scripts du site qui s'appliquent aux pages article (`blog/slug` ou `all`). Seul le JSON-LD est extrait : le reste
 * du code des scripts (JavaScript) ne quitte jamais le serveur.
 */
export async function loadArticleJsonLd(scriptPage: string): Promise<string[]> {
  const state = await getDocumentState<Doc>(adminConfig.settings.id)
  const scripts = Array.isArray(state.value?.scripts) ? (state.value!.scripts as Doc[]) : []
  return scripts
    .filter((s) => s.enabled !== false && (s.page === scriptPage || s.page === 'all') && typeof s.code === 'string')
    .flatMap((s) => extractJsonLd(s.code as string))
}
