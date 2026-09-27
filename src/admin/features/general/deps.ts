import 'server-only'

import adminConfig from '@/admin.config'
import type { Session } from '@/admin/core/contracts'
import { uploadImageAsset } from '@/admin/core/sanity/assets'
import { saveDraftField } from '@/admin/core/sanity/drafts'
import { readSanityEnv } from '@/admin/core/sanity/env'

import type { GeneralDeps } from './save'

/**
 * Vraies dépendances de B2 pour une session : écriture dans `drafts.siteSettings` (saveDraftField) et envoi d'asset
 * par l'aide partagée `uploadImageAsset` de core/sanity (jeton de l'utilisateur, droit `content.write`, type en liste
 * blanche, erreurs traduites). SERVEUR SEULEMENT. Utilisé par actions.ts et par la route d'envoi d'image.
 */
export function generalDeps(session: Session): GeneralDeps {
  const env = readSanityEnv()
  const id = adminConfig.settings.id
  return {
    projectId: env.projectId,
    dataset: env.dataset,
    saveField: (path, value, field) => saveDraftField(session, id, path, value, { field }),
    uploadImage: (bytes, { filename, contentType }) => uploadImageAsset(session, bytes, { filename, contentType }),
  }
}
