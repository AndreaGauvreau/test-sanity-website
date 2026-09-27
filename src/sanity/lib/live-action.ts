'use server'

import { revalidatePath, revalidateTag, updateTag } from 'next/cache'
import { draftMode } from 'next/headers'
import { parseTags } from 'next-sanity/live'

/**
 * Appelée par <SanityLive /> (layout du site) à chaque publication qui touche une
 * requête de la page : `updateTag` vide le cache et la page ouverte se met à jour
 * en quelques secondes, sans recharger.
 *
 * Pour comparer, SANITY_LIVE_MODE=swr dans .env.local rebranche l'action par défaut
 * de next-sanity 13 (voir (site)/layout.tsx). En `npm run prod`, elle fait
 * `revalidateTag(tag, 'max')` : l'onglet ouvert reste sur l'ancienne version et le
 * rechargement suivant montre la nouvelle. En `npm run dev`, elle est instantanée
 * aussi : la différence ne se voit qu'en prod.
 */
export async function onContentChange(unsafeTags: unknown): Promise<void | 'refresh'> {
  const { isEnabled: isDraftMode } = await draftMode()

  // En Draft Mode (Presentation), les pages ne sont pas en cache : un refresh suffit.
  if (isDraftMode) return 'refresh'

  const { tags } = parseTags(unsafeTags)
  for (const tag of tags) updateTag(tag)

  console.log(`[sanity-live] updateTag → ${tags.join(', ')}`)
}

/**
 * Même rôle, branché sur le Studio embarqué (/studio, layout src/app/studio) : une
 * publication faite depuis le Studio vide le cache des pages concernées même si aucun
 * onglet du site n'est ouvert. Pas de rafraîchissement ici : le Studio n'affiche pas ces
 * données. Les publications de l'admin (/admin, moteur IA) passent par POST /api/revalidate.
 *
 * Limite à connaître : une publication faite ailleurs (Studio hébergé, API, scripts)
 * sans aucun onglet ouvert ne vide rien, sauf appel à POST /api/revalidate (webhook,
 * moteur de l'admin) ; sinon, bouton « Vider le cache » sur /bench.
 */
export async function onPublishFromAdmin(unsafeTags: unknown): Promise<void> {
  const { tags } = parseTags(unsafeTags)
  const profile = process.env.SANITY_LIVE_MODE === 'swr' ? 'max' : { expire: 0 }
  for (const tag of tags) revalidateTag(tag, profile)
  console.log(`[sanity-live] publication depuis l'admin → ${tags.join(', ')}`)
}

/** Vide tout le cache Next des pages du site (bouton sur /bench). */
export async function purgeSiteCache(): Promise<void> {
  revalidatePath('/', 'layout')
  console.log('[sanity-live] cache du site vidé')
}
