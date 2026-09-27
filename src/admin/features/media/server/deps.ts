import 'server-only'

import { requireCapability } from '@/admin/core/auth/session'
import type { Session } from '@/admin/core/contracts/session'
import { uploadImageAsset } from '@/admin/core/sanity/assets'
import { getReadClient, getWriteClient } from '@/admin/core/sanity/clients'
import { setDraftFields } from '@/admin/core/sanity/drafts'
import { readSanityEnv } from '@/admin/core/sanity/env'
import { toWriteError, type SanityDoc } from '@/admin/core/sanity/store'
import adminConfig from '@/admin.config'

import type { AssetDoc, MediaDeps, UploadInput } from './actions-core'

/**
 * Dépendances réelles de la médiathèque. Lecture d'affichage : jeton Viewer. Écritures ET relecture de
 * garde (références avant suppression, utilisations à repointer) : jeton de l'utilisateur (getWriteClient),
 * ou robot en session de dev. SERVEUR SEULEMENT.
 */

export const ASSET_FIELDS = `_id, _type, _createdAt, originalFilename, mimeType, extension, size, altText, title, url, metadata{dimensions{width, height}}`
export const ASSET_PROJECTION = `{${ASSET_FIELDS}}`

async function wrap<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    throw toWriteError(err)
  }
}

/**
 * Envoi d'un asset. Image : aide partagée `uploadImageAsset` de core/sanity (FOLLOWUPS #20 / #40 : droit, type
 * d'image en liste blanche, fichier non vide, nom nettoyé, erreurs traduites), puis relecture de l'asset complet
 * (dimensions, taille) avec le jeton de l'utilisateur. Vidéo, PDF… : client Sanity de l'utilisateur (l'aide
 * partagée ne couvre que les images). Taille et type de la médiathèque déjà vérifiés par `uploadCore`.
 */
export async function uploadAsset(session: Session, kind: 'image' | 'file', input: UploadInput): Promise<AssetDoc> {
  const client = getWriteClient(session)
  if (kind === 'file') {
    const doc = await client.assets.upload('file', Buffer.from(input.data), { filename: input.name, contentType: input.type })
    return doc as unknown as AssetDoc
  }
  const { _id, url } = await uploadImageAsset(session, input.data, { filename: input.name, contentType: input.type })
  const doc = await client.fetch<AssetDoc | null>(`*[_id == $id][0]${ASSET_PROJECTION}`, { id: _id })
  // Asset pas encore lisible (rare) : vue minimale tirée de l'envoi, complétée au prochain chargement.
  return (
    doc ?? {
      _id,
      _type: 'sanity.imageAsset',
      _createdAt: new Date().toISOString(),
      originalFilename: input.name,
      mimeType: input.type,
      extension: input.name.includes('.') ? input.name.split('.').pop()?.toLowerCase() : undefined,
      size: input.size,
      url,
    }
  )
}

export function mediaDeps(): MediaDeps & { listImages: () => Promise<AssetDoc[]> } {
  return {
    requireCapability: (capability, context) => requireCapability(capability, context),
    config: adminConfig,
    env: readSanityEnv(),
    siteUrl: adminConfig.site.url,
    assets: {
      get: (id) =>
        getReadClient({ perspective: 'raw' }).fetch<AssetDoc | null>(
          `*[_id == $id && _type in ["sanity.imageAsset", "sanity.fileAsset"]][0]${ASSET_PROJECTION}`,
          { id },
        ),
      referencingDocs: (session, id) =>
        wrap(() => getWriteClient(session).fetch<SanityDoc[]>(`*[references($id) && !(_id in path("versions.**"))]`, { id })),
      patch: (session, id, patch) =>
        wrap(async () => {
          let p = getWriteClient(session).patch(id)
          if (patch.set) p = p.set(patch.set)
          if (patch.unset?.length) p = p.unset(patch.unset)
          await p.commit({ visibility: 'sync' })
        }),
      delete: (session, id) =>
        wrap(async () => {
          await getWriteClient(session).delete(id)
        }),
      upload: (session, kind, input) => wrap(() => uploadAsset(session, kind, input)),
    },
    setDraftFields: (session, id, patch, options) => setDraftFields(session, id, patch, options),
    listImages: () =>
      getReadClient({ perspective: 'raw' }).fetch<AssetDoc[]>(`*[_type == "sanity.imageAsset"] | order(_createdAt desc)[0...500]${ASSET_PROJECTION}`),
    log: (message) => console.error(message),
  }
}
