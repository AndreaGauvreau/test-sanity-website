import { formatBytes } from '@/admin/ui/ImageUpload/format'

import type { UsagePlaceView } from './usage'

/**
 * Médiathèque (C5) : modèle d'affichage, tri, filtres, recherche et garde de suppression. Pur.
 * Règle du Figma : « Un média utilisé ne peut pas être supprimé : il faut d'abord le retirer du site. »
 */

export type MediaKind = 'image' | 'video' | 'file'

export type MediaAsset = {
  /** Id Sanity de l'asset (« image-… », « file-… »). */
  id: string
  kind: MediaKind
  /** Nom affiché (nom d'origine du fichier). */
  name: string
  mimeType: string
  extension: string
  size: number
  width?: number
  height?: number
  createdAt: string
  altText: string
  /** Vignette (images) ; null pour les fichiers. */
  thumb: string | null
  /** Aperçu plus grand, NON recadré (fiche à droite, miniatures de l'Usage tooltip) : 576 px au plus. */
  preview: string | null
  /** Image pour le grand aperçu (Modal), non recadrée : 2 400 px au plus. */
  full: string | null
  /** Fichier d'origine (téléchargement). */
  url: string
  usages: UsagePlaceView[]
}

export function mediaKind(mimeType: string, id = ''): MediaKind {
  if (id.startsWith('image-') || mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'file'
}

/** Tag de type de la carte : IMG, VIDEO, PDF, FILE. */
export function typeLabel(asset: Pick<MediaAsset, 'kind' | 'mimeType' | 'extension'>): string {
  if (asset.kind === 'image') return 'IMG'
  if (asset.kind === 'video') return 'VIDEO'
  if (asset.mimeType === 'application/pdf' || asset.extension === 'pdf') return 'PDF'
  return 'FILE'
}

/** « Used ×2 » ou « Unused ». */
export function usageLabel(count: number): string {
  return count > 0 ? `Used ×${count}` : 'Unused'
}

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const DAY_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** « JPG · 2400 × 1600 · 1.2 MB · added Sep 12 » (l'année s'affiche si elle n'est pas l'année en cours). */
export function assetMetaLine(asset: Pick<MediaAsset, 'extension' | 'width' | 'height' | 'size' | 'createdAt'>, now = new Date()): string {
  const parts = [asset.extension.toUpperCase()]
  if (asset.width && asset.height) parts.push(`${asset.width} × ${asset.height}`)
  parts.push(formatBytes(asset.size))
  const t = Date.parse(asset.createdAt)
  if (!Number.isNaN(t)) {
    const sameYear = new Date(t).getUTCFullYear() === now.getUTCFullYear()
    parts.push(`added ${(sameYear ? DAY : DAY_YEAR).format(t)}`)
  }
  return parts.join(' · ')
}

/** « 48 files · 312 MB » */
export function librarySummary(assets: readonly Pick<MediaAsset, 'size'>[]): string {
  const total = assets.reduce((sum, a) => sum + (a.size || 0), 0)
  return `${assets.length} ${assets.length === 1 ? 'file' : 'files'} · ${formatBytes(total)}`
}

// ─── Tri, filtres, recherche (G5 appliqué à Media : date, nom, taille ; type, usage) ────────────────

export type MediaSortField = 'date' | 'name' | 'size'
export type MediaSort = { by: MediaSortField; direction: 'asc' | 'desc' }
export type MediaCondition = { id: string; field: string; operator: string; value: string | null }
export type MediaQuery = { sort: MediaSort; conditions: readonly MediaCondition[]; search: string }

export const DEFAULT_MEDIA_SORT: MediaSort = { by: 'date', direction: 'desc' }

export const MEDIA_SORT_OPTIONS: { value: MediaSortField; label: string }[] = [
  { value: 'date', label: 'Date added' },
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'Size' },
]

export function mediaDirectionOptions(by: MediaSortField): { value: 'asc' | 'desc'; label: string }[] {
  if (by === 'name') return [{ value: 'asc', label: 'A to Z' }, { value: 'desc', label: 'Z to A' }]
  if (by === 'size') return [{ value: 'desc', label: 'Largest first' }, { value: 'asc', label: 'Smallest first' }]
  return [{ value: 'desc', label: 'Newest first' }, { value: 'asc', label: 'Oldest first' }]
}

export const MEDIA_FILTER_FIELDS = [
  {
    value: 'type',
    label: 'Type',
    options: [
      { value: 'image', label: 'Image' },
      { value: 'video', label: 'Video' },
      { value: 'file', label: 'File' },
    ],
  },
  {
    value: 'usage',
    label: 'Usage',
    options: [
      { value: 'used', label: 'Used' },
      { value: 'unused', label: 'Unused' },
    ],
  },
] as const

function filterValue(asset: MediaAsset, field: string): string {
  if (field === 'type') return asset.kind
  if (field === 'usage') return asset.usages.length > 0 ? 'used' : 'unused'
  return ''
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function applyMediaQuery(assets: readonly MediaAsset[], query: MediaQuery): MediaAsset[] {
  const conditions = query.conditions.filter((c) => c.field && c.value)
  const terms = normalize(query.search).split(/\s+/).filter(Boolean)
  const sign = query.sort.direction === 'asc' ? 1 : -1
  return assets
    .filter((a) =>
      conditions.every((c) => {
        const equal = filterValue(a, c.field) === c.value
        return c.operator === 'is-not' ? !equal : equal
      }),
    )
    .filter((a) => {
      if (terms.length === 0) return true
      const hay = normalize(`${a.name} ${a.altText} ${a.extension}`)
      return terms.every((t) => hay.includes(t))
    })
    .sort((a, b) => {
      let r = 0
      if (query.sort.by === 'name') r = collator.compare(a.name, b.name)
      else if (query.sort.by === 'size') r = a.size - b.size
      else r = Date.parse(a.createdAt) - Date.parse(b.createdAt)
      return r * sign || collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1)
    })
}

// ─── Garde de suppression ────────────────────────────────────────────────────

export function isDeletable(asset: Pick<MediaAsset, 'usages'>): boolean {
  return asset.usages.length === 0
}

/** Sépare une sélection en fichiers supprimables (inutilisés) et verrouillés (utilisés). */
export function partitionForDelete<T extends Pick<MediaAsset, 'id' | 'usages'>>(assets: readonly T[]): { deletable: T[]; locked: T[] } {
  const deletable: T[] = []
  const locked: T[] = []
  for (const a of assets) (isDeletable(a) ? deletable : locked).push(a)
  return { deletable, locked }
}

/** Texte du cadenas : « Used in 2 places — remove it from the site before deleting. » */
export function lockReason(count: number): string {
  return `Used in ${count} ${count === 1 ? 'place' : 'places'} — remove it from the site before deleting.`
}

/** Id d'asset accepté par les actions (entrée non fiable). */
export function isAssetId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128 && /^(image|file)-[a-f0-9]+(-\d+x\d+)?-[a-z0-9]+$/i.test(value)
}
