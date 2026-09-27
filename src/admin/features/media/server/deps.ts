import 'server-only'

import { requireCapability } from '@/admin/core/auth/session'
import { getReadClient, getWriteClient } from '@/admin/core/sanity/clients'
import { setDraftFields } from '@/admin/core/sanity/drafts'
import { readSanityEnv } from '@/admin/core/sanity/env'
import { toWriteError, type SanityDoc } from '@/admin/core/sanity/store'
import adminConfig from '@/admin.config'

import type { AssetDoc, MediaDeps } from './actions-core'

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
      upload: (session, kind, input) =>
        wrap(async () => {
          const doc = await getWriteClient(session).assets.upload(kind, Buffer.from(input.data), {
            filename: input.name,
            contentType: input.type,
          })
          return doc as unknown as AssetDoc
        }),
    },
    setDraftFields: (session, id, patch, options) => setDraftFields(session, id, patch, options),
    listImages: () =>
      getReadClient({ perspective: 'raw' }).fetch<AssetDoc[]>(`*[_type == "sanity.imageAsset"] | order(_createdAt desc)[0...500]${ASSET_PROJECTION}`),
    log: (message) => console.error(message),
  }
}
