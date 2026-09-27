/**
 * Tags reçus par les server actions de Live (src/sanity/lib/live-action.ts) — constat SEC-02.
 *
 * Ces actions sont appelables par n'importe quel visiteur (une server action est un point d'entrée HTTP
 * public). On ne garde donc que des sync tags du Content Lake tels que `sanityFetch` les pose
 * (« sanity:s1:<jeton> », ex. « sanity:s1:1p8chw »), sans doublon, et au plus MAX_LIVE_TAGS : un appel forgé ne
 * peut ni invalider un tag arbitraire, ni faire travailler le serveur sans limite. Tout le reste est ignoré
 * (jamais d'exception : une entrée invalide = aucune invalidation).
 *
 * Module pur (un fichier « use server » n'exporte que des fonctions asynchrones).
 */

/** Au-delà, les tags suivants sont ignorés. Un événement réel en porte quelques-uns. */
export const MAX_LIVE_TAGS = 64

const SYNC_TAG = /^sanity:s1:[A-Za-z0-9_-]{1,64}$/

export function knownLiveTags(unsafeTags: unknown): string[] {
  if (!Array.isArray(unsafeTags)) return []
  const tags = new Set<string>()
  for (const tag of unsafeTags.slice(0, MAX_LIVE_TAGS * 4)) {
    if (typeof tag === 'string' && SYNC_TAG.test(tag)) tags.add(tag)
    if (tags.size === MAX_LIVE_TAGS) break
  }
  return [...tags]
}
