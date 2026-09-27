import { can } from '@/admin/core/contracts/roles'
import type { Session } from '@/admin/core/contracts/session'

import { SanityWriteError } from './paths'
import { toWriteError } from './store'

/**
 * Envoi d'une IMAGE dans les assets Sanity au nom de l'utilisateur : logique PURE (envoyeur injecté), partagée par
 * general (B2), pages (C1/C2/C6) et media (C4/C5) — FOLLOWUPS #20. L'enveloppe serveur est dans assets.ts.
 *
 * Ce module ne fixe PAS la taille maximale (chaque écran a la sienne) ni ne lit les octets pour deviner le type :
 * l'appelant a déjà vérifié taille et signature. Il garantit : droit `content.write`, type d'image en liste blanche,
 * fichier non vide, nom de fichier nettoyé, erreurs Sanity traduites (SanityWriteError, message anglais).
 */

export const IMAGE_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const

export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number]

export type UploadedImageAsset = { _id: string; url: string }

/** Envoi brut (client Sanity de l'utilisateur en production, faux envoyeur dans les tests). */
export type ImageUploader = (data: Uint8Array, meta: { filename: string; contentType: string }) => Promise<{ _id: string; url: string }>

/** « Mon logo (final).PNG » → « Mon-logo-final-.PNG » ; vide → « image ». 100 caractères au plus. */
export function safeAssetFilename(name: string | null | undefined): string {
  const clean = (name ?? '').replace(/[^\w.-]+/g, '-').replace(/^[.-]+/, '').slice(0, 100)
  return clean || 'image'
}

export async function uploadImageAssetWith(
  session: Session,
  upload: ImageUploader,
  bytes: Uint8Array | ArrayBuffer,
  meta: { filename?: string | null; contentType: string },
): Promise<UploadedImageAsset> {
  if (!can(session.role, 'content.write')) throw new SanityWriteError('forbidden', "You don't have access to this.")
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (data.byteLength === 0) throw new SanityWriteError('bad_request', 'This file is empty.')
  const contentType = meta.contentType.trim().toLowerCase()
  if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new SanityWriteError('bad_request', 'This file type is not supported. Use a PNG, JPG, WebP, GIF, AVIF, SVG or ICO image.')
  }
  let asset: { _id: string; url: string }
  try {
    asset = await upload(data, { filename: safeAssetFilename(meta.filename), contentType })
  } catch (err) {
    throw toWriteError(err)
  }
  if (!asset || typeof asset._id !== 'string' || !asset._id.startsWith('image-')) {
    throw new SanityWriteError('unavailable', "Sanity isn't responding. Please try again in a moment.")
  }
  return { _id: asset._id, url: asset.url }
}
