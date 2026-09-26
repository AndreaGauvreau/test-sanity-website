/**
 * Simule une publication faite hors de l'admin (API, autre appareil) pour observer
 * la réaction du site : ajoute l'heure à la première question de la FAQ, ou la remet d'origine.
 * Nécessite le seed ; visible sur le site une fois la section FAQ construite.
 *
 *   npm run touch            → « What do customers think about Conduit Dock Scheduling? · 16:42:07 »
 *   npm run touch -- reset   → question d'origine
 */
import { getCliClient } from 'sanity/cli'

const client = getCliClient({ apiVersion: '2026-09-01' })

const id = 'faq-1'
const original = 'What do customers think about Conduit Dock Scheduling?'
const reset = process.argv.includes('reset')

const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const question = reset ? original : `${original} · ${time}`

client
  .patch(id)
  .set({ question })
  .commit()
  .then(() => console.log(`Publié : « ${question} » (${id})`))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
