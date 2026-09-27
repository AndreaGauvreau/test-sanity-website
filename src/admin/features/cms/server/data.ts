import 'server-only'

import type { AdminConfig, CollectionDef } from '@/admin/core/contracts/manifest'
import { getReadClient } from '@/admin/core/sanity/clients'
import { getDocumentState } from '@/admin/core/sanity/drafts'
import { readSanityEnv } from '@/admin/core/sanity/env'
import { isPublishedId } from '@/admin/core/sanity/paths'

import { imageUrl } from '../lib/image-url'
import { buildRows, type CmsRow } from '../lib/rows'
import { articlePathFor } from '../lib/slug'
import { computeStatus, type CmsStatus } from '../lib/status'
import { readCollectionDocs } from './deps'

/**
 * Lecture des données du CMS pour les Server Components (C3, C4). Jeton Viewer (lecture), perspective raw
 * (publiés + brouillons). Ne renvoie que du contenu éditorial prêt à passer en props client.
 */

export type ImageInfo = { assetId: string; src: string | null; name: string; size?: number; altText: string }

export type ItemView = {
  id: string
  status: CmsStatus
  title: string
  /** Valeurs des champs du manifeste, sous la forme attendue par les contrôles (slug → texte, date → AAAA-MM-JJ, image → id d'asset). */
  values: Record<string, unknown>
  images: Record<string, ImageInfo | null>
  /** Chemin public de l'élément (Preview ↗), seulement s'il a déjà été publié. */
  livePath: string | null
  /** Où la collection apparaît en dehors de la page de l'élément (pied du panneau ; le panneau ajoute « /blog/<slug> »). */
  shownOn: string[]
}

export async function loadCollectionRows(collection: CollectionDef): Promise<CmsRow[]> {
  const docs = await readCollectionDocs(collection.type)
  return buildRows(collection, docs, readSanityEnv())
}

function toDateInput(value: unknown): string {
  if (typeof value !== 'string') return ''
  const t = Date.parse(value)
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10)
}

/** Où la collection s'affiche d'après le manifeste : page listing, sections qui y font référence. */
export function shownOnFor(config: AdminConfig, collection: CollectionDef): string[] {
  const places: string[] = []
  for (const page of config.pages) {
    if (page.article?.collection === collection.type) places.push(page.path)
    for (const section of page.sections) {
      if (section.fields.some((f) => f.kind === 'reference' && f.to?.includes(collection.type))) places.push(`${page.label} › ${section.label}`)
    }
  }
  return [...new Set(places)]
}

export async function loadItem(config: AdminConfig, collection: CollectionDef, id: string): Promise<ItemView | null> {
  if (!isPublishedId(id)) return null
  const state = await getDocumentState(id)
  const doc = state.value
  if (!doc || doc._type !== collection.type) return null
  const env = readSanityEnv()

  const values: Record<string, unknown> = {}
  const imageRefs: Record<string, string> = {}
  for (const field of collection.fields) {
    const raw = doc[field.name]
    switch (field.kind) {
      case 'slug':
        values[field.name] = typeof (raw as { current?: unknown })?.current === 'string' ? (raw as { current: string }).current : ''
        break
      case 'date':
        values[field.name] = toDateInput(raw)
        break
      case 'image': {
        const ref = (raw as { asset?: { _ref?: unknown } } | undefined)?.asset?._ref
        values[field.name] = typeof ref === 'string' ? ref : null
        if (typeof ref === 'string') imageRefs[field.name] = ref
        break
      }
      case 'portableText':
        values[field.name] = Array.isArray(raw) ? raw : []
        break
      default:
        values[field.name] = raw ?? null
    }
  }

  const images: Record<string, ImageInfo | null> = {}
  const ids = [...new Set(Object.values(imageRefs))]
  const assets = ids.length
    ? await getReadClient({ perspective: 'raw' }).fetch<{ _id: string; originalFilename?: string; size?: number; altText?: string }[]>(
        `*[_id in $ids]{_id, originalFilename, size, altText}`,
        { ids },
      )
    : []
  for (const [field, ref] of Object.entries(imageRefs)) {
    const asset = assets.find((a) => a._id === ref)
    images[field] = {
      assetId: ref,
      src: imageUrl(ref, env, { w: 1600, fit: 'max' }),
      name: asset?.originalFilename ?? 'image',
      size: asset?.size,
      altText: asset?.altText ?? '',
    }
  }

  const publishedSlug = collection.slugField ? ((state.published?.[collection.slugField] as { current?: string } | undefined)?.current ?? null) : null
  const title = typeof doc[collection.titleField] === 'string' ? (doc[collection.titleField] as string) : ''
  return {
    id,
    status: computeStatus(state.published, state.draft) ?? 'draft',
    title,
    values,
    images,
    livePath: state.published ? articlePathFor(collection.articlePath, publishedSlug) : null,
    shownOn: shownOnFor(config, collection),
  }
}
