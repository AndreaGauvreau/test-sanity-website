import type { CollectionDef, ColumnDef, FieldDef } from '@/admin/core/contracts/manifest'

import { imageUrl, type ImageCdnEnv } from './image-url'
import { toPlainText } from './portable-text'
import { computeStatus, type CmsStatus } from './status'

/**
 * Modèle d'affichage d'une ligne du tableau C3, construit côté serveur depuis les versions publiée et
 * brouillon d'un document. Pur. Ne contient que du contenu éditorial (aucun jeton, aucun champ système).
 */

export type CellValue = {
  /** Texte affiché (coupé « … » par la cellule). */
  text: string
  /** Modifiable sur place (texte court) ; sinon un clic ouvre le panneau sur ce champ. */
  editable: boolean
  /** Valeur de départ du champ en édition. */
  raw?: string
  /** Vignette (colonnes image). */
  image?: string | null
}

export type CmsRow = {
  id: string
  status: CmsStatus
  title: string
  /** Clé d'ordre manuel de la version affichée (brouillon s'il existe). */
  rank: string | null
  updatedAt: string
  /** Date éditoriale (première colonne date) pour le tri « Date ». */
  date: string | null
  cells: Record<string, CellValue>
  /** Valeurs brutes pour les filtres (status + champs `filters` du manifeste). */
  filters: Record<string, string>
  /** Texte de recherche normalisé (champs `searchFields`). */
  search: string
}

type Doc = Record<string, unknown> & { _id: string; _updatedAt?: string }

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** « Sep 12, 2026 » (UTC) ; « — » si vide ou invalide. */
export function formatDate(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '—'
  const t = Date.parse(value)
  return Number.isNaN(t) ? '—' : DATE_FORMAT.format(t)
}

/** Recherche insensible à la casse et aux accents. */
export function normalizeSearch(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function fieldDef(collection: CollectionDef, name: string): FieldDef | undefined {
  return collection.fields.find((f) => f.name === name)
}

/** Valeur texte d'un champ, quel que soit son genre (slug → current, texte riche → texte brut). */
export function textOf(value: unknown, field?: FieldDef): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    if (field?.kind === 'select') return field.options?.find((o) => o.value === value)?.label ?? value
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return toPlainText(value)
  if (typeof value === 'object' && typeof (value as { current?: unknown }).current === 'string') {
    return (value as { current: string }).current
  }
  return ''
}

/** Types de champ modifiables sur place (C3 : « Types non éditables sur place (image, texte riche) : clic = ouvrir le drawer »). */
export function isInlineEditable(column: ColumnDef, field: FieldDef | undefined, value: unknown): boolean {
  if (!field || (column.kind !== 'title' && column.kind !== 'text')) return false
  if (field.kind === 'string' || field.kind === 'slug' || field.kind === 'url') return true
  if (field.kind === 'text') return typeof value !== 'string' || !/[\r\n]/.test(value)
  return false
}

export function buildCell(column: ColumnDef, field: FieldDef | undefined, value: unknown, env: ImageCdnEnv): CellValue {
  if (column.kind === 'image') {
    const ref = (value as { asset?: { _ref?: unknown } } | null)?.asset?._ref
    return { text: '', editable: false, image: imageUrl(ref, env, { w: 112, h: 56, fit: 'crop' }) }
  }
  if (column.kind === 'date') return { text: formatDate(value), editable: false }
  const text = textOf(value, field)
  const editable = isInlineEditable(column, field, value)
  return { text: text === '' && column.kind !== 'title' ? '—' : text, editable, ...(editable ? { raw: text } : {}) }
}

export function buildRow(collection: CollectionDef, published: Doc | null, draft: Doc | null, env: ImageCdnEnv): CmsRow | null {
  const status = computeStatus(published, draft)
  const doc = draft ?? published
  if (!status || !doc) return null
  const id = published?._id ?? (draft as Doc)._id.replace(/^drafts\./, '')

  const cells: Record<string, CellValue> = {}
  for (const column of collection.columns) {
    if (column.kind === 'status') continue
    cells[column.field] = buildCell(column, fieldDef(collection, column.field), doc[column.field], env)
  }
  const dateColumn = collection.columns.find((c) => c.kind === 'date')
  const filters: Record<string, string> = { status }
  for (const filter of collection.filters ?? []) {
    if (filter.field === 'status') continue
    const raw = doc[filter.field]
    filters[filter.field] = typeof raw === 'string' ? raw : textOf(raw)
  }
  const search = normalizeSearch(collection.searchFields.map((f) => textOf(doc[f], fieldDef(collection, f))).join(' \n '))
  const rank = typeof doc.orderRank === 'string' ? doc.orderRank : null
  const date = dateColumn && typeof doc[dateColumn.field] === 'string' ? (doc[dateColumn.field] as string) : null

  return {
    id,
    status,
    title: textOf(doc[collection.titleField], fieldDef(collection, collection.titleField)),
    rank,
    updatedAt: (draft?._updatedAt ?? published?._updatedAt ?? '') as string,
    date,
    cells,
    filters,
    search,
  }
}

/** Regroupe publiés et brouillons par id publié puis construit les lignes. */
export function buildRows(collection: CollectionDef, docs: readonly Doc[], env: ImageCdnEnv): CmsRow[] {
  const byId = new Map<string, { published: Doc | null; draft: Doc | null }>()
  for (const doc of docs) {
    if (doc._id.startsWith('versions.')) continue
    const isDraft = doc._id.startsWith('drafts.')
    const id = isDraft ? doc._id.slice('drafts.'.length) : doc._id
    const entry = byId.get(id) ?? { published: null, draft: null }
    if (isDraft) entry.draft = doc
    else entry.published = doc
    byId.set(id, entry)
  }
  const rows: CmsRow[] = []
  for (const { published, draft } of byId.values()) {
    const row = buildRow(collection, published, draft, env)
    if (row) rows.push(row)
  }
  return rows
}

/** « 12 posts », « 1 post », « 3 testimonials ». */
export function countLabel(count: number, collection: Pick<CollectionDef, 'singular'>): string {
  const singular = collection.singular.toLowerCase()
  if (count === 1) return `1 ${singular}`
  return `${count} ${pluralize(singular)}`
}

export function pluralize(word: string): string {
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`
  return `${word}s`
}
