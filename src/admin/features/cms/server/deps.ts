import 'server-only'

import { requireCapability } from '@/admin/core/auth/session'
import { getReadClient } from '@/admin/core/sanity/clients'
import { createDraft, deleteDraft, getDocumentState, setDraftFields } from '@/admin/core/sanity/drafts'
import { readSanityEnv } from '@/admin/core/sanity/env'
import type { SanityDoc } from '@/admin/core/sanity/store'
import adminConfig from '@/admin.config'

import type { CmsDeps } from './actions-core'

/**
 * Dépendances réelles des actions du CMS : session Next, aides de brouillon de core/sanity (jeton de
 * l'utilisateur, ou robot en session de dev), lecture avec le jeton Viewer. SERVEUR SEULEMENT.
 */

/** Documents d'un type, publiés et brouillons (jamais les versions de release), 1 000 au plus. */
export async function readCollectionDocs(type: string): Promise<SanityDoc[]> {
  return getReadClient({ perspective: 'raw' }).fetch<SanityDoc[]>(
    `*[_type == $type && !(_id in path("versions.**"))][0...1000]`,
    { type },
  )
}

export function cmsDeps(): CmsDeps {
  return {
    requireCapability: (capability, context) => requireCapability(capability, context),
    config: adminConfig,
    env: readSanityEnv(),
    drafts: {
      getDocumentState: (id) => getDocumentState(id),
      setDraftFields: (session, id, patch, options) => setDraftFields(session, id, patch, options),
      createDraft: (session, type, initial, options) => createDraft(session, type, initial, options),
      deleteDraft: (session, id) => deleteDraft(session, id),
    },
    reader: {
      collectionDocs: readCollectionDocs,
      imageAssetExists: async (id) => {
        const found = await getReadClient({ perspective: 'raw' }).fetch<string | null>(`*[_id == $id && _type == "sanity.imageAsset"][0]._id`, { id })
        return found === id
      },
    },
    log: (message) => console.error(message),
  }
}
