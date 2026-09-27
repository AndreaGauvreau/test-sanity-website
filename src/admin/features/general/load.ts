import 'server-only'

import adminConfig from '@/admin.config'
import { getDocumentState } from '@/admin/core/sanity/drafts'
import { readSanityEnv } from '@/admin/core/sanity/env'

import { toGeneralImage } from './images'
import { toGeneralView, type GeneralView } from './view'

/**
 * Lecture de `siteSettings` pour B2 (brouillon s'il existe, sinon publié), jeton Viewer côté serveur.
 * Ne renvoie que des valeurs affichables (textes, URL publiques du CDN) : rien de sensible pour le composant client.
 */
export async function loadGeneralSettings(): Promise<GeneralView> {
  const env = readSanityEnv()
  const state = await getDocumentState<Record<string, unknown>>(adminConfig.settings.id)
  return toGeneralView(state, adminConfig.site, (value) => toGeneralImage(value, env.projectId, env.dataset))
}
