import type { AdminConfig, AdminRole, CollectionDef, PageDef } from '../../../src/admin/core/contracts'
import { can } from '../../../src/admin/core/contracts'
import { askRoutes, screenOf, type AskRoute } from '../../../src/admin/features/ask-ai/links'
import { quoteData } from '../claude'

/**
 * Contexte d'Ask AI (G4), en LECTURE SEULE : structure du site (manifeste `src/admin.config.ts`), nombres d'éléments des
 * collections, réglages, statut SEO des pages, médias et leurs utilisations, écrans de l'admin permis au rôle.
 *
 * Lu avec le jeton de LECTURE Sanity (perspective `raw` : brouillon s'il existe, sinon publié, comme l'admin l'affiche).
 * Rendu en texte par `renderSiteData` : chaque valeur venant de Sanity passe par `quoteData` (données, jamais des
 * consignes). Aucun jeton ni secret n'entre dans le contexte.
 */

/** Lecture GROQ minimale (client Sanity réel ou faux en test). */
export type AskReader = { fetch<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T> }

export const MAX_MEDIA_LISTED = 40
const MAX_USED_BY = 6
const MAX_SCRIPTS = 20

export type PageSeoStatus = {
  metaTitle: string | null
  metaDescription: string | null
  ogImage: boolean
  allowIndexing: boolean | null
}

export type AskSiteData = {
  site: AdminConfig['site']
  role: AdminRole
  routes: AskRoute[]
  /** Écran ouvert par l'utilisateur (reconnu dans le catalogue), sinon null. */
  screen: AskRoute | null
  /** false : Sanity illisible, seul le manifeste est connu. */
  live: boolean
  settings: {
    title: string | null
    description: string | null
    faviconLight: boolean
    faviconDark: boolean
    socialImage: boolean
    allowIndexing: boolean | null
    scripts: { name: string; enabled: boolean; page: string; placement: string }[]
  } | null
  pages: {
    id: string
    label: string
    path: string
    editable: boolean
    aiEditor: boolean
    sections: { label: string; fields: string[] }[]
    seo: PageSeoStatus | null
    unpublishedChanges: boolean
    articlePath: string | null
  }[]
  articleSeo: { path: string; collection: string; metaTitle: string | null; metaDescription: string | null; allowIndexing: boolean | null }[]
  collections: { id: string; label: string; singular: string; published: number | null; drafts: number | null; articlePath: string | null }[]
  media: { total: number | null; listed: { name: string; alt: string | null; kb: number | null; usedIn: string[] }[] }
  /** Brouillons non publiés, tous documents confondus (« Unpublished changes »). */
  unpublishedDrafts: number | null
}

type RawDoc = { _id: string; _type: string; [field: string]: unknown }
type RawAsset = { _id: string; originalFilename?: string; altText?: string; size?: number; usedBy?: RawDoc[] }
type RawResult = {
  docs?: RawDoc[]
  counts?: { type: string; published: number; drafts: number }[]
  assets?: RawAsset[]
  assetTotal?: number
  drafts?: number
}

const publishedId = (id: string) => id.replace(/^drafts\./, '')
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null)
const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)
const hasAsset = (value: unknown): boolean =>
  !!value && typeof value === 'object' && typeof (value as { asset?: { _ref?: unknown } }).asset?._ref === 'string'

/** Valeur au chemin pointé (« seo.metaTitle »). */
function at(doc: RawDoc | undefined, path: string): unknown {
  let value: unknown = doc
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

/** Assets référencés par un document → champs de premier niveau qui les portent (« hero », « socialImage »). */
export function assetFields(doc: RawDoc): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>()
  const walk = (value: unknown, top: string, depth: number) => {
    if (depth > 12 || !value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) walk(item, top, depth + 1)
      return
    }
    const record = value as Record<string, unknown>
    const ref = (record.asset as { _ref?: unknown } | undefined)?._ref
    if (typeof ref === 'string') {
      if (!found.has(ref)) found.set(ref, new Set())
      found.get(ref)!.add(top)
    }
    for (const [key, child] of Object.entries(record)) if (key !== 'asset') walk(child, top, depth + 1)
  }
  for (const [key, value] of Object.entries(doc)) if (!key.startsWith('_')) walk(value, key, 0)
  return found
}

/** Requête unique (types et ids en PARAMÈTRES, jamais interpolés). */
export function buildSiteQuery(config: AdminConfig): { query: string; params: Record<string, unknown> } {
  const ids = [config.settings.id, ...config.pages.flatMap((p) => (p.document ? [p.document.id] : [])), ...config.articleSeoTemplates.map((t) => t.document.id)]
  const params: Record<string, unknown> = { ids: [...ids, ...ids.map((id) => `drafts.${id}`)], maxAssets: MAX_MEDIA_LISTED }
  const counts = config.collections.map((collection, i) => {
    params[`t${i}`] = collection.type
    return `{"type": $t${i}, "published": count(*[_type == $t${i} && !(_id in path("drafts.**"))]), "drafts": count(*[_type == $t${i} && _id in path("drafts.**")])}`
  })
  // Titre d'un élément de collection : champs du manifeste (identifiants vérifiés, jamais une valeur reçue).
  const titleFields = [...new Set(config.collections.map((c) => c.titleField).filter((f) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(f)))]
  const label = titleFields.length ? `, "label": coalesce(${titleFields.join(', ')})` : ''
  const query = `{
  "docs": *[_id in $ids],
  "counts": [${counts.join(', ')}],
  "assets": *[_type == "sanity.imageAsset"] | order(_createdAt desc) [0...$maxAssets] {
    _id, originalFilename, altText, size,
    "usedBy": *[references(^._id) && !(_id in path("aiUsage.**"))][0...${MAX_USED_BY * 2}]{_id, _type${label}}
  },
  "assetTotal": count(*[_type in ["sanity.imageAsset", "sanity.fileAsset"]]),
  "drafts": count(*[_id in path("drafts.**")])
}`
  return { query, params }
}

function sectionLabel(page: PageDef, field: string): string {
  return page.sections.find((s) => s.name === field)?.label ?? (field === 'seo' ? 'SEO' : field)
}

const SETTINGS_LABELS: Record<string, string> = {
  faviconLight: 'Favicon (light)',
  faviconDark: 'Favicon (dark)',
  socialImage: 'Social image',
}

/** « Home › Hero », « Blog › ‹How to cut dock wait times› », « Site settings › Social image ». */
function usedIn(config: AdminConfig, asset: RawAsset, docs: readonly RawDoc[]): string[] {
  const places: string[] = []
  const seen = new Set<string>()
  for (const doc of asset.usedBy ?? []) {
    const id = publishedId(doc._id)
    const page = config.pages.find((p) => p.document?.id === id)
    // Pages et réglages : documents complets déjà lus (docs) → section qui porte l'image.
    const full = docs.find((d) => d._id === doc._id)
    const fields = full ? assetFields(full).get(asset._id) : undefined
    let labels: string[]
    if (page) labels = [...(fields ?? ['page'])].map((f) => `${page.label} › ${sectionLabel(page, f)}`)
    else if (id === config.settings.id) labels = [...(fields ?? ['settings'])].map((f) => `Site settings › ${SETTINGS_LABELS[f] ?? f}`)
    else {
      const collection = config.collections.find((c) => c.type === doc._type)
      const template = config.articleSeoTemplates.find((t) => t.document.id === id)
      if (collection) {
        const title = str(doc.label)
        labels = [`${collection.label} › ${title ? `“${quoteData(title, 80)}”` : 'untitled item'}`]
      } else if (template) labels = ['Article SEO template']
      else labels = [quoteData(doc._type, 40)]
    }
    for (const label of labels) {
      if (seen.has(label)) continue
      seen.add(label)
      places.push(label)
    }
    if (places.length >= MAX_USED_BY) break
  }
  return places.slice(0, MAX_USED_BY)
}

function fieldLabels(section: PageDef['sections'][number]): string[] {
  return section.fields.filter((f) => !f.visuallyHidden).map((f) => f.label)
}

function pagesOf(config: AdminConfig, role: AdminRole, pick: (id: string) => { doc?: RawDoc; draft: boolean }, live: boolean): AskSiteData['pages'] {
  return config.pages.map((page) => {
    const { doc, draft } = page.document ? pick(page.document.id) : { doc: undefined, draft: false }
    const seo: PageSeoStatus | null =
      page.seo && live && doc
        ? {
            metaTitle: str(at(doc, page.seo.metaTitle)),
            metaDescription: str(at(doc, page.seo.metaDescription)),
            ogImage: page.seo.ogImage ? hasAsset(at(doc, page.seo.ogImage)) : false,
            allowIndexing: page.seo.allowIndexing ? bool(at(doc, page.seo.allowIndexing)) : null,
          }
        : null
    return {
      id: page.id,
      label: page.label,
      path: page.path,
      editable: !!page.document,
      aiEditor: page.aiEditor && can(role, 'ai.editor'),
      sections: page.sections.map((s) => ({ label: s.label, fields: fieldLabels(s) })),
      seo,
      unpublishedChanges: draft,
      articlePath: page.article?.path ?? null,
    }
  })
}

function collectionOf(config: AdminConfig, type: string): CollectionDef | undefined {
  return config.collections.find((c) => c.type === type)
}

/**
 * Lit Sanity et assemble le contexte. Une erreur de lecture n'empêche pas de répondre : `live: false`, contexte tiré du
 * manifeste seul (structure et écrans).
 */
export async function buildSiteData(input: {
  config: AdminConfig
  role: AdminRole
  reader: AskReader | null
  screen?: string
  log?: (line: string) => void
}): Promise<AskSiteData> {
  const { config, role } = input
  const routes = askRoutes(config, role)
  let raw: RawResult | null = null
  if (input.reader) {
    try {
      const { query, params } = buildSiteQuery(config)
      raw = (await input.reader.fetch<RawResult>(query, params)) ?? null
    } catch (error) {
      input.log?.(`ask: site data unavailable (${error instanceof Error ? error.name : 'error'})`)
      raw = null
    }
  }
  const live = !!raw
  const docs = raw?.docs ?? []
  const pick = (id: string) => {
    const draft = docs.find((d) => d._id === `drafts.${id}`)
    return { doc: draft ?? docs.find((d) => d._id === id), draft: !!draft }
  }

  const settingsDoc = live ? pick(config.settings.id).doc : undefined
  const rawScripts = Array.isArray(settingsDoc?.scripts) ? (settingsDoc.scripts as Record<string, unknown>[]) : []
  const settings: AskSiteData['settings'] = settingsDoc
    ? {
        title: str(settingsDoc.title),
        description: str(settingsDoc.description),
        faviconLight: hasAsset(settingsDoc.faviconLight),
        faviconDark: hasAsset(settingsDoc.faviconDark),
        socialImage: hasAsset(settingsDoc.socialImage),
        allowIndexing: bool(settingsDoc.allowIndexing),
        scripts: rawScripts.slice(0, MAX_SCRIPTS).map((s) => ({
          name: str(s.name) ?? 'Untitled script',
          enabled: s.enabled !== false,
          page: str(s.page) ?? 'all',
          placement: str(s.placement) ?? 'headEnd',
        })),
      }
    : null

  const articleSeo = config.articleSeoTemplates.flatMap((template) => {
    const doc = live ? pick(template.document.id).doc : undefined
    const collection = collectionOf(config, template.collection)
    const page = config.pages.find((p) => p.article?.collection === template.collection)
    if (!doc) return []
    return [
      {
        path: page?.article?.path ?? collection?.articlePath ?? '',
        collection: collection?.label ?? template.collection,
        metaTitle: str(doc.metaTitle),
        metaDescription: str(doc.metaDescription),
        allowIndexing: bool(doc.allowIndexing),
      },
    ]
  })

  const collections = config.collections.map((collection) => {
    const count = raw?.counts?.find((c) => c.type === collection.type)
    return {
      id: collection.id,
      label: collection.label,
      singular: collection.singular,
      published: count ? count.published : null,
      drafts: count ? count.drafts : null,
      articlePath: collection.articlePath ?? null,
    }
  })

  const media = {
    total: typeof raw?.assetTotal === 'number' ? raw.assetTotal : null,
    listed: (raw?.assets ?? []).map((asset) => ({
      name: asset.originalFilename ?? asset._id,
      alt: str(asset.altText),
      kb: typeof asset.size === 'number' ? Math.round(asset.size / 1024) : null,
      usedIn: usedIn(config, asset, docs),
    })),
  }

  return {
    site: config.site,
    role,
    routes,
    screen: screenOf(routes, input.screen),
    live,
    settings,
    pages: pagesOf(config, role, pick, live),
    articleSeo,
    collections,
    media,
    unpublishedDrafts: typeof raw?.drafts === 'number' ? raw.drafts : null,
  }
}

// ─── Rendu texte (données citées) ────────────────────────────────────────────

const q = (value: string | null, max: number) => (value ? `“${quoteData(value, max)}”` : 'missing')
const yesNo = (value: boolean) => (value ? 'set' : 'missing')
const indexing = (value: boolean | null) => (value === false ? 'hidden from search engines' : value === true ? 'indexed' : 'default')

/** Texte du bloc <site_data> (≈ 6 à 12 k caractères pour Conduit). */
export function renderSiteData(data: AskSiteData): string {
  const lines: string[] = []
  lines.push(`SITE: ${quoteData(data.site.name, 60)} (${quoteData(data.site.domain, 80)})`)
  lines.push(`USER ROLE: ${data.role === 'kuartz' ? 'Kuartz (the studio that built the site)' : data.role === 'client' ? 'Client admin' : 'Editor'}`)
  if (data.screen) lines.push(`USER IS ON SCREEN: ${data.screen.screen} (${data.screen.href})`)
  if (!data.live) lines.push('NOTE: live content data is unavailable right now; only the structure below is known.')

  lines.push('', 'ADMIN ROUTES (the only links you may give):')
  for (const route of data.routes) lines.push(`- ${route.href} — ${route.screen}: ${route.description}`)

  lines.push('', 'PAGES (structure is fixed by Kuartz; the client edits values only):')
  for (const page of data.pages) {
    const flags = [page.editable ? 'editable' : 'no editable content', page.aiEditor ? 'AI editor available' : 'no AI editor']
    if (page.unpublishedChanges) flags.push('has unpublished changes')
    lines.push(`- ${page.label} (${page.path}) — ${flags.join(', ')}`)
    for (const section of page.sections) lines.push(`  - Section ${section.label}: ${section.fields.join(', ') || '—'}`)
    if (page.seo) {
      lines.push(
        `  - SEO: meta title ${q(page.seo.metaTitle, 80)}; meta description ${q(page.seo.metaDescription, 180)}; social image ${yesNo(page.seo.ogImage)}; ${indexing(page.seo.allowIndexing)}`,
      )
    }
    if (page.articlePath) lines.push(`  - Article pages: ${page.articlePath}`)
  }
  for (const template of data.articleSeo) {
    lines.push(
      `- SEO template of ${template.path} (${template.collection}): meta title ${q(template.metaTitle, 80)}; meta description ${q(template.metaDescription, 180)}; ${indexing(template.allowIndexing)}`,
    )
  }

  lines.push('', 'CMS COLLECTIONS:')
  for (const c of data.collections) {
    const counts = c.published === null ? 'count unknown' : `${c.published} published, ${c.drafts ?? 0} draft(s) or unpublished edits`
    lines.push(`- ${c.label} (${c.singular.toLowerCase()}s): ${counts}${c.articlePath ? `; public page ${c.articlePath}` : ''}`)
  }

  if (data.settings) {
    const s = data.settings
    lines.push('', 'SITE SETTINGS (General):')
    lines.push(`- Site title ${q(s.title, 80)}; description ${q(s.description, 180)}`)
    lines.push(`- Favicon light ${yesNo(s.faviconLight)}; favicon dark ${yesNo(s.faviconDark)}; social image ${yesNo(s.socialImage)}; ${indexing(s.allowIndexing)}`)
    if (can(data.role, 'settings.code')) {
      lines.push(`- Scripts (Code): ${s.scripts.length ? '' : 'none'}`)
      for (const script of s.scripts) {
        lines.push(`  - ${q(script.name, 60)} — ${script.enabled ? 'on' : 'off'}, page ${quoteData(script.page, 20)}, ${quoteData(script.placement, 20)}`)
      }
    } else {
      lines.push(`- Scripts: ${s.scripts.length} (managed by Kuartz)`)
    }
  }

  lines.push('', `MEDIA: ${data.media.total ?? 'unknown number of'} file(s)${data.media.listed.length ? `; latest ${data.media.listed.length} images:` : ''}`)
  for (const m of data.media.listed) {
    lines.push(`- ${q(m.name, 80)}${m.kb !== null ? ` (${m.kb} KB)` : ''}; alt text ${q(m.alt, 120)}; used in: ${m.usedIn.length ? m.usedIn.join('; ') : 'not used'}`)
  }

  if (data.unpublishedDrafts !== null) lines.push('', `UNPUBLISHED DRAFTS: ${data.unpublishedDrafts} document(s) with changes not yet live (Publish puts them online).`)
  return lines.join('\n')
}
