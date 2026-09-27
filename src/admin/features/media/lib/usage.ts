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

export type UsagePlaceView = {
  id: string
  /** « Blog › How to cut dock wait times — Cover image » */
  label: string
  /** Écran de l'admin où le média est utilisé (lignes de la fiche). */
  adminHref?: string
  /** Page publique (« View ↗ » de l'Usage tooltip). */
  siteHref?: string
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

/** Nomme une utilisation d'après le manifeste. `doc` : version affichée (brouillon s'il existe). */
export function describeUsage(doc: ReferencingDoc, names: readonly string[], config: AdminConfig, siteUrl: string): Omit<UsagePlaceView, 'id'> {
  const publishedId = doc._id.replace(/^drafts\./, '')
  const site = (path: string | null) => (path ? `${siteUrl.replace(/\/$/, '')}${path}` : undefined)

  const collection = config.collections.find((c) => c.type === doc._type)
  if (collection) {
    const field = labelFromFields(collection.fields, names) ?? humanize(names[names.length - 1] ?? 'image')
    return {
      label: `${collection.label} › ${titleOf(doc, collection.titleField)} — ${field}`,
      adminHref: `/admin/cms/${collection.id}/${publishedId}`,
      siteHref: site(articlePathFor(collection.articlePath, slugOf(doc, collection.slugField))),
    }
  }

  const page = config.pages.find((p) => p.document?.id === publishedId)
  if (page) {
    const [first, ...rest] = names
    if (first === 'seo') {
      return { label: `${page.label} › SEO — Social image`, adminHref: `/admin/pages/${page.id}/seo`, siteHref: site(page.path) }
    }
    const section = page.sections.find((s) => s.name === first)
    const field = section ? (labelFromFields(section.fields, rest) ?? humanize(rest[rest.length - 1] ?? first)) : humanize(first ?? 'image')
    return {
      label: section ? `${page.label} › ${section.label} — ${field}` : `${page.label} — ${field}`,
      adminHref: `/admin/pages/${page.id}`,
      siteHref: site(page.path),
    }
  }

  if (publishedId === config.settings.id) {
    return { label: `Site settings — ${humanize(names[names.length - 1] ?? 'image')}`, adminHref: '/admin/settings/general', siteHref: site('/') }
  }

  const template = config.articleSeoTemplates.find((t) => t.document.id === publishedId)
  if (template) {
    const listing = config.pages.find((p) => p.article?.collection === template.collection)
    return {
      label: `${listing ? listing.label : 'Article'} › Article page — SEO image`,
      adminHref: listing ? `/admin/pages/${listing.id}/slug/seo` : undefined,
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
