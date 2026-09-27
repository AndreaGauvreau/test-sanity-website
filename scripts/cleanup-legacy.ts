/**
 * Supprime l'ancien contenu de démo (LyonDrive) : page d'accueil `home`, 6 articles en
 * français et leurs images. Suppression définitive. Refuse le dataset production.
 *
 *   npm run cleanup:legacy
 *
 * Aussi fait par `scripts/migrate-admin.ts -- --demo` (même logique : scripts/lib/legacy.ts).
 */
import { getCliClient } from 'sanity/cli'

import { assertNotProduction } from '../src/sanity/lib/dataset-guard'
import { removeLegacyDemo } from './lib/legacy'

const client = getCliClient({ apiVersion: '2026-09-01' })

async function cleanup() {
  const dataset = assertNotProduction(client)
  console.log(`Nettoyage LyonDrive → dataset ${dataset}`)
  await removeLegacyDemo(client)
}

cleanup().catch((error) => {
  console.error(error)
  process.exit(1)
})
