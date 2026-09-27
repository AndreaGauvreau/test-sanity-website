import type { SanityClient } from '@sanity/client'

/**
 * Ancienne démo LyonDrive (hors sujet pour Conduit) : document `home` (type absent du schéma), 6 articles
 * en français et leurs images. Suppression DÉFINITIVE : appelée seulement après la garde anti-production
 * (cleanup-legacy.ts, migrate-admin.ts -- --demo).
 */
export const LEGACY_SLUGS = [
  'road-trips-depuis-lyon',
  'choisir-sa-voiture',
  'demenager-avec-un-utilitaire',
  'crit-air-et-zfe',
  'week-end-ski',
  'aeroport-saint-exupery',
]
export const LEGACY_IDS = ['home', ...LEGACY_SLUGS.map((slug) => `post-${slug}`)]
const LEGACY_IMAGES = ['itineraires.jpg', ...LEGACY_SLUGS.map((slug) => `${slug}.jpg`)]

export async function removeLegacyDemo(
  client: SanityClient,
  { dryRun = false, log = console.log }: { dryRun?: boolean; log?: (message: string) => void } = {},
) {
  const present = await client.fetch<string[]>(
    `*[_id in $ids]._id`,
    { ids: LEGACY_IDS.flatMap((id) => [id, `drafts.${id}`]) },
    { perspective: 'raw' },
  )
  log(`LyonDrive : ${present.length} document(s) à supprimer${present.length ? ` (${present.join(', ')})` : ''}`)
  if (!dryRun && present.length) {
    // Supprimer un document absent ne fait rien : sans risque au deuxième lancement.
    const transaction = client.transaction()
    for (const id of present) transaction.delete(id)
    await transaction.commit()
  }

  // Les images ne sont plus référencées : on les retire de la médiathèque.
  const assetIds = await client.fetch<string[]>(
    `*[_type == "sanity.imageAsset" && originalFilename in $names]._id`,
    { names: LEGACY_IMAGES },
  )
  log(`LyonDrive : ${assetIds.length} image(s) à retirer de la médiathèque`)
  if (dryRun) return
  for (const assetId of assetIds) {
    try {
      await client.delete(assetId)
    } catch (error) {
      log(`  image ${assetId} gardée : encore utilisée ailleurs (${String(error)})`)
    }
  }
}
