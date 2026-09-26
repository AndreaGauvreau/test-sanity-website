/**
 * Supprime l'ancien contenu de démo (LyonDrive) : page d'accueil `home`, 6 articles en
 * français et leurs images. Suppression définitive.
 *
 *   npm run cleanup:legacy
 */
import { getCliClient } from 'sanity/cli'

const client = getCliClient({ apiVersion: '2026-09-01' })

const legacySlugs = [
  'road-trips-depuis-lyon',
  'choisir-sa-voiture',
  'demenager-avec-un-utilitaire',
  'crit-air-et-zfe',
  'week-end-ski',
  'aeroport-saint-exupery',
]
const legacyIds = ['home', ...legacySlugs.map((slug) => `post-${slug}`)]
const legacyImages = ['itineraires.jpg', ...legacySlugs.map((slug) => `${slug}.jpg`)]

async function cleanup() {
  const { projectId, dataset } = client.config()
  console.log(`Nettoyage LyonDrive → projet ${projectId}, dataset ${dataset}`)

  // Supprimer un document absent ne fait rien : sans risque au deuxième lancement.
  const transaction = client.transaction()
  for (const id of legacyIds) transaction.delete(id).delete(`drafts.${id}`)
  await transaction.commit()
  console.log(`Documents supprimés : ${legacyIds.join(', ')}`)

  // Les images ne sont plus référencées : on les retire de la médiathèque.
  const assetIds = await client.fetch<string[]>(
    `*[_type == "sanity.imageAsset" && originalFilename in $names]._id`,
    { names: legacyImages },
  )
  for (const assetId of assetIds) {
    try {
      await client.delete(assetId)
    } catch (error) {
      console.warn(`  image ${assetId} gardée : encore utilisée ailleurs (${String(error)})`)
    }
  }
  if (assetIds.length > 0) console.log(`Médiathèque : ${assetIds.length} images LyonDrive traitées.`)
}

cleanup().catch((error) => {
  console.error(error)
  process.exit(1)
})
