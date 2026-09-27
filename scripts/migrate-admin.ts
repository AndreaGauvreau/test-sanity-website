/**
 * Migration du modèle de contenu pour l'admin (site-adapter). Idempotente : relancée, elle ne change
 * plus rien. DATASET DE DÉVELOPPEMENT SEULEMENT : refus explicite sur production (garde ci-dessous).
 *
 *   npx sanity exec scripts/migrate-admin.ts --with-user-token                structure seule
 *   npx sanity exec scripts/migrate-admin.ts --with-user-token -- --demo      structure + données de démo
 *   npx sanity exec scripts/migrate-admin.ts --with-user-token -- --dry-run   plan, sans écrire
 *
 * Structure (rendu du site identique) :
 *   1. dockSchedulingPage : seoTitle / seoDescription → seo { metaTitle, metaDescription, allowIndexing },
 *      puis retrait des deux anciens champs (document publié ET brouillon) ;
 *   2. orderRank (fractional-indexing) sur post, testimonial, faq, dans l'ordre affiché aujourd'hui
 *      (faq : ancien champ `order` ; post : date desc ; testimonial : création desc), brouillon et
 *      publié d'un même document avec la même clé ; les documents déjà classés gardent leur clé ;
 *   3. documents uniques créés s'ils manquent : siteSettings (titre « Conduit », description, image de
 *      partage tirée d'une photo du site), blogPage (textes d'avant l'admin), articleSeo-post (modèle
 *      qui reproduit les métadonnées d'avant : {{title}}, {{excerpt}}, image de l'article) ; pages
 *      /testimonials et /faq (question 15 révisée) : testimonialsPage, faqPage (textes par défaut du site,
 *      src/lib/page-defaults.ts), articleSeo-testimonial, articleSeo-faq (modèles par défaut de src/lib/seo.ts).
 * Slugs (toujours, après la démo qui réécrit les témoignages de démo) :
 *   8. slug des témoignages (nom + entreprise) et des questions (question) qui n'en ont pas, unique dans sa
 *      collection, même valeur sur le publié et le brouillon ; un slug existant n'est jamais changé.
 * Démo (--demo, contenu CHANGÉ, voir docs/admin/research/site-baseline/README.md) :
 *   4. suppression de la démo LyonDrive (document home, 6 articles français, leurs images) ;
 *   5. blog de démonstration Conduit : 12 articles en anglais (src/sanity/seed/demo-blog.ts), images
 *      tirées des photos du site, texte alternatif sur l'asset ;
 *   6. deux témoignages de plus, réponses publiées des 8 questions de la FAQ, un script d'exemple
 *      (JSON-LD BlogPosting sur les pages article).
 * Signature (toujours, SEC-04) :
 *   7. signe les scripts d'exemple de siteSettings (publié et brouillon) dont le contenu est IDENTIQUE à
 *      celui du dépôt (src/sanity/seed/demo-script-signatures.ts), avec SCRIPTS_SIGNING_SECRET (.env.local) ;
 *      le site n'injecte que les scripts signés. Secret absent : étape sautée (le dit). Les autres scripts ne
 *      sont signés que par l'admin (B3).
 */
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'
import { getCliClient } from 'sanity/cli'

import { slugify, uniqueSlug } from '../src/admin/features/cms/lib/slug'
import { FAQ_PAGE_DEFAULTS, TESTIMONIALS_PAGE_DEFAULTS } from '../src/lib/page-defaults'
import { assertNotProduction } from '../src/sanity/lib/dataset-guard'
import { planDemoScriptSignatures } from '../src/sanity/seed/demo-script-signatures'
import { runDemo } from './lib/demo'
import { socialImageBuffer } from './lib/images'

const client = getCliClient({ apiVersion: '2026-09-01' })
const dryRun = process.argv.includes('--dry-run')
const demo = process.argv.includes('--demo')

type Doc = { _id: string; _type: string; [key: string]: unknown }

const log = (message: string) => console.log(`${dryRun ? '[dry-run] ' : ''}${message}`)

/** Id publié d'un document (brouillon ou version compris). */
const publishedId = (id: string) => id.replace(/^drafts\./, '').replace(/^versions\.[^.]+\./, '')

// ─── 1. SEO de la page ────────────────────────────────────────────────────────────────────

async function migratePageSeo() {
  const docs = await client.fetch<Doc[]>(
    // Champ absent → null dans une projection GROQ : on teste `defined()` côté requête.
    `*[_id in ["dockSchedulingPage", "drafts.dockSchedulingPage"]]{
      _id, _type, seo, seoTitle, seoDescription, "hasOld": defined(seoTitle) || defined(seoDescription)
    }`,
    {},
    { perspective: 'raw' },
  )
  for (const doc of docs) {
    if (!doc.hasOld) {
      log(`page : ${doc._id} déjà migré`)
      continue
    }
    const seo = {
      _type: 'seo',
      ...(typeof doc.seoTitle === 'string' ? { metaTitle: doc.seoTitle } : {}),
      ...(typeof doc.seoDescription === 'string' ? { metaDescription: doc.seoDescription } : {}),
      allowIndexing: true,
    }
    log(`page : ${doc._id} seoTitle/seoDescription → seo`)
    if (dryRun) continue
    // setIfMissing : un objet seo déjà saisi (Studio, admin) n'est jamais écrasé.
    await client.patch(doc._id).setIfMissing({ seo }).unset(['seoTitle', 'seoDescription']).commit()
  }
}

// ─── 2. Ordre manuel ──────────────────────────────────────────────────────────────────────

/** Ordre affiché aujourd'hui par le site, par type (le plus « haut » d'abord). */
const CURRENT_ORDER: Record<string, string> = {
  faq: 'order asc, _createdAt asc',
  post: 'publishedAt desc, _createdAt desc',
  testimonial: '_createdAt desc',
}

async function migrateOrderRank(type: string) {
  const docs = await client.fetch<{ _id: string; orderRank?: string }[]>(
    `*[_type == $type] | order(${CURRENT_ORDER[type]}){ _id, orderRank }`,
    { type },
    { perspective: 'raw' },
  )
  // Un rang par document publié : le brouillon suit son document (même clé).
  const ids = [...new Set(docs.map((doc) => publishedId(doc._id)))]
  const rankOf = new Map<string, string>()
  for (const doc of docs) if (doc.orderRank) rankOf.set(publishedId(doc._id), doc.orderRank)

  const missing = ids.filter((id) => !rankOf.has(id))
  if (missing.length === 0) {
    log(`orderRank ${type} : déjà en place (${ids.length})`)
  } else if (rankOf.size === 0) {
    // Aucun classement : clés neuves dans l'ordre actuel.
    const keys = generateNKeysBetween(null, null, ids.length)
    ids.forEach((id, index) => rankOf.set(id, keys[index]))
    log(`orderRank ${type} : ${ids.length} clés créées dans l'ordre affiché`)
  } else {
    // Classement partiel : les nouveaux après le dernier, dans l'ordre actuel.
    let last = [...rankOf.values()].sort().at(-1) ?? null
    for (const id of missing) {
      last = generateKeyBetween(last, null)
      rankOf.set(id, last)
    }
    log(`orderRank ${type} : ${missing.length} clés ajoutées après les ${ids.length - missing.length} existantes`)
  }

  const transaction = client.transaction()
  let writes = 0
  for (const doc of docs) {
    const rank = rankOf.get(publishedId(doc._id))
    if (!rank || doc.orderRank === rank) continue
    transaction.patch(doc._id, (patch) => patch.set({ orderRank: rank }))
    writes++
  }
  if (writes && !dryRun) await transaction.commit()
}

// ─── 3. Documents uniques ─────────────────────────────────────────────────────────────────

async function ensureSingletons() {
  const existing = new Set(
    await client.fetch<string[]>(
      `*[_id in ["siteSettings", "blogPage", "articleSeo-post", "testimonialsPage", "faqPage", "articleSeo-testimonial", "articleSeo-faq"]]._id`,
      {},
      { perspective: 'raw' },
    ),
  )

  if (existing.has('siteSettings')) log('siteSettings : existe, inchangé')
  else {
    log('siteSettings : création (titre, description, image de partage)')
    if (!dryRun) {
      // Image de partage 1200 × 630 recadrée dans la photo de l'appel final (visuel du site).
      const asset = await client.assets.upload('image', await socialImageBuffer(), {
        filename: 'conduit-social-image.jpg',
      })
      await client
        .patch(asset._id)
        .setIfMissing({ altText: 'Aerial view of a distribution center at night, trailers backed into the dock doors' })
        .commit()
      await client.createIfNotExists({
        _id: 'siteSettings',
        _type: 'siteSettings',
        title: 'Conduit',
        description:
          'Schedule dock appointments, cut wait times and keep carriers in the loop — in one place.',
        // Pas de favicon : le site n'en a aucun fichier aujourd'hui (à fournir par le client).
        socialImage: { _type: 'image', asset: { _type: 'reference', _ref: asset._id } },
        allowIndexing: true,
        scripts: [],
      })
    }
  }

  if (existing.has('blogPage')) {
    // Première version de la migration : textes à la racine → objet `content` (une section = un champ).
    const blog = await client.fetch<{ title?: string; emptyText?: string; hasOld: boolean } | null>(
      `*[_id == "blogPage"][0]{ title, emptyText, "hasOld": defined(title) || defined(emptyText) }`,
      {},
      { perspective: 'raw' },
    )
    if (blog?.hasOld) {
      log('blogPage : title / emptyText → content')
      if (!dryRun) {
        await client
          .patch('blogPage')
          .setIfMissing({ content: { title: blog.title, emptyText: blog.emptyText } })
          .unset(['title', 'emptyText'])
          .commit()
      }
    } else log('blogPage : existe, inchangé')
  } else {
    log('blogPage : création (textes de /blog d’avant l’admin)')
    if (!dryRun) {
      await client.createIfNotExists({
        _id: 'blogPage',
        _type: 'blogPage',
        content: { title: 'Blog', emptyText: 'No articles published yet.' },
        seo: { _type: 'seo', allowIndexing: true },
      })
    }
  }

  if (existing.has('articleSeo-post')) log('articleSeo-post : existe, inchangé')
  else {
    log('articleSeo-post : création (modèle {{title}} / {{excerpt}} / cover)')
    if (!dryRun) {
      await client.createIfNotExists({
        _id: 'articleSeo-post',
        _type: 'articleSeoTemplate',
        collection: 'post',
        metaTitle: '{{title}}',
        metaDescription: '{{excerpt}}',
        ogImageField: 'cover',
        allowIndexing: true,
      })
    }
  }

  await ensureListingPages(existing)
}

/** Pages listing /testimonials et /faq et modèles SEO de leurs pages article (question 15 révisée). */
async function ensureListingPages(existing: Set<string>) {
  const pages = [
    { _id: 'testimonialsPage', defaults: TESTIMONIALS_PAGE_DEFAULTS },
    { _id: 'faqPage', defaults: FAQ_PAGE_DEFAULTS },
  ]
  for (const { _id, defaults } of pages) {
    if (existing.has(_id)) {
      log(`${_id} : existe, inchangé`)
      continue
    }
    log(`${_id} : création (textes par défaut du site)`)
    if (!dryRun) {
      await client.createIfNotExists({
        _id,
        _type: _id,
        content: { ...defaults },
        seo: { _type: 'seo', allowIndexing: true },
      })
    }
  }
  // Mêmes valeurs que DEFAULT_TESTIMONIAL_TEMPLATE et DEFAULT_FAQ_TEMPLATE (src/lib/seo.ts).
  const templates = [
    { _id: 'articleSeo-testimonial', collection: 'testimonial', metaTitle: 'Testimonial from {{name}}, {{company}}', metaDescription: '{{quote}}' },
    { _id: 'articleSeo-faq', collection: 'faq', metaTitle: '{{question}}', metaDescription: '{{answer}}' },
  ]
  for (const template of templates) {
    if (existing.has(template._id)) {
      log(`${template._id} : existe, inchangé`)
      continue
    }
    log(`${template._id} : création (modèle ${template.metaTitle} / ${template.metaDescription})`)
    if (!dryRun) await client.createIfNotExists({ _type: 'articleSeoTemplate', ...template, allowIndexing: true })
  }
}

// ─── 8. Slugs des témoignages et des questions ────────────────────────────────────────────

/** Texte d'où vient le slug (Studio : `options.source` du champ, même règle). */
const SLUG_SOURCE: Record<string, (doc: Record<string, unknown>) => string> = {
  testimonial: (doc) => [doc.name, doc.company].filter((part) => typeof part === 'string' && part).join(' '),
  faq: (doc) => (typeof doc.question === 'string' ? doc.question : ''),
}

async function ensureSlugs(type: string) {
  const docs = await client.fetch<{ _id: string; slug?: { current?: string }; [key: string]: unknown }[]>(
    `*[_type == $type] | order(_createdAt asc){ _id, slug, name, company, question }`,
    { type },
    { perspective: 'raw' },
  )
  // Un slug par document publié : celui du publié, sinon celui du brouillon, sinon un nouveau.
  const slugOf = new Map<string, string>()
  const byId = new Map(docs.map((doc) => [doc._id, doc]))
  for (const doc of docs) {
    const current = doc.slug?.current
    const id = publishedId(doc._id)
    if (current && (!slugOf.has(id) || doc._id === id)) slugOf.set(id, current)
  }
  const taken = new Set(slugOf.values())
  const ids = [...new Set(docs.map((doc) => publishedId(doc._id)))]
  let created = 0
  for (const id of ids) {
    if (slugOf.has(id)) continue
    const source = byId.get(`drafts.${id}`) ?? byId.get(id)!
    const slug = uniqueSlug(slugify(SLUG_SOURCE[type](source)), taken)
    taken.add(slug)
    slugOf.set(id, slug)
    created++
  }

  const transaction = client.transaction()
  let writes = 0
  for (const doc of docs) {
    const slug = slugOf.get(publishedId(doc._id))
    if (!slug || doc.slug?.current === slug) continue
    // Le publié et son brouillon reçoivent la même valeur (un slug existant n'est jamais remplacé).
    if (doc.slug?.current) continue
    transaction.patch(doc._id, (patch) => patch.set({ slug: { _type: 'slug', current: slug } }))
    writes++
  }
  log(`slug ${type} : ${created} slug(s) créé(s), ${writes} document(s) à compléter (${ids.length} élément(s))`)
  if (writes && !dryRun) await transaction.commit()
}

// ─── 7. Signature des scripts d'exemple (SEC-04) ─────────────────────────────────────────

async function signDemoScripts() {
  const secret = process.env.SCRIPTS_SIGNING_SECRET
  if (!secret || secret.length < 32) {
    log('scripts : SCRIPTS_SIGNING_SECRET absent ou trop court — signature des scripts d’exemple sautée')
    return
  }
  const documents = await client.fetch<{ _id: string; scripts?: { _key: string }[] }[]>(
    `*[_id in ["siteSettings", "drafts.siteSettings"]]{ _id, scripts }`,
    {},
    { perspective: 'raw' },
  )
  const plan = await planDemoScriptSignatures(documents, secret)
  log(`scripts : ${plan.length} script(s) d'exemple à signer`)
  if (dryRun) return
  for (const item of plan) {
    await client
      .patch(item.documentId)
      .set({ [`scripts[_key=="${item.key}"].signature`]: item.signature })
      .commit()
  }
}

async function main() {
  const dataset = assertNotProduction(client)
  log(`Migration admin → dataset ${dataset}${demo ? ' (+ démo)' : ''}`)
  await migratePageSeo()
  for (const type of Object.keys(CURRENT_ORDER)) await migrateOrderRank(type)
  await ensureSingletons()
  if (demo) await runDemo(client, { dryRun, log })
  for (const type of Object.keys(SLUG_SOURCE)) await ensureSlugs(type)
  await signDemoScripts()
  log('Terminé.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
