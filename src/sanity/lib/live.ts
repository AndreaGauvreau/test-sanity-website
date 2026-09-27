import { defineLive } from 'next-sanity/live'

import { isEditorPreview } from '@/lib/editor/preview'

import { client } from './client'
import { token } from './token'

// sanityFetch : fetch mis en cache par Next, tagué avec les "sync tags" du Content Lake.
// <SanityLive /> : connexion au Live Content API qui invalide ces tags quand le contenu change.
const live = defineLive({
  client,
  serverToken: token,
  browserToken: token,
})

export const SanityLive = live.SanityLive

// Client de l'aperçu de l'éditeur IA : brouillons (perspective drafts) avec le jeton de lecture,
// sans CDN ni stega. Le jeton ne sert que côté serveur.
const previewClient = client.withConfig({
  token,
  perspective: 'drafts',
  useCdn: false,
  stega: false,
})

/**
 * sanityFetch du site. En mode aperçu de l'éditeur IA (KZ_EDITOR_PREVIEW=1, voir src/lib/editor/preview.ts),
 * lit les brouillons SANS cache Next (`no-store`) : le moteur écrit un brouillon puis demande `refresh` au
 * pont, la page suivante doit le montrer. Stega toujours coupé (il fausserait longueurs et mesures).
 * Hors aperçu : sanityFetch de next-sanity, inchangé (published, stega en Draft Mode seulement).
 */
export const sanityFetch: typeof live.sanityFetch = (options) => {
  if (!isEditorPreview()) return live.sanityFetch(options)
  return previewFetch(options) as ReturnType<typeof live.sanityFetch>
}

async function previewFetch({ query, params = {} }: Parameters<typeof live.sanityFetch>[0]) {
  const data = await previewClient.fetch(query, await params, { cache: 'no-store' })
  return { data, sourceMap: null, tags: [] as string[] }
}
