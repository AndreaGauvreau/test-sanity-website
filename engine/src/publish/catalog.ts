import { existsSync } from 'node:fs'
import path from 'node:path'
import type { AdminConfig, CollectionDef, FieldDef, FieldKind, PageDef } from '../../../src/admin/core/contracts'
import { canonical } from '../content/texts'

/**
 * Catalogue des documents Sanity que l'admin gère (E1 « Content ») : quels types comptent comme « contenu à publier »,
 * et comment dire au client CE QUI a changé dans un brouillon (« Home › Hero · Title », « Blog › Carrier portals: a
 * checklist », résumé « “Dock scheduling, solved.” » ou « Body and excerpt edited »).
 *
 * Source : le manifeste du site (`src/admin.config.ts`, contrat AdminConfig) — pages, collections, réglages, modèles SEO
 * d'article. Sans manifeste : une liste de types configurable (`catalogFromTypes`). Tout autre type (aiUsage, assets…)
 * n'est JAMAIS listé ni publié par E1.
 *
 * PUR (sauf `loadAdminConfig`) : comparaison du brouillon et du publié, sans réseau.
 */

export type ManagedDoc =
  | { kind: 'page'; page: PageDef }
  | { kind: 'collection'; collection: CollectionDef }
  | { kind: 'settings' }
  | { kind: 'template'; label: string }
  | { kind: 'type'; label: string }

export type Catalog = {
  /** Domaine du site (« conduit.com ») pour « Live on conduit.com » ; null sans manifeste. */
  readonly domain: string | null
  /** Types gérés. */
  readonly types: ReadonlySet<string>
  /** Document géré (null = hors de l'admin : jamais listé ni publié). */
  resolve(type: string, id: string): ManagedDoc | null
}

/** Description d'un brouillon pour E1 (null = brouillon identique au publié : rien à publier). */
export type DraftDescription = { path: string; summary: string; viewPath?: string }

type Doc = Record<string, unknown>

/** Champs système jamais comparés (dates comprises : piège 10 du POC, comparer le contenu, pas les dates). */
const SYSTEM = new Set(['_id', '_rev', '_type', '_createdAt', '_updatedAt', '_system', '_originalId'])

const SEO_LABELS: Record<string, string> = {
  metaTitle: 'Meta title',
  metaDescription: 'Meta description',
  ogImage: 'Social image',
  ogImageField: 'Social image source',
  allowIndexing: 'Indexing',
}

/** Réglages du site (B2 General, B3 Code) : libellés de l'interface. */
const SETTINGS_LABELS: Record<string, string> = {
  title: 'Site title',
  description: 'Description',
  faviconLight: 'Favicon (light)',
  faviconDark: 'Favicon (dark)',
  socialImage: 'Social image',
  allowIndexing: 'Indexing',
  scripts: 'Scripts',
}

const COMMON_LABELS: Record<string, string> = { orderRank: 'Order', seo: 'SEO' }

/** Types de Conduit, si le manifeste manque (type → libellé). */
export const FALLBACK_TYPES: Readonly<Record<string, string>> = {
  siteSettings: 'Settings',
  dockSchedulingPage: 'Home',
  blogPage: 'Blog',
  articleSeoTemplate: 'Article SEO',
  post: 'Blog',
  testimonial: 'Testimonials',
  faq: 'FAQ',
}

const SUMMARY_MAX = 80
const TITLE_MAX = 80

/** « orderRank » → « Order rank » (repli quand le manifeste ne nomme pas un champ). */
export function humanize(name: string): string {
  const words = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/** « Body », « Excerpt » → « Body and excerpt » ; au-delà de 3 : « A, b, c and 2 more ». */
export function joinLabels(labels: readonly string[]): string {
  const unique = [...new Set(labels)]
  // Minuscule initiale seulement pour un mot ordinaire (« SEO » reste « SEO »).
  const lower = (label: string) => (/^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label)
  const [first, ...rest] = unique
  if (!first) return ''
  if (unique.length > 4) return `${first}, ${rest.slice(0, 2).map(lower).join(', ')} and ${unique.length - 3} more`
  if (!rest.length) return first
  const tail = rest.map(lower)
  return tail.length === 1 ? `${first} and ${tail[0]}` : `${first}, ${tail.slice(0, -1).join(', ')} and ${tail.at(-1)}`
}

const isRecord = (value: unknown): value is Doc => typeof value === 'object' && value !== null && !Array.isArray(value)

const same = (a: unknown, b: unknown) => canonical(a ?? null) === canonical(b ?? null)

/** Clés de contenu (sans champs système) qui diffèrent entre deux objets. */
function changedKeys(before: Doc, after: Doc): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((key) => !SYSTEM.has(key) && !same(before[key], after[key]))
}

type Leaf = { after: unknown }

/** Feuilles modifiées (objets par clé, tableaux par rang ; longueur différente = le tableau entier). Borné. */
function leaves(before: unknown, after: unknown, out: Leaf[] = [], limit = 3): Leaf[] {
  if (out.length >= limit || same(before, after)) return out
  if (isRecord(before) && isRecord(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (key === '_key' || key === '_type') continue
      leaves(before[key], after[key], out, limit)
    }
    return out
  }
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    for (let i = 0; i < before.length; i++) leaves(before[i], after[i], out, limit)
    return out
  }
  out.push({ after })
  return out
}

type FieldChange = { label: string; kind?: FieldKind; before: unknown; after: unknown }

/** Résumé : nouvelle valeur d'un seul texte modifié, sinon « A and b edited ». */
function summarize(changes: readonly FieldChange[], groupLabels?: readonly string[]): string {
  if (changes.length === 1 && changes[0].kind !== 'portableText') {
    const change = changes[0]
    if (change.after === undefined || change.after === null) return `${change.label} removed`
    const found = leaves(change.before, change.after)
    if (found.length === 1 && typeof found[0].after === 'string') {
      const value = found[0].after
      return value.trim() ? `“${truncate(value, SUMMARY_MAX)}”` : `${change.label} cleared`
    }
  }
  return `${joinLabels(groupLabels ?? changes.map((change) => change.label))} edited`
}

const fieldOf = (fields: readonly FieldDef[] | undefined, name: string) => fields?.find((field) => field.name === name)

function titleOf(doc: Doc, field: string | undefined): string | null {
  const candidates = [field, 'title', 'name', 'question'].filter((name): name is string => !!name)
  for (const name of candidates) {
    const value = doc[name]
    if (typeof value === 'string' && value.trim()) return truncate(value, TITLE_MAX)
  }
  return null
}

function slugOf(doc: Doc, field = 'slug'): string | null {
  const value = doc[field]
  const slug = isRecord(value) ? value.current : value
  return typeof slug === 'string' && /^[\w-]{1,200}$/.test(slug) ? slug : null
}

// ─── Description d'un brouillon ─────────────────────────────────────────────

function describePage(page: PageDef, draft: Doc, published: Doc): DraftDescription | null {
  const keys = changedKeys(published, draft)
  if (!keys.length) return null
  const changes: (FieldChange & { section: string })[] = []
  for (const key of keys) {
    const before = isRecord(published[key]) ? (published[key] as Doc) : {}
    const after = isRecord(draft[key]) ? (draft[key] as Doc) : {}
    const section = key === 'seo' ? { label: 'SEO', fields: undefined } : page.sections.find((entry) => entry.name === key)
    const sectionLabel = section?.label ?? COMMON_LABELS[key] ?? humanize(key)
    // Section = objet : on descend d'un niveau (champs) ; sinon la clé est elle-même le champ.
    if (isRecord(published[key]) || isRecord(draft[key])) {
      for (const name of changedKeys(before, after)) {
        const def = fieldOf(section?.fields, name)
        const label = def?.label ?? (key === 'seo' ? SEO_LABELS[name] : undefined) ?? humanize(name)
        changes.push({ section: sectionLabel, label, kind: def?.kind, before: before[name], after: after[name] })
      }
      if (!changedKeys(before, after).length) changes.push({ section: sectionLabel, label: sectionLabel, before: published[key], after: draft[key] })
    } else {
      changes.push({ section: sectionLabel, label: sectionLabel, before: published[key], after: draft[key] })
    }
  }
  const sections = [...new Set(changes.map((change) => change.section))]
  let where = page.label
  if (sections.length === 1) {
    where += ` › ${sections[0]}`
    const fields = [...new Set(changes.map((change) => change.label))]
    if (fields.length === 1 && fields[0] !== sections[0]) where += ` · ${fields[0]}`
  }
  const summary = sections.length === 1 ? summarize(changes) : summarize(changes, sections)
  return { path: where, summary, viewPath: page.path }
}

function describeCollection(collection: CollectionDef, draft: Doc, published: Doc | null): DraftDescription | null {
  const title = titleOf(draft, collection.titleField) ?? `Untitled ${collection.singular.toLowerCase()}`
  const slug = collection.slugField ? slugOf(draft, collection.slugField) : null
  const viewPath = collection.articlePath && slug ? collection.articlePath.replace(':slug', slug) : undefined
  const where = `${collection.label} › ${title}`
  if (!published) return { path: where, summary: `New ${collection.singular.toLowerCase()}`, ...(viewPath ? { viewPath } : {}) }
  const keys = changedKeys(published, draft)
  if (!keys.length) return null
  const changes = keys.map((name) => {
    const def = fieldOf(collection.fields, name)
    return { label: def?.label ?? COMMON_LABELS[name] ?? humanize(name), kind: def?.kind, before: published[name], after: draft[name] }
  })
  return { path: where, summary: summarize(changes), ...(viewPath ? { viewPath } : {}) }
}

function describeFlat(label: string, labels: Record<string, string>, draft: Doc, published: Doc | null, viewPath?: string): DraftDescription | null {
  if (!published) return { path: label, summary: 'New document', ...(viewPath ? { viewPath } : {}) }
  const keys = changedKeys(published, draft)
  if (!keys.length) return null
  const changes = keys.map((name) => ({ label: labels[name] ?? COMMON_LABELS[name] ?? humanize(name), before: published[name], after: draft[name] }))
  const fields = [...new Set(changes.map((change) => change.label))]
  return { path: fields.length === 1 ? `${label} · ${fields[0]}` : label, summary: summarize(changes), ...(viewPath ? { viewPath } : {}) }
}

/**
 * Chemin lisible, résumé et page publique d'un brouillon, d'après le publié (null = aucun). Renvoie null si le
 * brouillon ne diffère du publié que par ses champs système (rien à publier).
 */
export function describeDraft(entry: ManagedDoc, draft: Doc, published: Doc | null): DraftDescription | null {
  switch (entry.kind) {
    case 'page':
      return published ? describePage(entry.page, draft, published) : { path: entry.page.label, summary: 'New page content', viewPath: entry.page.path }
    case 'collection':
      return describeCollection(entry.collection, draft, published)
    case 'settings': {
      const keys = published ? changedKeys(published, draft) : ['title']
      const code = keys.length > 0 && keys.every((key) => key === 'scripts')
      return describeFlat(code ? 'Settings › Code' : 'Settings › General', SETTINGS_LABELS, draft, published, '/')
    }
    case 'template':
      return describeFlat(entry.label, SEO_LABELS, draft, published)
    case 'type': {
      const title = titleOf(draft, undefined)
      return describeFlat(title ? `${entry.label} › ${title}` : entry.label, {}, draft, published)
    }
  }
}

/** Résumé d'une action programmée (E1). */
export const REMOVAL_SUMMARY: Readonly<Record<'unpublish' | 'delete', string>> = {
  unpublish: 'Will be unpublished',
  delete: 'Will be deleted',
}

/**
 * Élément de collection à dépublier / supprimer au prochain Publish (POST /publish/stage) : chemin lisible d'après le
 * document vu (publié de préférence), résumé fixe, page publique encore en ligne.
 */
export function describeRemoval(entry: ManagedDoc, doc: Doc, action: 'unpublish' | 'delete'): DraftDescription {
  const summary = REMOVAL_SUMMARY[action]
  switch (entry.kind) {
    case 'collection': {
      const { collection } = entry
      const title = titleOf(doc, collection.titleField) ?? `Untitled ${collection.singular.toLowerCase()}`
      const slug = collection.slugField ? slugOf(doc, collection.slugField) : null
      const viewPath = collection.articlePath && slug ? collection.articlePath.replace(':slug', slug) : undefined
      return { path: `${collection.label} › ${title}`, summary, ...(viewPath ? { viewPath } : {}) }
    }
    case 'page':
      return { path: entry.page.label, summary, viewPath: entry.page.path }
    case 'settings':
      return { path: 'Settings', summary }
    case 'template':
      return { path: entry.label, summary }
    case 'type': {
      const title = titleOf(doc, undefined)
      return { path: title ? `${entry.label} › ${title}` : entry.label, summary }
    }
  }
}

// ─── Construction du catalogue ──────────────────────────────────────────────

export function catalogFromConfig(config: AdminConfig): Catalog {
  const types = new Set<string>([config.settings.type])
  for (const page of config.pages) if (page.document) types.add(page.document.type)
  for (const collection of config.collections) types.add(collection.type)
  for (const template of config.articleSeoTemplates) types.add(template.document.type)
  return {
    domain: config.site.domain || null,
    types,
    resolve(type, id) {
      if (type === config.settings.type) return { kind: 'settings' }
      const page =
        config.pages.find((entry) => entry.document?.type === type && entry.document.id === id) ??
        config.pages.find((entry) => entry.document?.type === type)
      if (page) return { kind: 'page', page }
      const collection = config.collections.find((entry) => entry.type === type)
      if (collection) return { kind: 'collection', collection }
      const template = config.articleSeoTemplates.find((entry) => entry.document.type === type)
      if (template) {
        const owner = config.pages.find((entry) => entry.article?.collection === template.collection)
        const listing = config.collections.find((entry) => entry.type === template.collection)
        return { kind: 'template', label: `${owner?.label ?? listing?.label ?? humanize(template.collection)} › Article SEO` }
      }
      return null
    },
  }
}

/** Sans manifeste : types gérés et leurs libellés (type → libellé). */
export function catalogFromTypes(labels: Readonly<Record<string, string>>, domain: string | null = null): Catalog {
  const types = new Set(Object.keys(labels))
  return {
    domain,
    types,
    resolve: (type) => (Object.hasOwn(labels, type) ? { kind: 'type', label: labels[type] } : null),
  }
}

const looksLikeConfig = (value: unknown): value is AdminConfig =>
  isRecord(value) && Array.isArray(value.pages) && Array.isArray(value.collections) && isRecord(value.settings) && isRecord(value.site)

/**
 * Charge le manifeste du site (`<dépôt source>/src/admin.config.ts`, par tsx à l'exécution, par Vite dans les tests).
 * null s'il n'existe pas ou ne se charge pas : le module retombe alors sur `FALLBACK_TYPES`.
 */
export async function loadAdminConfig(file: string): Promise<AdminConfig | null> {
  if (!path.isAbsolute(file) || !existsSync(file)) return null
  try {
    const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>
    const found = [mod.default, mod.adminConfig, ...Object.values(mod)].find(looksLikeConfig)
    return found ?? null
  } catch {
    return null
  }
}
