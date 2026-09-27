import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { Session } from '@/admin/core/contracts'
import type { DraftMutation, DraftStore, SanityDoc } from '@/admin/core/sanity/store'

const { saveArticleSeo, savePageField, savePageSeo } = await import('./save')

/**
 * Cœur des écritures avec un FAUX magasin Sanity (en mémoire) : aucun réseau. Vérifie la liste blanche du
 * manifeste, la validation d'après le FieldDef et les mutations envoyées (brouillon créé depuis le publié + patch).
 */

const session: Session = {
  user: { id: 'u1', name: 'Marie', email: 'm@c.com' },
  role: 'client',
  sanityRoles: ['administrator'],
  sanityToken: 'token',
  dev: false,
  expiresAt: '2099-01-01T00:00:00.000Z',
}

function fakeStore(docs: Record<string, SanityDoc>) {
  const mutations: DraftMutation[][] = []
  const store: DraftStore = {
    async getDocuments(ids) {
      return ids.map((id) => docs[id] ?? null)
    },
    async mutate(batch) {
      mutations.push(batch)
      for (const m of batch) {
        if ('create' in m) docs[m.create._id] = m.create
        if ('createIfNotExists' in m && !docs[m.createIfNotExists._id]) docs[m.createIfNotExists._id] = m.createIfNotExists
      }
    },
  }
  return { store, mutations }
}

const home = (): SanityDoc => ({
  _id: 'dockSchedulingPage',
  _type: 'dockSchedulingPage',
  _rev: 'r1',
  hero: { title: 'Dock', ratings: [{ _key: 'g2', _type: 'rating', platform: 'g2', label: '4.7 stars on G2' }] },
  features: { items: [{ _key: 'a', title: 'A', text: 'x' }] },
  seo: { metaTitle: 'Dock' },
})

let fake: ReturnType<typeof fakeStore>
beforeEach(() => {
  fake = fakeStore({ dockSchedulingPage: home() })
})

describe('savePageField (C1)', () => {
  it('écrit un champ du manifeste dans le brouillon créé depuis le publié', async () => {
    const result = await savePageField(session, { pageId: 'home', path: 'hero.title', value: 'Dock scheduling, solved.' }, { store: fake.store })
    expect(result).toEqual({ ok: true })
    const [batch] = fake.mutations
    expect(batch[0]).toMatchObject({ createIfNotExists: { _id: 'drafts.dockSchedulingPage', _type: 'dockSchedulingPage' } })
    expect(batch[0]).not.toHaveProperty('createIfNotExists._rev')
    expect(batch[1]).toEqual({ patch: { id: 'drafts.dockSchedulingPage', set: { 'hero.title': 'Dock scheduling, solved.' } } })
  })

  it('sous-champ d’un élément par sa clé ; chaîne vide = retrait (champ facultatif)', async () => {
    expect(await savePageField(session, { pageId: 'home', path: 'features.items[_key=="a"].title', value: 'Book' }, { store: fake.store })).toEqual({ ok: true })
    expect(await savePageField(session, { pageId: 'home', path: 'hero.primaryCta.href', value: '' }, { store: fake.store })).toEqual({ ok: true })
    expect(fake.mutations[1].at(-1)).toEqual({ patch: { id: 'drafts.dockSchedulingPage', unset: ['hero.primaryCta.href'] } })
  })

  it('validation du FieldDef : longueur, obligation, lien sûr, liste fermée, bornes du tableau', async () => {
    const cases: [string, unknown, string][] = [
      ['hero.title', 'x'.repeat(71), 'Title must be 70 characters or fewer.'],
      ['hero.title', '', 'Title is required.'],
      ['hero.primaryCta.href', 'javascript:alert(1)', 'Link must be a valid link (https://…, /page, mailto:…).'],
      ['hero.ratings', [{ _key: 'a', platform: 'nope', label: 'x' }], 'Ratings 1 · Platform must be one of the proposed options.'],
      ['hero.ratings', [1, 2, 3].map((i) => ({ _key: `k${i}`, platform: 'g2', label: 'x' })), 'Ratings can have at most 2 ratings.'],
      ['hero.title', 'two\nlines', 'Title must be a single line.'],
    ]
    for (const [path, value, error] of cases) {
      expect(await savePageField(session, { pageId: 'home', path, value }, { store: fake.store }), path).toEqual({ ok: false, error })
    }
    expect(fake.mutations).toHaveLength(0)
  })

  it('refuse ce que le manifeste ne déclare pas (liste blanche) et les entrées mal formées', async () => {
    for (const input of [
      { pageId: 'home', path: 'seo.metaTitle', value: 'x' },
      { pageId: 'home', path: 'hero._id', value: 'x' },
      { pageId: 'home', path: 'hero.ratings[0].label', value: 'x' },
      { pageId: 'nope', path: 'hero.title', value: 'x' },
      { pageId: 'home', path: 'hero.title', value: 'x', extra: true },
      { pageId: 'home', path: 'hero.title', value: 'x'.repeat(40_000) },
      'garbage',
    ]) {
      const result = await savePageField(session, input, { store: fake.store })
      expect(result.ok, JSON.stringify(input).slice(0, 60)).toBe(false)
    }
    expect(fake.mutations).toHaveLength(0)
  })

  it('élément de tableau disparu : message clair, rien d’écrit', async () => {
    const result = await savePageField(session, { pageId: 'home', path: 'features.items[_key=="gone"].title', value: 'x' }, { store: fake.store })
    expect(result).toEqual({ ok: false, error: 'This item no longer exists. Reload and try again.' })
  })

  it('référence : objet reference vers un id publié', async () => {
    expect(await savePageField(session, { pageId: 'home', path: 'testimonial.item', value: { _type: 'reference', _ref: 't1' } }, { store: fake.store })).toEqual({ ok: true })
    expect(await savePageField(session, { pageId: 'home', path: 'testimonial.item', value: { _type: 'reference', _ref: 'drafts.t1' } }, { store: fake.store })).toMatchObject({ ok: false })
  })

  it('sans le droit content.write (rôle inconnu du contrat) : refus', async () => {
    const result = await savePageField({ ...session, role: 'viewer' as never }, { pageId: 'home', path: 'hero.title', value: 'x' }, { store: fake.store })
    expect(result.ok).toBe(false)
  })
})

describe('savePageSeo (C2)', () => {
  it('meta title au chemin déclaré, compteur indicatif (pas de blocage à 61)', async () => {
    expect(await savePageSeo(session, { pageId: 'home', key: 'metaTitle', value: 'x'.repeat(61) }, { store: fake.store })).toEqual({ ok: true })
    expect(fake.mutations[0].at(-1)).toEqual({ patch: { id: 'drafts.dockSchedulingPage', set: { 'seo.metaTitle': 'x'.repeat(61) } } })
  })

  it('plafond de sécurité, description sur une ligne, indexation booléenne', async () => {
    expect((await savePageSeo(session, { pageId: 'home', key: 'metaTitle', value: 'x'.repeat(201) }, { store: fake.store })).ok).toBe(false)
    expect((await savePageSeo(session, { pageId: 'home', key: 'metaDescription', value: 'a\nb' }, { store: fake.store })).ok).toBe(false)
    expect(await savePageSeo(session, { pageId: 'home', key: 'allowIndexing', value: false }, { store: fake.store })).toEqual({ ok: true })
    expect((await savePageSeo(session, { pageId: 'home', key: 'allowIndexing', value: 'no' }, { store: fake.store })).ok).toBe(false)
    expect((await savePageSeo(session, { pageId: 'home', key: 'seo', value: 'x' }, { store: fake.store })).ok).toBe(false)
  })

  it('image OG : id d’asset → objet image ; autre chose refusé ; null retire', async () => {
    expect(await savePageSeo(session, { pageId: 'home', key: 'ogImage', value: 'image-abc123def456-1200x630-png' }, { store: fake.store })).toEqual({ ok: true })
    expect(fake.mutations[0].at(-1)).toEqual({
      patch: {
        id: 'drafts.dockSchedulingPage',
        set: { 'seo.ogImage': { _type: 'image', asset: { _type: 'reference', _ref: 'image-abc123def456-1200x630-png' } } },
      },
    })
    expect((await savePageSeo(session, { pageId: 'home', key: 'ogImage', value: 'https://evil/x.png' }, { store: fake.store })).ok).toBe(false)
    expect(await savePageSeo(session, { pageId: 'home', key: 'ogImage', value: null }, { store: fake.store })).toEqual({ ok: true })
    expect(fake.mutations.at(-1)!.at(-1)).toEqual({ patch: { id: 'drafts.dockSchedulingPage', unset: ['seo.ogImage'] } })
  })
})

describe('saveArticleSeo (C6)', () => {
  it('variables connues acceptées, inconnues refusées', async () => {
    const f = fakeStore({ 'articleSeo-post': { _id: 'articleSeo-post', _type: 'articleSeoTemplate', collection: 'post' } })
    expect(await saveArticleSeo(session, { pageId: 'blog', key: 'metaTitle', value: '{{title}} | Conduit Blog' }, { store: f.store })).toEqual({ ok: true })
    expect(f.mutations[0].at(-1)).toEqual({ patch: { id: 'drafts.articleSeo-post', set: { metaTitle: '{{title}} | Conduit Blog' } } })
    expect(await saveArticleSeo(session, { pageId: 'blog', key: 'metaTitle', value: '{{nope}}' }, { store: f.store })).toEqual({
      ok: false,
      error: 'Unknown field {{nope}}. Insert a field from the list.',
    })
    expect(await saveArticleSeo(session, { pageId: 'blog', key: 'ogImageField', value: 'title' }, { store: f.store })).toMatchObject({ ok: false })
    expect(await saveArticleSeo(session, { pageId: 'blog', key: 'ogImageField', value: null }, { store: f.store })).toEqual({ ok: true })
    expect(await saveArticleSeo(session, { pageId: 'home', key: 'metaTitle', value: 'x' }, { store: f.store })).toMatchObject({ ok: false })
  })

  it('modèle absent : brouillon créé avec les valeurs par défaut du site, puis le champ', async () => {
    const f = fakeStore({})
    expect(await saveArticleSeo(session, { pageId: 'blog', key: 'allowIndexing', value: false }, { store: f.store })).toEqual({ ok: true })
    expect(f.mutations[0]).toEqual([
      {
        create: {
          collection: 'post',
          metaTitle: '{{title}}',
          metaDescription: '{{excerpt}}',
          ogImageField: 'cover',
          allowIndexing: true,
          _id: 'drafts.articleSeo-post',
          _type: 'articleSeoTemplate',
        },
      },
    ])
    expect(f.mutations[1].at(-1)).toEqual({ patch: { id: 'drafts.articleSeo-post', set: { allowIndexing: false } } })
  })
})
