/**
 * Simule une publication faite hors de l'admin (API, autre appareil) pour observer
 * la réaction du site : ajoute l'heure au titre d'un article, ou le remet d'origine.
 *
 *   npm run touch            → « 5 road trips au départ de Lyon · 16:42:07 »
 *   npm run touch -- reset   → titre d'origine
 */
import { getCliClient } from 'sanity/cli'

const client = getCliClient({ apiVersion: '2026-09-01' })

const id = 'post-road-trips-depuis-lyon'
const original = '5 road trips au départ de Lyon'
const reset = process.argv.includes('reset')

const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const title = reset ? original : `${original} · ${time}`

client
  .patch(id)
  .set({ title })
  .commit()
  .then(() => console.log(`Publié : « ${title} » (${id})`))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
