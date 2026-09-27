import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'vitest'
import { catalogFromTypes, describeDraft, FALLBACK_TYPES, humanize, joinLabels, loadAdminConfig, type Catalog } from './catalog'
import { conduitCatalog, ROOT } from './testing'

/** Chemins lisibles et résumés de E1 sur le VRAI manifeste de Conduit (src/admin.config.ts). */

const home = (hero: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  _id: 'dockSchedulingPage',
  _type: 'dockSchedulingPage',
  _rev: 'r1',
  _updatedAt: '2026-09-27T10:00:00Z',
  hero: { title: 'Dock scheduling that just works', lede: 'Book every dock.', ...hero },
  features: { title: 'Features', items: [{ _key: 'a', title: 'One', text: 'First' }] },
  ...extra,
})

const post = (fields: Record<string, unknown> = {}) => ({
  _id: 'post-carrier',
  _type: 'post',
  title: 'Carrier portals: a checklist',
  slug: { _type: 'slug', current: 'carrier-portals' },
  excerpt: 'Short.',
  content: [{ _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: 'Body.' }] }],
  ...fields,
})

async function catalog(): Promise<Catalog> {
  return conduitCatalog()
}

describe('describeDraft (manifeste de Conduit)', () => {
  it('un texte de section : « Home › Hero · Title » et la nouvelle valeur', async () => {
    const entry = (await catalog()).resolve('dockSchedulingPage', 'dockSchedulingPage')!
    const out = describeDraft(entry, home({ title: 'Dock scheduling, solved.' }), home({}))
    assert.deepEqual(out, { path: 'Home › Hero · Title', summary: '“Dock scheduling, solved.”', viewPath: '/' })
  })

  it('deux champs d’une section : chemin de la section, « Title and subtitle edited »', async () => {
    const entry = (await catalog()).resolve('dockSchedulingPage', 'dockSchedulingPage')!
    const out = describeDraft(entry, home({ title: 'New', lede: 'New lede' }), home({}))
    assert.deepEqual(out, { path: 'Home › Hero', summary: 'Title and subtitle edited', viewPath: '/' })
  })

  it('deux sections : chemin de la page, sections nommées', async () => {
    const entry = (await catalog()).resolve('dockSchedulingPage', 'dockSchedulingPage')!
    const draft = home({ title: 'New' }, { features: { title: 'Features', items: [{ _key: 'a', title: 'Two', text: 'First' }] } })
    const out = describeDraft(entry, draft, home({}))
    assert.equal(out?.path, 'Home')
    assert.equal(out?.summary, 'Hero and features edited')
  })

  it('un texte dans un tableau (_key) : la nouvelle valeur ; le SEO a ses libellés', async () => {
    const entry = (await catalog()).resolve('dockSchedulingPage', 'dockSchedulingPage')!
    const card = describeDraft(entry, home({}, { features: { title: 'Features', items: [{ _key: 'a', title: 'Faster', text: 'First' }] } }), home({}))
    assert.deepEqual([card?.path, card?.summary], ['Home › Features · Cards', '“Faster”'])
    const seo = describeDraft(entry, home({}, { seo: { metaTitle: 'Conduit — docks' } }), home({}, { seo: { metaTitle: 'Conduit' } }))
    assert.deepEqual([seo?.path, seo?.summary], ['Home › SEO · Meta title', '“Conduit — docks”'])
  })

  it('article : « Blog › <titre> », « Excerpt and body edited », page publique de l’article', async () => {
    const entry = (await catalog()).resolve('post', 'post-carrier')!
    const draft = post({ excerpt: 'Longer.', content: [{ _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: 'Body 2.' }] }] })
    assert.deepEqual(describeDraft(entry, draft, post()), {
      path: 'Blog › Carrier portals: a checklist',
      summary: 'Excerpt and body edited',
      viewPath: '/blog/carrier-portals',
    })
    // Corps seul (Portable Text) : jamais un morceau de span présenté comme « nouvelle valeur ».
    const body = describeDraft(entry, post({ content: [{ _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: 'X' }] }] }), post())
    assert.equal(body?.summary, 'Body edited')
    assert.equal(describeDraft(entry, post(), null)?.summary, 'New post')
  })

  it('brouillon identique au publié (dates et révision mises à part) : rien à publier (piège 10)', async () => {
    const entry = (await catalog()).resolve('post', 'post-carrier')!
    assert.equal(describeDraft(entry, { ...post(), _rev: 'x', _updatedAt: '2026-09-28T00:00:00Z' }, post()), null)
  })

  it('réglages, modèle SEO, types non gérés', async () => {
    const cat = await catalog()
    const settings = cat.resolve('siteSettings', 'siteSettings')!
    const base = { _id: 'siteSettings', _type: 'siteSettings', title: 'Conduit', scripts: [] as unknown[] }
    assert.deepEqual(describeDraft(settings, { ...base, title: 'Conduit Inc.' }, base), {
      path: 'Settings › General · Site title',
      summary: '“Conduit Inc.”',
      viewPath: '/',
    })
    assert.equal(describeDraft(settings, { ...base, scripts: [{ _key: 'k', name: 'GA' }] }, base)?.path, 'Settings › Code · Scripts')
    const template = cat.resolve('articleSeoTemplate', 'articleSeo-post')!
    const tpl = { _id: 'articleSeo-post', _type: 'articleSeoTemplate', metaTitle: '{{title}}' }
    assert.deepEqual(describeDraft(template, { ...tpl, metaTitle: '{{title}} | Conduit' }, tpl), {
      path: 'Blog › Article SEO · Meta title',
      summary: '“{{title}} | Conduit”',
    })
    assert.equal(cat.resolve('aiUsage', 'aiUsage.job_1'), null)
    assert.equal(cat.resolve('sanity.imageAsset', 'image-1'), null)
    assert.equal(cat.domain, 'conduit.com')
  })
})

describe('catalogue de repli et formats', () => {
  it('sans manifeste : types configurables, titre du document', () => {
    const cat = catalogFromTypes(FALLBACK_TYPES)
    const entry = cat.resolve('faq', 'faq-1')!
    const out = describeDraft(entry, { _id: 'faq-1', _type: 'faq', question: 'Why?', answer: 'b' }, { _id: 'faq-1', _type: 'faq', question: 'Why?', answer: 'a' })
    assert.deepEqual(out, { path: 'FAQ › Why? · Answer', summary: '“b”' })
    assert.equal(cat.resolve('aiUsage', 'x'), null)
  })

  it('libellés', () => {
    assert.equal(humanize('orderRank'), 'Order rank')
    assert.equal(joinLabels(['Body', 'Excerpt']), 'Body and excerpt')
    assert.equal(joinLabels(['Title', 'SEO', 'Slug']), 'Title, SEO and slug')
    assert.equal(joinLabels(['A', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff']), 'A, bb, cc and 3 more')
  })

  it('loadAdminConfig : chemin relatif ou absent → null', async () => {
    assert.equal(await loadAdminConfig('src/admin.config.ts'), null)
    assert.equal(await loadAdminConfig(path.join(ROOT, 'nope/admin.config.ts')), null)
  })
})
