/**
 * Contenu de départ : les textes du Figma « Get Conduit — client » (page Dock Scheduling),
 * repris tels quels (src/sanity/seed/).
 *
 *   npm run seed              ajoute ce qui manque, ne touche à rien d'existant
 *   npm run seed -- --force   remet la page, le témoignage et la FAQ dans l'état du Figma
 *
 * - Page Dock Scheduling (document unique) : chaque section absente est remplie avec les
 *   textes du Figma ; une section déjà présente (donc peut-être modifiée) est laissée telle quelle.
 * - Témoignages : le témoignage du Figma, publié.
 * - FAQ : les 9 questions. Seule la première a sa réponse dans le Figma : elle est publiée,
 *   les 8 autres sont créées en brouillon, réponse à rédiger dans l'admin avant publication.
 * - Blog : rien. Les cartes du Figma sont des exemples, les articles viendront du client.
 *
 * Ne supprime rien. L'ancien contenu de démo (LyonDrive) : npm run cleanup:legacy.
 */
import { getCliClient } from 'sanity/cli'

import { faqQuestions, firstFaqAnswer, testimonialDoc } from '../src/sanity/seed/collections'
import { pageSections, pageSeo } from '../src/sanity/seed/page'

const client = getCliClient({ apiVersion: '2026-09-01' })
const force = process.argv.includes('--force')

const PAGE_ID = 'dockSchedulingPage'

async function seed() {
  const { projectId, dataset } = client.config()
  console.log(`Seed${force ? ' (--force)' : ''} → projet ${projectId}, dataset ${dataset}`)

  // Documents déjà présents, publiés ou en brouillon : on ne les recrée pas.
  const existing = new Set(
    await client.fetch<string[]>(`*[_id in $ids]._id`, {
      ids: [PAGE_ID, `drafts.${PAGE_ID}`, ...faqQuestions.flatMap((_, i) => [`faq-${i + 1}`, `drafts.faq-${i + 1}`])],
    }),
  )

  const transaction = client.transaction()

  // --- Page ------------------------------------------------------------------------
  const pageContent = { ...pageSections, ...pageSeo }
  transaction.createIfNotExists({ _id: PAGE_ID, _type: 'dockSchedulingPage' })
  transaction.patch(PAGE_ID, (patch) => (force ? patch.set(pageContent) : patch.setIfMissing(pageContent)))
  // Un brouillon en cours doit recevoir les mêmes sections, sinon la publication les effacerait.
  if (existing.has(`drafts.${PAGE_ID}`)) {
    transaction.patch(`drafts.${PAGE_ID}`, (patch) =>
      force ? patch.set(pageContent) : patch.setIfMissing(pageContent),
    )
  }

  // --- Témoignage ------------------------------------------------------------------
  if (force) transaction.createOrReplace(testimonialDoc)
  else transaction.createIfNotExists(testimonialDoc)

  // --- FAQ -------------------------------------------------------------------------
  for (const [index, question] of faqQuestions.entries()) {
    const id = `faq-${index + 1}`
    const order = index + 1
    const alreadyThere = existing.has(id) || existing.has(`drafts.${id}`)
    if (alreadyThere && !force) continue
    if (index === 0) {
      transaction.createOrReplace({ _id: id, _type: 'faq', question, answer: firstFaqAnswer, order })
    } else {
      // Pas de réponse dans le Figma : brouillon, à compléter puis publier dans l'admin.
      transaction.createOrReplace({ _id: `drafts.${id}`, _type: 'faq', question, order })
    }
  }

  await transaction.commit()
  console.log(
    force
      ? 'Page, témoignage et FAQ remis dans l’état du Figma.'
      : 'Contenu manquant ajouté (page, témoignage, FAQ). Rien d’existant n’a été modifié.',
  )
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
