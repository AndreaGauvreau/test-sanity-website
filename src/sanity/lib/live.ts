import { defineLive } from 'next-sanity/live'

import { client } from './client'
import { token } from './token'

// sanityFetch : fetch mis en cache par Next, tagué avec les "sync tags" du Content Lake.
// <SanityLive /> : connexion au Live Content API qui invalide ces tags quand le contenu change.
export const { sanityFetch, SanityLive } = defineLive({
  client,
  serverToken: token,
  browserToken: token,
})
