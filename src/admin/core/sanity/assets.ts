import 'server-only'

import type { Session } from '@/admin/core/contracts/session'

import { uploadImageAssetWith, type ImageUploader, type UploadedImageAsset } from './assets-core'
import { getWriteClient } from './clients'

/**
 * Envoi d'une image dans les assets Sanity avec le JETON DE L'UTILISATEUR (jeton robot seulement en session de dev,
 * voir clients.ts). SERVEUR SEULEMENT. Logique et règles : assets-core.ts.
 *
 * Exemple : `const { _id, url } = await uploadImageAsset(session, bytes, { filename: file.name, contentType: 'image/png' })`
 * Erreurs : SanityWriteError (forbidden, bad_request, unavailable), message anglais prêt à afficher.
 */

export type { UploadedImageAsset } from './assets-core'
export { IMAGE_CONTENT_TYPES, safeAssetFilename } from './assets-core'

export function uploadImageAsset(
  session: Session,
  bytes: Uint8Array | ArrayBuffer,
  meta: { filename?: string | null; contentType: string },
  options: { upload?: ImageUploader } = {},
): Promise<UploadedImageAsset> {
  const upload: ImageUploader =
    options.upload ??
    (async (data, info) => {
      const asset = await getWriteClient(session).assets.upload('image', Buffer.from(data.buffer, data.byteOffset, data.byteLength), info)
      return { _id: asset._id, url: asset.url }
    })
  return uploadImageAssetWith(session, upload, bytes, meta)
}
