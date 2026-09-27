import { adminConfig } from '@/admin.config'
import type { AdminConfig, CollectionDef, FieldDef, PageDef, SectionDef, SeoTemplateVariable } from '@/admin/core/contracts'
import { isFieldPath, parseFieldPath } from '@/admin/core/sanity/paths'

/**
 * Lecture du manifeste (src/admin.config.ts) pour les écrans C1, C2, C6. PUR (aucun accès réseau, aucun Next) :
 * importable côté serveur comme côté client et testé sans mock.
 *
 * Point sensible : `resolveFieldAtPath` est la liste blanche des écritures de C1. Une server action n'écrit QUE
 * les chemins qu'elle retrouve ici, avec le FieldDef du manifeste (jamais un chemin libre venu du navigateur).
 */

export type Config = Pick<AdminConfig, 'site' | 'pages' | 'collections' | 'articleSeoTemplates'>

const DEFAULT_CONFIG: Config = adminConfig

/** Identifiant de page accepté dans les routes et les actions (même grammaire que les ids du manifeste). */
export const PAGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

export function findPage(pageId: string, config: Config = DEFAULT_CONFIG): PageDef | undefined {
  if (!PAGE_ID_PATTERN.test(pageId)) return undefined
  return config.pages.find((p) => p.id === pageId)
}

export function collectionByType(type: string, config: Config = DEFAULT_CONFIG): CollectionDef | undefined {
  return config.collections.find((c) => c.type === type)
}

// ─── Liens des onglets ───────────────────────────────────────────────────────

export const pageHref = (pageId: string) => `/admin/pages/${pageId}`
export const pageSeoHref = (pageId: string) => `/admin/pages/${pageId}/seo`
export const articleSeoHref = (pageId: string) => `/admin/pages/${pageId}/slug/seo`
/**
 * « Open in AI editor » (G1). `back` = chemin de l'écran courant (`/admin/pages/home/seo`) : le « ‹ Admin » de
 * l'éditeur y revient (même onglet). L'éditeur le renettoie (`sanitizeNextPath`, chemins `/admin…` seulement).
 */
export function editorHref(pageId: string, back?: string): string {
  const href = `/admin/editor?page=${encodeURIComponent(pageId)}`
  return back ? `${href}&back=${encodeURIComponent(back)}` : href
}

/** Collection de la page article d'une page listing (C6) et ses variables {{…}}. */
export function articleOf(
  page: PageDef,
  config: Config = DEFAULT_CONFIG,
): {
  collection: CollectionDef | undefined
  variables: readonly SeoTemplateVariable[]
  /** Champs image de l'article utilisables comme image OG (« From field ») ; vide : image fixe seulement. */
  imageFields: readonly ArticleImageField[]
  path: string
  documentId: string
} | null {
  if (!page.article) return null
  const template = config.articleSeoTemplates.find((t) => t.collection === page.article!.collection)
  return {
    collection: collectionByType(page.article.collection, config),
    variables: template?.variables ?? [],
    imageFields: ARTICLE_IMAGE_FIELDS[page.article.collection] ?? [],
    path: page.article.path,
    documentId: page.article.seoTemplate.id,
  }
}

// ─── Chemins des champs de C1 ────────────────────────────────────────────────

/**
 * FieldDef du manifeste pour un chemin Sanity du document de la page (`hero.title`,
 * `features.items[_key=="a"].title`, `hero.primaryCta.href`, `hero.ratings`), ou null si le chemin n'est pas
 * déclaré. Règles : premier segment = une section ; sélecteur `_key` seulement sur un champ `array` (un niveau) et
 * jamais en dernier (on n'écrit pas un élément entier par ce chemin) ; on descend dans `cta` / `object` / éléments
 * d'`array` par leurs `fields`.
 */
export function resolveFieldAtPath(page: PageDef, path: string): FieldDef | null {
  if (!isFieldPath(path)) return null
  const [head, ...rest] = parseFieldPath(path)
  if (!head || head.keys.length > 0 || rest.length === 0) return null
  const section = page.sections.find((s) => s.name === head.name)
  if (!section) return null
  let fields: readonly FieldDef[] = section.fields
  for (let i = 0; i < rest.length; i++) {
    const segment = rest[i]
    const last = i === rest.length - 1
    const field = fields.find((f) => f.name === segment.name)
    if (!field) return null
    if (segment.keys.length > 0) {
      if (field.kind !== 'array' || segment.keys.length !== 1 || last || !field.fields) return null
      fields = field.fields
      continue
    }
    if (last) return field
    if ((field.kind !== 'cta' && field.kind !== 'object') || !field.fields) return null
    fields = field.fields
  }
  return null
}

// ─── Sections (C1) ───────────────────────────────────────────────────────────

export type SectionSource = {
  /** Section fermée : « From CMS › Testimonials » ou le libellé du manifeste (« 4 latest Blog posts »). */
  label: string
  /** Liste de la collection (C3). */
  href: string
  /** Lien de la section ouverte : « Open Testimonials ». */
  linkLabel: string
}

function sourceOf(collection: CollectionDef, label?: string): SectionSource {
  return {
    label: label?.trim() || `From CMS › ${collection.label}`,
    href: `/admin/cms/${collection.id}`,
    linkLabel: `Open ${collection.label}`,
  }
}

/**
 * Section alimentée par une collection (C1 « ⛁ From CMS › Testimonials », « 4 latest Blog posts »).
 * `SectionDef.source` déclaré par le manifeste gagne : collection retrouvée par id de route (« blog ») puis par type
 * Sanity (« post ») ; inconnue → null (rien de deviné, pas de lien cassé). Sans `source` (manifeste plus ancien),
 * repli sur l'heuristique : un champ `reference` vers un type de collection, ou une section qui porte l'id d'une
 * collection (FAQ).
 */
export function sectionSource(section: SectionDef, config: Config = DEFAULT_CONFIG): SectionSource | null {
  if (section.source) {
    const declared =
      config.collections.find((c) => c.id === section.source!.collection) ?? collectionByType(section.source.collection, config)
    return declared ? sourceOf(declared, section.source.label) : null
  }
  const reference = section.fields.find((f) => f.kind === 'reference' && f.to?.length)
  const collection =
    (reference?.to ? collectionByType(reference.to[0], config) : undefined) ?? config.collections.find((c) => c.id === section.name)
  return collection ? sourceOf(collection) : null
}

function plural(word: string, count: number): string {
  const lower = word.toLowerCase()
  if (count === 1) return lower
  return /(s|x|ch|sh)$/.test(lower) ? `${lower}es` : /[^aeiou]y$/.test(lower) ? `${lower.slice(0, -1)}ies` : `${lower}s`
}

/**
 * Résumé d'une section fermée (C1 : « 3 cards », « Eyebrow · 3 modules », « Title · 2 buttons »), au plus trois
 * parties : le premier texte visible, les tableaux avec leur nombre d'éléments, puis le nombre de boutons.
 */
export function sectionSummary(section: SectionDef, value: Record<string, unknown> | null | undefined): string {
  const parts: string[] = []
  const firstText = section.fields.find((f) => (f.kind === 'string' || f.kind === 'text') && !f.visuallyHidden)
  if (firstText) parts.push(firstText.label.replace(/ \(.*\)$/, ''))
  for (const field of section.fields) {
    if (field.kind !== 'array') continue
    const items = Array.isArray(value?.[field.name]) ? (value?.[field.name] as unknown[]).length : 0
    parts.push(`${items} ${plural(field.itemLabel ?? field.label, items)}`)
  }
  const ctas = section.fields.filter((f) => f.kind === 'cta').length
  if (ctas > 0) parts.push(`${ctas} ${ctas === 1 ? 'button' : 'buttons'}`)
  const [first, ...others] = parts.slice(0, 3)
  if (!first) return `${section.fields.length} ${section.fields.length === 1 ? 'field' : 'fields'}`
  return [first, ...others.map((p) => p.charAt(0).toLowerCase() + p.slice(1))].join(' · ')
}

/** Champs masqués à l'écran sur le site (titres pour lecteurs d'écran) : signalés dans le formulaire. */
export function isHiddenField(field: FieldDef): boolean {
  return field.visuallyHidden === true
}

// ─── SEO (C2) et modèle SEO d'article (C6) ──────────────────────────────────

/** Longueurs conseillées (compteurs indicatifs : au-delà, chiffre en orange, pas de blocage — C2 « proposé »). */
export const SEO_LIMITS = { metaTitle: 60, metaDescription: 160 } as const

/**
 * FieldDef des champs SEO. Les longueurs ci-dessous sont des PLAFONDS de sécurité côté serveur (texte anormal),
 * pas les limites conseillées : C2 veut des compteurs indicatifs sans blocage.
 */
export const SEO_FIELDS = {
  metaTitle: { name: 'metaTitle', label: 'Meta title', kind: 'string', maxLength: 200 },
  metaDescription: { name: 'metaDescription', label: 'Meta description', kind: 'text', maxLength: 500, maxLines: 1 },
  ogImage: { name: 'ogImage', label: 'OG image', kind: 'image' },
  allowIndexing: { name: 'allowIndexing', label: 'Search engines', kind: 'boolean' },
} as const satisfies Record<string, FieldDef>

export type SeoKey = keyof typeof SEO_FIELDS

export type ArticleImageField = { value: string; label: string }

/**
 * Champs image par collection (type Sanity) pour « From field » (C6) : même liste que IMAGE_FIELDS du schéma
 * (src/sanity/schemaTypes/articleSeoTemplate.ts), où `ogImageField` n'est visible que pour post. Témoignages et
 * questions n'ont pas d'image : image fixe du modèle, sinon image de partage du site.
 */
export const ARTICLE_IMAGE_FIELDS: Readonly<Record<string, readonly ArticleImageField[]>> = {
  post: [{ value: 'cover', label: 'Cover' }],
}

/** Champs du modèle SEO d'article (document articleSeoTemplate, C6). */
export const ARTICLE_SEO_FIELDS = {
  metaTitle: SEO_FIELDS.metaTitle,
  metaDescription: SEO_FIELDS.metaDescription,
  ogImageField: { name: 'ogImageField', label: 'OG image field', kind: 'select', options: [{ value: 'cover', label: 'Cover' }] },
  ogImage: SEO_FIELDS.ogImage,
  allowIndexing: SEO_FIELDS.allowIndexing,
} as const satisfies Record<string, FieldDef>

export type ArticleSeoKey = keyof typeof ARTICLE_SEO_FIELDS

/** Chemin Sanity d'un champ SEO dans le document de la page (PageDef.seo), ou null si la page ne le déclare pas. */
export function seoPathOf(page: PageDef, key: SeoKey): string | null {
  return page.seo?.[key] ?? null
}

/** Variables {{…}} citées qui n'existent pas dans la collection (C6 : refusées, puce rouge). */
export function unknownVariables(text: string, variables: readonly SeoTemplateVariable[]): string[] {
  const known = new Set(variables.map((v) => v.token))
  const found = [...text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(found.filter((name) => !known.has(name)))]
}
