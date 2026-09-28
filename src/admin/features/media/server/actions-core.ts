import { z } from 'zod'

import type { AdminConfig, FieldDef } from '@/admin/core/contracts/manifest'
import type { Capability } from '@/admin/core/contracts/roles'
import type { Session } from '@/admin/core/contracts/session'
import type { DraftPatch } from '@/admin/core/sanity/draft-core'
import { SanityWriteError } from '@/admin/core/sanity/paths'
import type { SanityDoc } from '@/admin/core/sanity/store'
import { validateFieldValue } from '@/admin/core/sanity/validate'
import { imageUrl, type ImageCdnEnv } from '@/admin/features/cms/lib/image-url'

import { isAssetId, mediaKind, type MediaAsset, type MediaKind } from '../lib/assets'
import { checkUpload, UPLOAD_TYPES } from '../lib/upload-limits'
import { findAssetPaths, usagesOf, type ReferencingDoc } from '../lib/usage'

/**
 * Logique des actions de la médiathèque (C5), sans Next : dépendances injectées, testée avec de faux clients.
 * Droit `content.write` EN PREMIER, entrées validées (zod), écritures avec le jeton de l'utilisateur.
 *
 * Particularité : un asset Sanity n'a pas de brouillon. Le texte alternatif (`altText`, sur l'asset,
 * question 13) est donc écrit directement sur l'asset ; un remplacement crée un NOUVEL asset et fait
 * pointer les utilisations vers lui dans leurs BROUILLONS (en ligne au prochain Publish).
 */

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export type AssetDoc = {
  _id: string
  _type: 'sanity.imageAsset' | 'sanity.fileAsset'
  _createdAt?: string
  originalFilename?: string
  mimeType?: string
  extension?: string
  size?: number
  altText?: string
  title?: string
  url?: string
  metadata?: { dimensions?: { width?: number; height?: number } }
}

export type UploadInput = { name: string; type: string; size: number; data: Uint8Array }

export type MediaDeps = {
  requireCapability: (capability: Capability, context: 'action' | 'route') => Promise<Session>
  config: AdminConfig
  env: ImageCdnEnv
  siteUrl: string
  assets: {
    get: (id: string) => Promise<AssetDoc | null>
    /** Documents (publiés et brouillons) qui référencent l'asset, lus avec le jeton de l'utilisateur. */
    referencingDocs: (session: Session, id: string) => Promise<SanityDoc[]>
    patch: (session: Session, id: string, patch: { set?: Record<string, unknown>; unset?: string[] }) => Promise<void>
    delete: (session: Session, id: string) => Promise<void>
    upload: (session: Session, kind: 'image' | 'file', input: UploadInput) => Promise<AssetDoc>
  }
  setDraftFields: (session: Session, id: string, patch: DraftPatch, options: { fields?: Record<string, FieldDef> }) => Promise<{ draftId: string }>
  log?: (message: string) => void
}

const ALT_FIELD: FieldDef = { name: 'altText', label: 'Alt text', kind: 'string', maxLength: 250 }
const ASSET_REF_FIELD: FieldDef = { name: 'asset', label: 'Media', kind: 'reference', required: true }

// Types et limites d'envoi : lib/upload-limits.ts (partagé avec l'interface).
export { checkUpload, UPLOAD_ACCEPT, UPLOAD_MAX_BYTES, UPLOAD_TYPES } from '../lib/upload-limits'

const altInput = z.object({ assetId: z.string().refine(isAssetId), altText: z.string().max(2000) })
const deleteInput = z.object({ ids: z.array(z.string().refine(isAssetId)).min(1).max(200) })
const replaceInput = z.string().refine(isAssetId)

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

function errorResult(err: unknown, deps: MediaDeps): { ok: false; error: string } {
  if (err instanceof SanityWriteError) return fail(err.message)
  const status = (err as { status?: unknown; statusCode?: unknown })?.status ?? (err as { statusCode?: unknown })?.statusCode
  if (status === 401) return fail('Your session has expired. Sign in again.')
  if (status === 403) return fail("You don't have access to this.")
  if (status === 409) return fail('This file is still used on the site: remove it from the site before deleting.')
  deps.log?.(`[media] ${err instanceof Error ? err.message : String(err)}`)
  return fail('Something went wrong. Please try again.')
}

/** Nom de fichier affichable : sans chemin, sans caractères de contrôle, 120 caractères au plus. */
export function safeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim() ?? ''
  return (base || 'file').slice(-120)
}

/** Vue d'un asset pour l'interface (usages nommés d'après le manifeste). */
export function toMediaAsset(asset: AssetDoc, refs: readonly ReferencingDoc[], deps: Pick<MediaDeps, 'config' | 'env' | 'siteUrl'>): MediaAsset {
  const kind = mediaKind(asset.mimeType ?? '', asset._id)
  const isImage = asset._type === 'sanity.imageAsset'
  return {
    id: asset._id,
    kind,
    name: asset.originalFilename || asset._id,
    mimeType: asset.mimeType ?? '',
    extension: (asset.extension ?? '').toLowerCase(),
    size: asset.size ?? 0,
    width: asset.metadata?.dimensions?.width,
    height: asset.metadata?.dimensions?.height,
    createdAt: asset._createdAt ?? '',
    altText: asset.altText ?? '',
    thumb: isImage ? imageUrl(asset._id, deps.env, { w: 368, h: 248, fit: 'crop' }) : null,
    // Aperçus dans le ratio de l'image (`fit=max` : jamais recadrés, jamais agrandis) : fiche (288 px, @2x) et Modal.
    preview: isImage ? imageUrl(asset._id, deps.env, { w: 576, h: 576, fit: 'max' }) : null,
    full: isImage ? imageUrl(asset._id, deps.env, { w: 2400, h: 2400, fit: 'max' }) : null,
    url: asset.url ?? '',
    usages: usagesOf(asset._id, refs, deps.config, deps.siteUrl),
  }
}

/** Texte alternatif sur l'asset (vaut pour toutes les utilisations de l'image). */
export async function updateAltTextCore(deps: MediaDeps, input: unknown): Promise<ActionResult<{ altText: string }>> {
  let session: Session
  try {
    session = await deps.requireCapability('content.write', 'action')
  } catch (err) {
    return errorResult(err, deps)
  }
  const parsed = altInput.safeParse(input)
  if (!parsed.success) return fail('Invalid request.')
  const { assetId } = parsed.data
  const altText = parsed.data.altText.trim()
  const message = validateFieldValue(ALT_FIELD, altText)
  if (message) return fail(message)
  try {
    const asset = await deps.assets.get(assetId)
    if (!asset || asset._type !== 'sanity.imageAsset') return fail('This image no longer exists.')
    await deps.assets.patch(session, assetId, altText ? { set: { altText } } : { unset: ['altText'] })
    return { ok: true, altText }
  } catch (err) {
    return errorResult(err, deps)
  }
}

/**
 * Suppression : seuls les fichiers qu'AUCUN document (publié ou brouillon) ne référence. Revérifié ici avec
 * le jeton de l'utilisateur, juste avant d'effacer (l'interface peut être en retard).
 */
export async function deleteAssetsCore(deps: MediaDeps, input: unknown): Promise<ActionResult<{ deleted: string[]; locked: string[] }>> {
  let session: Session
  try {
    session = await deps.requireCapability('content.write', 'action')
  } catch (err) {
    return errorResult(err, deps)
  }
  const parsed = deleteInput.safeParse(input)
  if (!parsed.success) return fail('Invalid request.')
  const deleted: string[] = []
  const locked: string[] = []
  try {
    for (const id of new Set(parsed.data.ids)) {
      const refs = await deps.assets.referencingDocs(session, id)
      if (refs.length > 0) {
        locked.push(id)
        continue
      }
      await deps.assets.delete(session, id)
      deleted.push(id)
    }
    return { ok: true, deleted, locked }
  } catch (err) {
    const result = errorResult(err, deps)
    return deleted.length ? fail(`${result.error} (${deleted.length} deleted before the error.)`) : result
  }
}

/**
 * Envoi d'un fichier dans la médiathèque. Avec `replace` : le nouvel asset reprend le texte alternatif de
 * l'ancien, puis chaque utilisation est repointée vers lui dans le brouillon de son document.
 */
export async function uploadCore(
  deps: MediaDeps,
  file: UploadInput | null,
  replace: unknown,
): Promise<ActionResult<{ asset: MediaAsset; updated: number }>> {
  let session: Session
  try {
    session = await deps.requireCapability('content.write', 'route')
  } catch (err) {
    return errorResult(err, deps)
  }
  if (!file) return fail('Choose a file to upload.')
  let previous: AssetDoc | null = null
  if (replace !== null && replace !== undefined && replace !== '') {
    if (!replaceInput.safeParse(replace).success) return fail('Invalid request.')
    try {
      previous = await deps.assets.get(replace as string)
    } catch (err) {
      return errorResult(err, deps)
    }
    if (!previous) return fail('The file to replace no longer exists.')
  }
  const expectedKind = previous ? mediaKind(previous.mimeType ?? '', previous._id) : undefined
  const problem = checkUpload(file, expectedKind)
  if (problem) return fail(problem)

  try {
    const kind = UPLOAD_TYPES[file.type] === 'image' ? 'image' : 'file'
    const uploaded = await deps.assets.upload(session, kind, { ...file, name: safeFilename(file.name) })
    let updated = 0
    if (previous) {
      if (previous.altText && !uploaded.altText && uploaded._type === 'sanity.imageAsset') {
        await deps.assets.patch(session, uploaded._id, { set: { altText: previous.altText } })
        uploaded.altText = previous.altText
      }
      if (uploaded._id !== previous._id) updated = await repointUsages(deps, session, previous._id, uploaded._id)
    }
    const refs = (await deps.assets.referencingDocs(session, uploaded._id)) as ReferencingDoc[]
    return { ok: true, asset: toMediaAsset(uploaded, refs, deps), updated }
  } catch (err) {
    return errorResult(err, deps)
  }
}

/** Fait pointer chaque utilisation de `fromId` vers `toId`, dans le brouillon de chaque document. */
async function repointUsages(deps: MediaDeps, session: Session, fromId: string, toId: string): Promise<number> {
  const docs = await deps.assets.referencingDocs(session, fromId)
  // Version affichée par document : le brouillon s'il existe (c'est lui que l'on modifie).
  const byId = new Map<string, SanityDoc>()
  for (const doc of docs) {
    const id = doc._id.replace(/^drafts\./, '')
    if (!byId.has(id) || doc._id.startsWith('drafts.')) byId.set(id, doc)
  }
  let updated = 0
  for (const [id, doc] of byId) {
    const paths = findAssetPaths(doc, fromId).map((p) => p.path).filter((p): p is string => !!p)
    if (paths.length === 0) continue
    const set: Record<string, unknown> = {}
    const fields: Record<string, FieldDef> = {}
    for (const path of paths) {
      set[`${path}.asset`] = { _type: 'reference', _ref: toId }
      fields[`${path}.asset`] = ASSET_REF_FIELD
    }
    await deps.setDraftFields(session, id, { set }, { fields })
    updated += paths.length
  }
  return updated
}

export type PickerImage = { id: string; name: string; thumb: string | null; altText: string }

/** Images de la médiathèque pour le choix d'une image dans une fiche CMS (« Replace › Choose from Media »). */
export async function listImagesCore(deps: MediaDeps & { listImages: () => Promise<AssetDoc[]> }): Promise<ActionResult<{ images: PickerImage[] }>> {
  try {
    await deps.requireCapability('content.write', 'action')
    const assets = await deps.listImages()
    return {
      ok: true,
      images: assets.map((a) => ({
        id: a._id,
        name: a.originalFilename || a._id,
        thumb: imageUrl(a._id, deps.env, { w: 240, h: 160, fit: 'crop' }),
        altText: a.altText ?? '',
      })),
    }
  } catch (err) {
    return errorResult(err, deps)
  }
}
