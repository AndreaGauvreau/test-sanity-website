import 'server-only'

import { z } from 'zod'

import type { Session } from '@/admin/core/contracts'
import { AdminAuthError, authErrorResponse, jsonError, requireCapability } from '@/admin/core/auth/session'
import { isSameOriginRequest } from '@/admin/core/auth/request'
import { getWriteClient } from '@/admin/core/sanity/clients'
import { SanityWriteError } from '@/admin/core/sanity/paths'
import { toWriteError } from '@/admin/core/sanity/store'

import { findPage, resolveFieldAtPath } from '../lib/manifest'
import { errorMessage, saveArticleSeo, savePageField, savePageSeo, type SaveDeps, type SaveResult } from './save'

/**
 * Envoi d'une image depuis C1 (champ image), C2 (image OG de la page) ou C6 (image OG fixe du modèle d'article).
 * Route handler plutôt que server action : une server action est plafonnée à 1 Mo de corps par défaut (Next 16),
 * une image OG peut peser plus. Étapes : droit `content.write` → même origine → formulaire validé (zod) → fichier
 * vérifié (taille, type annoncé ET signature des premiers octets) → asset Sanity avec le jeton de l'utilisateur →
 * champ du brouillon mis à jour par le même cœur que les server actions (liste blanche du manifeste).
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

const form = z.discriminatedUnion('target', [
  z.object({ target: z.literal('seo') }),
  z.object({ target: z.literal('article') }),
  z.object({ target: z.literal('field'), path: z.string().min(1).max(256) }),
])

/** Type réel d'après les premiers octets (PNG, JPEG, WebP), ou null. */
export function sniffImageType(bytes: Uint8Array): (typeof TYPES)[number] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp'
  return null
}

export type UploadedAsset = { _id: string; url: string }

export type UploadDeps = SaveDeps & {
  /** Envoi de l'asset (par défaut : client Sanity de l'utilisateur). Injecté dans les tests. */
  uploadAsset?: (session: Session, data: Buffer, meta: { filename: string; contentType: string }) => Promise<UploadedAsset>
}

async function defaultUpload(session: Session, data: Buffer, meta: { filename: string; contentType: string }): Promise<UploadedAsset> {
  try {
    const asset = await getWriteClient(session).assets.upload('image', data, meta)
    return { _id: asset._id, url: asset.url }
  } catch (err) {
    throw toWriteError(err)
  }
}

export type UploadResult = { ok: true; assetId: string; url: string } | { ok: false; error: string; status: number }

/** Cœur testable : session déjà vérifiée. */
export async function uploadPageImage(session: Session, pageId: string, data: FormData, deps: UploadDeps = {}): Promise<UploadResult> {
  const parsed = form.safeParse({ target: data.get('target'), path: data.get('path') ?? undefined })
  const file = data.get('file')
  if (!parsed.success || !(file instanceof Blob)) return { ok: false, error: 'Choose an image to upload.', status: 400 }
  if (file.size === 0) return { ok: false, error: 'This file is empty.', status: 400 }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'This image is larger than 5 MB.', status: 413 }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sniffed = sniffImageType(bytes)
  if (!sniffed || !(TYPES as readonly string[]).includes(file.type) || sniffed !== file.type) {
    return { ok: false, error: 'Use a PNG, JPG or WebP image.', status: 415 }
  }
  // Cible vérifiée AVANT l'envoi (pas d'asset orphelin pour une cible refusée).
  const page = findPage(pageId, deps.config)
  const target = parsed.data
  const allowed =
    target.target === 'seo'
      ? Boolean(page?.document && page.seo?.ogImage)
      : target.target === 'article'
        ? Boolean(page?.article)
        : Boolean(page?.document && resolveFieldAtPath(page, target.path)?.kind === 'image')
  if (!page || !allowed) return { ok: false, error: "This field can't be edited here.", status: 400 }
  const name = file instanceof File && file.name ? file.name.replace(/[^\w.-]+/g, '-').slice(0, 100) : 'image'

  let asset: UploadedAsset
  try {
    asset = await (deps.uploadAsset ?? defaultUpload)(session, Buffer.from(bytes), { filename: name, contentType: sniffed })
  } catch (err) {
    return { ok: false, error: errorMessage(err), status: err instanceof SanityWriteError && err.code === 'forbidden' ? 403 : 502 }
  }

  let result: SaveResult
  if (target.target === 'seo') result = await savePageSeo(session, { pageId, key: 'ogImage', value: asset._id }, deps)
  else if (target.target === 'article') result = await saveArticleSeo(session, { pageId, key: 'ogImage', value: asset._id }, deps)
  else result = await savePageField(session, { pageId, path: target.path, value: asset._id }, deps)
  if (!result.ok) return { ok: false, error: result.error, status: 400 }
  return { ok: true, assetId: asset._id, url: asset.url }
}

/** Route handler complet (garde + CSRF + cœur). */
export async function handleImageUpload(request: Request, pageId: string): Promise<Response> {
  let session: Session
  try {
    session = await requireCapability('content.write', 'route')
  } catch (err) {
    if (err instanceof AdminAuthError) return authErrorResponse(err)
    throw err
  }
  if (!isSameOriginRequest(request.headers)) return jsonError(403, 'forbidden', 'This request was refused.')
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_IMAGE_BYTES + 64 * 1024) return jsonError(413, 'bad_request', 'This image is larger than 5 MB.')
  const data = await request.formData().catch(() => null)
  if (!data) return jsonError(400, 'bad_request', 'Choose an image to upload.')
  const result = await uploadPageImage(session, pageId, data)
  if (!result.ok) return jsonError(result.status, 'bad_request', result.error)
  return Response.json({ ok: true, assetId: result.assetId, url: result.url }, { headers: { 'cache-control': 'no-store' } })
}
