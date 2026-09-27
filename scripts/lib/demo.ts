import type { SanityClient } from '@sanity/client'
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

import { demoFaqAnswers, demoScripts, demoTestimonials } from '../../src/sanity/seed/demo-collections'
import { demoPosts, type DemoPost } from '../../src/sanity/seed/demo-blog'
import { coverBuffer } from './images'
import { removeLegacyDemo } from './legacy'

/**
 * Données de démonstration Conduit (dataset development seulement ; la garde anti-production est
 * appliquée par l'appelant, scripts/migrate-admin.ts). Idempotent : ids fixes, createOrReplace des
 * documents de démo, upload d'images adressé par contenu (même fichier → même asset).
 */

type Options = { dryRun: boolean; log: (message: string) => void }

// Clés Portable Text stables : même contenu → mêmes clés (pas de faux changement à la relance).
const blockKey = (slug: string, index: number, part = 'b') => `${slug.slice(0, 20)}-${part}${index}`

function portableText(slug: string, body: string[]) {
  return body.map((text, index) => {
    const heading = text.startsWith('## ')
    return {
      _type: 'block',
      _key: blockKey(slug, index),
      style: heading ? 'h2' : 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: blockKey(slug, index, 's'), text: heading ? text.slice(3) : text, marks: [] }],
    }
  })
}

async function uploadCover(client: SanityClient, post: DemoPost, index: number): Promise<string> {
  const { alt, ...spec } = post.cover
  const filename = `conduit-demo-${String(index + 1).padStart(2, '0')}-${post.slug}.jpg`
  const asset = await client.assets.upload('image', await coverBuffer(spec), { filename })
  // Texte alternatif sur l'asset (question 13 du Figma) : le site le lit en repli (coalesce).
  await client.patch(asset._id).set({ altText: alt, title: post.title }).commit()
  return asset._id
}

export async function runDemo(client: SanityClient, { dryRun, log }: Options) {
  // 4. Démo LyonDrive retirée (development seulement).
  await removeLegacyDemo(client, { dryRun, log })

  // 5. Blog : 12 articles, rangés du plus récent au plus ancien (orderRank = ordre du site).
  const ranks = generateNKeysBetween(null, null, demoPosts.length)
  log(`Démo : ${demoPosts.length} articles (images tirées des photos du site)`)
  if (!dryRun) {
    const transaction = client.transaction()
    for (const [index, post] of demoPosts.entries()) {
      const assetId = await uploadCover(client, post, index)
      transaction.createOrReplace({
        _id: `post-demo-${post.slug}`,
        _type: 'post',
        title: post.title,
        slug: { _type: 'slug', current: post.slug },
        category: post.category,
        author: post.author,
        publishedAt: `${post.date}T08:00:00.000Z`,
        excerpt: post.excerpt,
        image: { _type: 'image', asset: { _type: 'reference', _ref: assetId } },
        content: portableText(post.slug, post.body),
        orderRank: ranks[index],
      })
    }
    await transaction.commit()
  }

  // 6a. Témoignages : après ceux qui existent (le premier de l'ordre manuel reste celui de la page).
  const lastTestimonial = await client.fetch<string | null>(
    `*[_type == "testimonial" && !(_id in $ids) && defined(orderRank)] | order(orderRank desc)[0].orderRank`,
    { ids: demoTestimonials.map((t) => t._id) },
    { perspective: 'raw' },
  )
  log(`Démo : ${demoTestimonials.length} témoignages`)
  if (!dryRun) {
    let rank = lastTestimonial
    const transaction = client.transaction()
    for (const testimonial of demoTestimonials) {
      rank = generateKeyBetween(rank, null)
      transaction.createOrReplace({ _type: 'testimonial', ...testimonial, orderRank: rank })
    }
    await transaction.commit()
  }

  // 6b. FAQ : les questions en brouillon sans réponse reçoivent la leur et sont publiées.
  const faqs = await client.fetch<{ _id: string; question: string; orderRank?: string }[]>(
    `*[_type == "faq" && _id in $ids]{ _id, question, orderRank, answer }`,
    { ids: Object.keys(demoFaqAnswers).flatMap((id) => [id, `drafts.${id}`]) },
    { perspective: 'raw' },
  )
  const published = new Set(faqs.filter((faq) => !faq._id.startsWith('drafts.')).map((faq) => faq._id))
  const drafts = faqs.filter((faq) => faq._id.startsWith('drafts.') && !published.has(faq._id.slice(7)))
  log(`Démo : ${drafts.length} question(s) de FAQ publiées avec leur réponse`)
  if (!dryRun && drafts.length) {
    const transaction = client.transaction()
    for (const draft of drafts) {
      const id = draft._id.slice('drafts.'.length)
      transaction.createOrReplace({
        _id: id,
        _type: 'faq',
        question: draft.question,
        orderRank: draft.orderRank,
        answer: (demoFaqAnswers[id] ?? []).map((text, index) => ({
          _type: 'block',
          _key: `${id}-a${index}`,
          style: 'normal',
          markDefs: [],
          children: [{ _type: 'span', _key: `${id}-s${index}`, text, marks: [] }],
        })),
      })
      transaction.delete(draft._id)
    }
    await transaction.commit()
  }

  // 6c. Script d'exemple (JSON-LD sur les pages article) : ajouté une fois, par sa clé.
  const settings = await client.fetch<{ scripts?: { _key: string }[] } | null>(
    `*[_id == "siteSettings"][0]{ scripts }`,
    {},
    { perspective: 'raw' },
  )
  const missing = demoScripts.filter((script) => !settings?.scripts?.some((s) => s._key === script._key))
  log(`Démo : ${missing.length} script(s) d'exemple ajouté(s) à siteSettings`)
  if (!dryRun && missing.length) {
    await client.patch('siteSettings').setIfMissing({ scripts: [] }).append('scripts', missing).commit()
  }
}
