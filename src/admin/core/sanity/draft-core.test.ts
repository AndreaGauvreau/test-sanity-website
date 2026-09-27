import { describe, expect, it } from 'vitest'

import type { FieldDef } from '@/admin/core/contracts/manifest'

import { applyDraftPatch, createDraftWith, deleteDraftWith, getDocumentStateWith, stripSystemFields } from './draft-core'
import type { DraftMutation, DraftStore, SanityDoc } from './store'

/** Faux client Sanity : documents en mémoire, mutations enregistrées. */
function fakeStore(docs: SanityDoc[] = []) {
  const byId = new Map(docs.map((d) => [d._id, d]))
  const mutations: DraftMutation[][] = []
  const store: DraftStore = {
    async getDocuments(ids) {
      return ids.map((id) => byId.get(id) ?? null)
    },
    async mutate(m) {
      mutations.push(m)
    },
  }
  return { store, mutations }
}

const published: SanityDoc = {
  _id: 'home',
  _type: 'dockSchedulingPage',
  _rev: 'r1',
  _createdAt: '2026-01-01',
  _updatedAt: '2026-01-02',
  hero: { title: 'Dock scheduling' },
  features: { items: [{ _key: 'a1', title: 'Fast' }] },
}

const titleField: FieldDef = { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 20 }

describe('getDocumentStateWith', () => {
  it('value = brouillon s’il existe, sinon publié', async () => {
    const draft = { ...published, _id: 'drafts.home', hero: { title: 'Draft' } }
    expect((await getDocumentStateWith(fakeStore([published, draft]).store, 'home')).value?._id).toBe('drafts.home')
    const onlyPublished = await getDocumentStateWith(fakeStore([published]).store, 'home')
    expect(onlyPublished).toMatchObject({ draft: null, value: { _id: 'home' } })
    expect(await getDocumentStateWith(fakeStore().store, 'home')).toEqual({ published: null, draft: null, value: null })
  })
  it('refuse un id de brouillon', async () => {
    await expect(getDocumentStateWith(fakeStore().store, 'drafts.home')).rejects.toMatchObject({ code: 'bad_request' })
  })
})

describe('applyDraftPatch', () => {
  it('crée drafts.<id> depuis le publié (sans champs système) puis patch, en UNE transaction', async () => {
    const { store, mutations } = fakeStore([published])
    await applyDraftPatch(store, 'home', { set: { 'hero.title': 'New title' } }, { 'hero.title': titleField })
    expect(mutations).toHaveLength(1)
    const [create, patch] = mutations[0]
    expect(create).toEqual({
      createIfNotExists: { _id: 'drafts.home', _type: 'dockSchedulingPage', hero: { title: 'Dock scheduling' }, features: { items: [{ _key: 'a1', title: 'Fast' }] } },
    })
    expect(patch).toEqual({ patch: { id: 'drafts.home', set: { 'hero.title': 'New title' } } })
  })
  it('brouillon existant : patch seul', async () => {
    const { store, mutations } = fakeStore([published, { ...published, _id: 'drafts.home' }])
    await applyDraftPatch(store, 'home', { set: { 'features.items[_key=="a1"].title': 'Faster' } })
    expect(mutations[0]).toEqual([{ patch: { id: 'drafts.home', set: { 'features.items[_key=="a1"].title': 'Faster' } } }])
  })
  it('null → unset', async () => {
    const { store, mutations } = fakeStore([published])
    await applyDraftPatch(store, 'home', { set: { 'hero.subtitle': null } })
    expect(mutations[0][1]).toEqual({ patch: { id: 'drafts.home', unset: ['hero.subtitle'] } })
  })
  it('valide d’après le FieldDef avant toute écriture', async () => {
    const { store, mutations } = fakeStore([published])
    await expect(applyDraftPatch(store, 'home', { set: { 'hero.title': 'x'.repeat(21) } }, { 'hero.title': titleField })).rejects.toMatchObject({
      code: 'validation',
      message: 'Title must be 20 characters or fewer.',
      details: { 'hero.title': 'Title must be 20 characters or fewer.' },
    })
    await expect(applyDraftPatch(store, 'home', { unset: ['hero.title'] }, { 'hero.title': titleField })).rejects.toMatchObject({ code: 'validation' })
    expect(mutations).toHaveLength(0)
  })
  it('refuse chemins invalides, patch vide, document absent, élément _key disparu', async () => {
    const { store, mutations } = fakeStore([published])
    await expect(applyDraftPatch(store, 'home', { set: { _id: 'x' } })).rejects.toMatchObject({ code: 'bad_request' })
    await expect(applyDraftPatch(store, 'home', { set: { 'items[0].title': 'x' } })).rejects.toMatchObject({ code: 'bad_request' })
    await expect(applyDraftPatch(store, 'home', {})).rejects.toMatchObject({ code: 'bad_request', message: 'Nothing to save.' })
    await expect(applyDraftPatch(store, 'nope', { set: { title: 'x' } })).rejects.toMatchObject({ code: 'not_found' })
    await expect(applyDraftPatch(store, 'home', { set: { 'features.items[_key=="gone"].title': 'x' } })).rejects.toMatchObject({ code: 'not_found' })
    expect(mutations).toHaveLength(0)
  })
})

describe('createDraftWith / deleteDraftWith', () => {
  it('crée un brouillon de collection et retourne l’id publié', async () => {
    const { store, mutations } = fakeStore()
    const res = await createDraftWith(store, 'post', { title: 'Hello' }, { id: 'post-1', fields: { title: titleField } })
    expect(res).toEqual({ id: 'post-1', draftId: 'drafts.post-1' })
    expect(mutations[0]).toEqual([{ create: { title: 'Hello', _id: 'drafts.post-1', _type: 'post' } }])
  })
  it('id généré (uuid) par défaut', async () => {
    const { store } = fakeStore()
    const res = await createDraftWith(store, 'post', {})
    expect(res.id).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('refuse type système, nom de champ système, valeur invalide', async () => {
    const { store } = fakeStore()
    await expect(createDraftWith(store, 'sanity.imageAsset', {})).rejects.toMatchObject({ code: 'bad_request' })
    await expect(createDraftWith(store, 'post', { _id: 'x' })).rejects.toMatchObject({ code: 'bad_request' })
    await expect(createDraftWith(store, 'post', {}, { fields: { title: titleField } })).rejects.toMatchObject({ code: 'validation' })
  })
  it('supprime le brouillon seulement', async () => {
    const { store, mutations } = fakeStore()
    expect(await deleteDraftWith(store, 'post-1')).toEqual({ draftId: 'drafts.post-1' })
    expect(mutations[0]).toEqual([{ delete: { id: 'drafts.post-1' } }])
  })
})

describe('stripSystemFields', () => {
  it('retire _id, _rev, dates, garde _type', () => {
    expect(stripSystemFields(published)).not.toHaveProperty('_rev')
    expect(stripSystemFields(published)).toHaveProperty('_type', 'dockSchedulingPage')
  })
})
