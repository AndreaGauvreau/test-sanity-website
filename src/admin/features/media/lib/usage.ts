import type { AdminConfig, FieldDef } from '@/admin/core/contracts/manifest'
import { articlePathFor } from '@/admin/features/cms/lib/slug'

/**
 * Utilisations d'un média (C5 « Used ×N », Usage tooltip, fiche à droite). Pur.
 *
 * GROQ `references()` dit QUELS documents pointent vers l'asset, pas OÙ : on parcourt le document pour
 * trouver les chemins (`image`, `seo.ogImage`, `content[_key=="k"]`) puis on les nomme d'après le manifeste
 * (« Blog › Carrier portals: a checklist — Cover image », « Home › Hero — Background »).
 */

export type AssetPath = {
  /** Chemin Sanity de l'objet qui porte `asset` (clés `_key`, jamais d'index). null : tableau sans `_key`. */
  path: string | null
  /** Chemin lisible pour les libellés (noms des champs seulement). */
  names: string[]
}

type Json = unknown

function isObject(v: Json): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Chemins des objets `{ asset: { _ref: assetId } }` dans `doc` (champs système ignorés). */
export function findAssetPaths(doc: Json, assetId: string): AssetPath[] {
  const out: AssetPath[] = []
  const walk = (node: Json, path: string | null, names: string[]) => {
    if (Array.isArray(node)) {
      for (const item of node) {
        const key = isObject(item) && typeof item._key === 'string' && /^[\w-]{1,64}$/.test(item._key) ? item._key : null
        walk(item, path !== null && key ? `${path}[_key=="${key}"]` : null, names)
      }
      return
    }
    if (!isObject(node)) return
    const asset = node.asset
    if (isObject(asset) && asset._ref === assetId) {
      out.push({ path, names })
    }
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('_') || key === 'asset' || !/^[A-Za-z][\w]*$/.test(key)) continue
      if (typeof value !== 'object' || value === null) continue
      walk(value, path === null ? null : path === '' ? key : `${path}.${key}`, [...names, key])
    }
  }
  // Racine : chemin vide (le document lui-même ne porte jamais `asset`).
  if (isObject(doc)) {
    for (const [key, value] of Object.entries(doc)) {
      if (key.startsWith('_') || !/^[A-Za-z][\w]*$/.test(key) || typeof value !== 'object' || value === null) continue
      walk(value, key, [key])
    }
  }
  return out
}

/**
 * Où la miniature de l'Usage tooltip montre le média (lib/usage-preview.ts) :
 * - `page` : page publique, chemin RELATIF (« /blog/x », même origine que l'admin) → la vraie page en petit ;
 * - `favicon` : favicon des réglages → aperçu d'onglet du kit (FaviconPreview), au thème du champ ;
 * - `social` : image de partage (SEO d'une page, réglages, modèle SEO d'article) → aperçu du kit (SocialPreview).
 * Absent : repli (l'image seule, entourée).
 */
export type UsagePreview =
  | { kind: 'page'; path: string }
  | { kind: 'favicon'; theme: 'light' | 'dark' }
  | { kind: 'social'; domain: string; title: string; description?: string }

export type UsagePlaceView = {
  id: string
  /** « Blog › How to cut dock wait times — Cover image » */
  label: string
  /** Écran de l'admin où le média est utilisé (lignes de la fiche). */
  adminHref?: string
  /** Page publique (« View ↗ » de l'Usage tooltip). */
  siteHref?: string
  /** Miniature de l'Usage tooltip. */
  preview?: UsagePreview
}

export type ReferencingDoc = Record<string, unknown> & { _id: string; _type: string }

function humanize(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

/** Libellé d'un champ d'après une liste de FieldDef (descend dans les objets et tableaux). */
function labelFromFields(fields: readonly FieldDef[] | undefined, names: readonly string[]): string | null {
  let current = fields
  let label: string | null = null
  for (const name of names) {
    const def = current?.find((f) => f.name === name)
    if (!def) return label ? label : null
    label = def.kind === 'portableText' ? `${def.label} image` : def.label
    current = def.fields
  }
  return label
}

function titleOf(doc: ReferencingDoc, field: string): string {
  const v = doc[field]
  return typeof v === 'string' && v.trim() ? v : 'Untitled'
}

function slugOf(doc: ReferencingDoc, field: string | undefined): string | null {
  if (!field) return null
  const v = doc[field] as { current?: unknown } | string | undefined
  if (typeof v === 'string') return v
  return typeof v?.current === 'string' ? v.current : null
}

/** Texte non vide au chemin pointé (« seo.metaTitle ») du document, sinon undefined. */
function textAt(doc: ReferencingDoc, path: string | undefined): string | undefined {
  if (!path) return undefined
  let v: unknown = doc
  for (const key of path.split('.')) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Modèle SEO d'article : « {{title}} — Conduit » → « Title — Conduit » (libellés des variables du manifeste). */
function fillTemplate(text: string | undefined, variables: readonly { token: string; label: string }[]): string | undefined {
  return text?.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (all, token: string) => variables.find((v) => v.token === token)?.label ?? all)
}

/** Aperçu réseaux sociaux (SocialPreview) : domaine du site, titre et description connus du document. */
function social(config: AdminConfig, title: string, description: string | undefined): UsagePreview {
  return { kind: 'social', domain: config.site.domain, title, ...(description ? { description } : {}) }
}

/** Nomme une utilisation d'après le manifeste. `doc` : version affichée (brouillon s'il existe). */
export function describeUsage(doc: ReferencingDoc, names: readonly string[], config: AdminConfig, siteUrl: string): Omit<UsagePlaceView, 'id'> {
  const publishedId = doc._id.replace(/^drafts\./, '')
  const site = (path: string | null) => (path ? `${siteUrl.replace(/\/$/, '')}${path}` : undefined)
  // Miniature « page vivante » (`preview.kind === 'page'`) : chemin RELATIF, que l'admin affiche sur sa propre
  // origine (le site et l'admin sont la même application Next) ; `siteHref` reste l'URL publique de « View ↗ ».

  const collection = config.collections.find((c) => c.type === doc._type)
  if (collection) {
    const field = labelFromFields(collection.fields, names) ?? humanize(names[names.length - 1] ?? 'image')
    const path = articlePathFor(collection.articlePath, slugOf(doc, collection.slugField))
    return {
      label: `${collection.label} › ${titleOf(doc, collection.titleField)} — ${field}`,
      adminHref: `/admin/cms/${collection.id}/${publishedId}`,
      siteHref: site(path),
      ...(path ? { preview: { kind: 'page', path } } : {}),
    }
  }

  const pageDef = config.pages.find((p) => p.document?.id === publishedId)
  if (pageDef) {
    const [first, ...rest] = names
    if (first === 'seo') {
      // Image de partage : absente du corps de la page (balise og:image) → aperçu réseaux sociaux.
      return {
        label: `${pageDef.label} › SEO — Social image`,
        adminHref: `/admin/pages/${pageDef.id}/seo`,
        siteHref: site(pageDef.path),
        preview: social(config, textAt(doc, pageDef.seo?.metaTitle) ?? pageDef.label, textAt(doc, pageDef.seo?.metaDescription)),
      }
    }
    const section = pageDef.sections.find((s) => s.name === first)
    const field = section ? (labelFromFields(section.fields, rest) ?? humanize(rest[rest.length - 1] ?? first)) : humanize(first ?? 'image')
    return {
      label: section ? `${pageDef.label} › ${section.label} — ${field}` : `${pageDef.label} — ${field}`,
      adminHref: `/admin/pages/${pageDef.id}`,
      siteHref: site(pageDef.path),
      preview: { kind: 'page', path: pageDef.path },
    }
  }

  if (publishedId === config.settings.id) {
    // Réglages : pas de page où voir le fichier ; favicon dans un onglet, image de partage en carte, sinon repli.
    const field = names[names.length - 1]
    const preview: UsagePreview | undefined =
      field === 'faviconLight'
        ? { kind: 'favicon', theme: 'light' }
        : field === 'faviconDark'
          ? { kind: 'favicon', theme: 'dark' }
          : field === 'socialImage'
            ? social(config, textAt(doc, 'title') ?? config.site.name, textAt(doc, 'description'))
            : undefined
    return {
      label: `Site settings — ${humanize(field ?? 'image')}`,
      adminHref: '/admin/settings/general',
      siteHref: site('/'),
      ...(preview ? { preview } : {}),
    }
  }

  const template = config.articleSeoTemplates.find((t) => t.document.id === publishedId)
  if (template) {
    const listing = config.pages.find((p) => p.article?.collection === template.collection)
    const title = fillTemplate(textAt(doc, 'metaTitle'), template.variables) ?? `${listing ? listing.label : 'Article'} article`
    return {
      label: `${listing ? listing.label : 'Article'} › Article page — SEO image`,
      adminHref: listing ? `/admin/pages/${listing.id}/slug/seo` : undefined,
      preview: social(config, title, fillTemplate(textAt(doc, 'metaDescription'), template.variables)),
    }
  }

  return { label: `${humanize(doc._type)} — ${humanize(names[names.length - 1] ?? 'image')}` }
}

/**
 * Utilisations d'un asset d'après les documents qui le référencent (publiés et brouillons, même id publié
 * compté une fois ; la version affichée est le brouillon s'il existe).
 */
export function usagesOf(assetId: string, docs: readonly ReferencingDoc[], config: AdminConfig, siteUrl: string): UsagePlaceView[] {
  const byId = new Map<string, ReferencingDoc>()
  for (const doc of docs) {
    const id = doc._id.replace(/^drafts\./, '')
    const known = byId.get(id)
    if (!known || doc._id.startsWith('drafts.')) byId.set(id, doc)
  }
  const out: UsagePlaceView[] = []
  for (const [id, doc] of byId) {
    const paths = findAssetPaths(doc, assetId)
    // Référencé sans chemin trouvable (autre forme de référence) : compté quand même, libellé générique.
    const list = paths.length ? paths : [{ path: null, names: [] as string[] }]
    list.forEach((p, i) => out.push({ id: `${id}:${p.path ?? i}`, ...describeUsage(doc, p.names, config, siteUrl) }))
  }
  return out
}
