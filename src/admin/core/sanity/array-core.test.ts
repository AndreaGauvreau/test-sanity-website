import { describe, expect, it } from 'vitest'

import type { FieldDef } from '@/admin/core/contracts/manifest'

import { insertItem, moveItem, updateDraftArrayWith, type ArrayItem } from './array-core'
import { getValueAtPath, SanityWriteError } from './paths'
import type { DraftMutation, DraftStore, SanityDoc } from './store'

/**
 * Faux Sanity avec révisions : `patch.ifRevisionID` différent de la révision actuelle → 409, `create` d'un id
 * existant → 409 (comme l'API de mutation). `onBeforeMutate` simule un autre utilisateur qui écrit entre la
 * lecture et l'écriture.
 */
function revStore(docs: SanityDoc[]) {
  const byId = new Map(docs.map((d) => [d._id, structuredClone(d)]))
  let rev = 1
  const writes: DraftMutation[][] = []
  const hooks: { onBeforeMutate?: () => void } = {}
  const conflict = () => new SanityWriteError('bad_request', 'This item was changed at the same time. Reload and try again.', undefined, 409)
  const store: DraftStore = {
    async getDocuments(ids) {
      return ids.map((id) => (byId.has(id) ? structuredClone(byId.get(id)!) : null))
    },
    async mutate(mutations) {
      hooks.onBeforeMutate?.()
      hooks.onBeforeMutate = undefined
      const staged = new Map([...byId].map(([k, v]) => [k, structuredClone(v)]))
      for (const m of mutations) {
        if ('create' in m) {
          if (staged.has(m.create._id)) throw conflict()
          staged.set(m.create._id, { ...m.create, _rev: `r${++rev}` })
        } else if ('patch' in m) {
          const doc = staged.get(m.patch.id)
          if (!doc) throw new SanityWriteError('not_found', 'missing', undefined, 404)
          if (m.patch.ifRevisionID && m.patch.ifRevisionID !== doc._rev) throw conflict()
          for (const [path, value] of Object.entries(m.patch.set ?? {})) (doc as Record<string, unknown>)[path] = value
          doc._rev = `r${++rev}`
        }
      }
      writes.push(mutations)
      byId.clear()
      for (const [k, v] of staged) byId.set(k, v)
    },
  }
  /** Écriture concurrente d'un autre utilisateur (nouvelle révision). */
  const concurrentWrite = (id: string, field: string, value: unknown) => {
    const doc = byId.get(id)
    if (doc) {
      ;(doc as Record<string, unknown>)[field] = value
      doc._rev = `r${++rev}`
    } else {
      byId.set(id, { ...structuredClone(byId.get(id.replace(/^drafts\./, ''))!), _id: id, [field]: value, _rev: `r${++rev}` })
    }
  }
  return { store, byId, writes, hooks, concurrentWrite }
}

const a: ArrayItem = { _key: 'a', name: 'A' }
const b: ArrayItem = { _key: 'b', name: 'B' }
const c: ArrayItem = { _key: 'c', name: 'C' }
const published: SanityDoc = { _id: 'siteSettings', _type: 'siteSettings', _rev: 'p1', _createdAt: 'x', scripts: [a, b] }
const keys = (items: unknown) => (items as ArrayItem[]).map((i) => i._key)

describe('insertItem / moveItem (pur)', () => {
  it('insère au début, à la fin, avant, après ; clé générée et unique', () => {
    expect(keys(insertItem([a, b], c))).toEqual(['a', 'b', 'c'])
    expect(keys(insertItem([a, b], c, 'start'))).toEqual(['c', 'a', 'b'])
    expect(keys(insertItem([a, b], c, { before: 'b' }))).toEqual(['a', 'c', 'b'])
    expect(keys(insertItem([a, b], c, { after: 'a' }))).toEqual(['a', 'c', 'b'])
    const generated = insertItem([a], { name: 'new' })[1]
    expect(generated._key).toMatch(/^[0-9a-f]{12}$/)
    expect(() => insertItem([a], { _key: 'a' })).toThrow(/same key/)
    expect(() => insertItem([a], c, { before: 'zz' })).toThrow(SanityWriteError)
  })
  it('déplace : haut, bas, premier, dernier, avant, après, index ; bornes refusées', () => {
    expect(keys(moveItem([a, b, c], 'c', 'up'))).toEqual(['a', 'c', 'b'])
    expect(keys(moveItem([a, b, c], 'a', 'down'))).toEqual(['b', 'a', 'c'])
    expect(keys(moveItem([a, b, c], 'c', 'first'))).toEqual(['c', 'a', 'b'])
    expect(keys(moveItem([a, b, c], 'a', 'last'))).toEqual(['b', 'c', 'a'])
    expect(keys(moveItem([a, b, c], 'c', { before: 'a' }))).toEqual(['c', 'a', 'b'])
    expect(keys(moveItem([a, b, c], 'a', { after: 'c' }))).toEqual(['b', 'c', 'a'])
    expect(keys(moveItem([a, b, c], 'a', { index: 1 }))).toEqual(['b', 'a', 'c'])
    expect(() => moveItem([a, b], 'a', 'up')).toThrow(/already first/)
    expect(() => moveItem([a, b], 'b', 'down')).toThrow(/already last/)
    expect(() => moveItem([a, b], 'zz', 'up')).toThrow(/no longer exists/)
  })
})

describe('updateDraftArrayWith', () => {
  it('pas de brouillon : create (pas createIfNotExists) puis patch, champs système retirés', async () => {
    const { store, writes, byId } = revStore([published])
    const res = await updateDraftArrayWith(store, 'siteSettings', 'scripts', (items) => insertItem(items, c))
    expect(keys(res.items)).toEqual(['a', 'b', 'c'])
    expect(writes[0][0]).toMatchObject({ create: { _id: 'drafts.siteSettings', _type: 'siteSettings' } })
    expect('_rev' in (writes[0][0] as { create: SanityDoc }).create).toBe(false)
    expect(keys(byId.get('drafts.siteSettings')!.scripts)).toEqual(['a', 'b', 'c'])
  })
  it('brouillon existant : patch conditionné par la révision lue (ifRevisionID)', async () => {
    const draft = { ...published, _id: 'drafts.siteSettings', _rev: 'd7', scripts: [a, b, c] }
    const { store, writes } = revStore([published, draft])
    await updateDraftArrayWith(store, 'siteSettings', 'scripts', (items) => moveItem(items, 'c', 'first'))
    expect(writes[0]).toEqual([{ patch: { id: 'drafts.siteSettings', set: { scripts: [c, a, b] }, ifRevisionID: 'd7' } }])
  })
  it('régression #20 : un ajout concurrent n’est PLUS effacé (409 → relecture → réapplication)', async () => {
    const draft = { ...published, _id: 'drafts.siteSettings', _rev: 'd1', scripts: [a, b] }
    const { store, hooks, concurrentWrite, byId, writes } = revStore([published, draft])
    // Un autre onglet ajoute « c » entre notre lecture et notre écriture.
    hooks.onBeforeMutate = () => concurrentWrite('drafts.siteSettings', 'scripts', [a, b, c])
    await updateDraftArrayWith(store, 'siteSettings', 'scripts', (items) => insertItem(items, { _key: 'd', name: 'D' }))
    expect(keys(byId.get('drafts.siteSettings')!.scripts)).toEqual(['a', 'b', 'c', 'd'])
    expect(writes).toHaveLength(1)
  })
  it('brouillon né entre la lecture et l’écriture : create refusé (409), relecture, patch sur le sien', async () => {
    const { store, hooks, concurrentWrite, byId } = revStore([published])
    hooks.onBeforeMutate = () => concurrentWrite('drafts.siteSettings', 'scripts', [a, b, c])
    await updateDraftArrayWith(store, 'siteSettings', 'scripts', (items) => moveItem(items, 'b', 'first'))
    expect(keys(byId.get('drafts.siteSettings')!.scripts)).toEqual(['b', 'a', 'c'])
  })
  it('conflit persistant → erreur « changed at the same time » après les essais', async () => {
    const draft = { ...published, _id: 'drafts.siteSettings', _rev: 'd1' }
    const base = revStore([published, draft])
    const store: DraftStore = {
      getDocuments: base.store.getDocuments,
      async mutate() {
        throw new SanityWriteError('bad_request', 'This item was changed at the same time. Reload and try again.', undefined, 409)
      },
    }
    await expect(updateDraftArrayWith(store, 'siteSettings', 'scripts', (i) => i, { attempts: 2 })).rejects.toThrow(/changed at the same time/)
  })
  it('valide avec le FieldDef du tableau et la forme des éléments', async () => {
    const field: FieldDef = { name: 'scripts', label: 'Scripts', kind: 'array', itemLabel: 'Script', max: 2 }
    const { store, writes } = revStore([published])
    await expect(updateDraftArrayWith(store, 'siteSettings', 'scripts', (items) => insertItem(items, c), { field })).rejects.toMatchObject({ code: 'validation' })
    await expect(updateDraftArrayWith(store, 'siteSettings', 'scripts', (items) => [...items, a])).rejects.toThrow(/same key/)
    await expect(updateDraftArrayWith(store, 'siteSettings', 'scripts', (items) => [...items, { _key: 'x"]' }])).rejects.toThrow(/Invalid list item/)
    expect(writes).toHaveLength(0)
  })
  it('tableau imbriqué par sélecteur de clé ; chemin, id et document absent refusés', async () => {
    const doc: SanityDoc = { _id: 'home', _type: 'page', _rev: 'p', sections: [{ _key: 's1', items: [a] }] }
    const { store, byId } = revStore([doc])
    await updateDraftArrayWith(store, 'home', 'sections[_key=="s1"].items', (items) => insertItem(items, b))
    expect(getValueAtPath(byId.get('drafts.home')!, 'sections[_key=="s1"].items')).toBeDefined()
    await expect(updateDraftArrayWith(store, 'home', 'sections[_key=="gone"].items', (i) => i)).rejects.toMatchObject({ code: 'not_found' })
    await expect(updateDraftArrayWith(store, 'home', 'sections[0]', (i) => i)).rejects.toMatchObject({ code: 'bad_request' })
    await expect(updateDraftArrayWith(store, 'drafts.home', 'x', (i) => i)).rejects.toMatchObject({ code: 'bad_request' })
    await expect(updateDraftArrayWith(store, 'missing', 'x', (i) => i)).rejects.toMatchObject({ code: 'not_found' })
    await expect(updateDraftArrayWith(revStore([{ ...doc, sections: 'x' }]).store, 'home', 'sections', (i) => i)).rejects.toThrow(/not a list/)
  })
})
