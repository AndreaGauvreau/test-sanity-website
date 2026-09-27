import { describe, expect, it } from 'vitest'

import type { Session } from '@/admin/core/contracts/session'
import { applyDraftPatch, createDraftWith, deleteDraftWith, getDocumentStateWith } from '@/admin/core/sanity/draft-core'
import type { DraftMutation, DraftStore, SanityDoc } from '@/admin/core/sanity/store'
import adminConfig from '@/admin.config'

import { isStrictlyOrdered, sortByRank } from '../lib/order'
import { createItemCore, deleteItemsCore, reorderCore, saveFieldCore, statusActionCore, toStoredDate, type CmsDeps } from './actions-core'

/** Faux Sanity en mémoire : applique vraiment les mutations (create, createIfNotExists, patch set/unset, delete). */
function memoryStore(initial: SanityDoc[]) {
  const docs = new Map(initial.map((d) => [d._id, structuredClone(d)]))
  const log: DraftMutation[][] = []
  const setPath = (doc: Record<string, unknown>, path: string, value: unknown) => {
    const parts = path.split('.')
    let cur = doc
    for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>
    if (value === undefined) delete cur[parts[parts.length - 1]]
    else cur[parts[parts.length - 1]] = value
  }
  const store: DraftStore = {
    async getDocuments(ids) {
      return ids.map((id) => (docs.has(id) ? structuredClone(docs.get(id)!) : null))
    },
    async mutate(mutations) {
      log.push(mutations)
      for (const m of mutations) {
        if ('create' in m) docs.set(m.create._id, { ...m.create })
        else if ('createIfNotExists' in m) {
          if (!docs.has(m.createIfNotExists._id)) docs.set(m.createIfNotExists._id, { ...m.createIfNotExists })
        } else if ('delete' in m) docs.delete(m.delete.id)
        else if ('patch' in m) {
          const doc = docs.get(m.patch.id)
          if (!doc) throw Object.assign(new Error('missing'), { statusCode: 404 })
          for (const [p, v] of Object.entries(m.patch.set ?? {})) setPath(doc, p, v)
          for (const p of m.patch.unset ?? []) setPath(doc, p, undefined)
        }
      }
    },
  }
  return { store, docs, log }
}

const session: Session = {
  user: { id: 'dev-kuartz', name: 'Dev', email: 'dev@example.com' },
  role: 'kuartz',
  sanityRoles: [],
  sanityToken: null,
  dev: true,
  expiresAt: '2099-01-01T00:00:00Z',
}

function makeDeps(initial: SanityDoc[], options: { denied?: boolean; assets?: string[] } = {}) {
  const mem = memoryStore(initial)
  const deps: CmsDeps = {
    requireCapability: async () => {
      if (options.denied) throw Object.assign(new Error('forbidden'), { status: 403 })
      return session
    },
    config: adminConfig,
    env: { projectId: 'p', dataset: 'development' },
    drafts: {
      getDocumentState: (id) => getDocumentStateWith(mem.store, id),
      setDraftFields: (_s, id, patch, o) => applyDraftPatch(mem.store, id, patch, o.fields),
      createDraft: (_s, type, init, o) => createDraftWith(mem.store, type, init, o),
      deleteDraft: (_s, id) => deleteDraftWith(mem.store, id),
    },
    reader: {
      collectionDocs: async (type) => [...mem.docs.values()].filter((d) => d._type === type),
      imageAssetExists: async (id) => (options.assets ?? []).includes(id),
    },
    now: () => new Date('2026-09-27T10:00:00Z'),
  }
  return { deps, ...mem }
}

const post = (id: string, over: Record<string, unknown> = {}): SanityDoc => ({
  _id: id,
  _type: 'post',
  _rev: 'r',
  _updatedAt: '2026-09-01T00:00:00Z',
  title: `Post ${id}`,
  slug: { _type: 'slug', current: id.replace(/^drafts\./, '') },
  category: 'Operations',
  publishedAt: '2026-09-08T08:00:00.000Z',
  excerpt: 'Short',
  ...over,
})

describe('saveFieldCore', () => {
  it('droit content.write exigé EN PREMIER (aucune lecture sinon)', async () => {
    const { deps, log } = makeDeps([post('p1')], { denied: true })
    const result = await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'title', value: 'x' })
    expect(result).toEqual({ ok: false, error: "You don't have access to this." })
    expect(log).toHaveLength(0)
  })

  it('écrit le champ dans le brouillon (créé depuis le publié) → statut Changed', async () => {
    const { deps, docs } = makeDeps([post('p1')])
    const result = await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'title', value: 'Carrier portals: a checklist' })
    expect(result).toMatchObject({ ok: true, status: 'changed', row: { title: 'Carrier portals: a checklist', status: 'changed' } })
    expect(docs.get('drafts.p1')?.title).toBe('Carrier portals: a checklist')
    expect(docs.get('p1')?.title).toBe('Post p1')
  })

  it('valide avec le FieldDef du manifeste (longueur, liste fermée, obligation)', async () => {
    const { deps, docs } = makeDeps([post('p1')])
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'title', value: 'x'.repeat(91) })).toMatchObject({ ok: false, field: 'title', error: 'Title must be 90 characters or fewer.' })
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'category', value: 'Hacking' })).toMatchObject({ ok: false, field: 'category' })
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'excerpt', value: '' })).toMatchObject({ ok: false, error: 'Excerpt is required.' })
    expect(docs.has('drafts.p1')).toBe(false)
  })

  it('refuse un champ hors manifeste, un chemin, un id d’une autre collection', async () => {
    const { deps } = makeDeps([post('p1'), { _id: 'siteSettings', _type: 'siteSettings', title: 'Conduit' }])
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'orderRank', value: 'a0' })).toMatchObject({ ok: false, error: 'This field cannot be edited here.' })
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'seo.metaTitle', value: 'x' })).toMatchObject({ ok: false, error: 'Invalid request.' })
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'siteSettings', field: 'title', value: 'Pwned' })).toMatchObject({ ok: false, error: 'This item no longer exists.' })
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'drafts.p1', field: 'title', value: 'x' })).toMatchObject({ ok: false, error: 'Invalid request.' })
    expect(await saveFieldCore(deps, { collectionId: 'nope', id: 'p1', field: 'title', value: 'x' })).toMatchObject({ ok: false })
  })

  it('slug : format, unicité dans la collection', async () => {
    const { deps, docs } = makeDeps([post('p1'), post('p2')])
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'slug', value: 'p2' })).toMatchObject({ ok: false, field: 'slug', error: 'Another post already uses this slug.' })
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'slug', value: 'Bad Slug' })).toMatchObject({ ok: false, field: 'slug' })
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'slug', value: 'new-slug' })).toMatchObject({ ok: true })
    expect(docs.get('drafts.p1')?.slug).toEqual({ _type: 'slug', current: 'new-slug' })
  })

  it('date : « AAAA-MM-JJ » → ISO en gardant l’heure', async () => {
    const { deps, docs } = makeDeps([post('p1')])
    await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'publishedAt', value: '2026-10-01' })
    expect(docs.get('drafts.p1')?.publishedAt).toBe('2026-10-01T08:00:00.000Z')
    expect(toStoredDate('2026-02-30x', null)).toBeNull()
    expect(toStoredDate('2026-02-03', null)).toBe('2026-02-03T00:00:00.000Z')
  })

  it('texte riche : nettoyé selon le schéma, lien dangereux refusé', async () => {
    const { deps, docs } = makeDeps([post('p1')])
    const body = [{ _type: 'block', _key: 'b1', style: 'h1', markDefs: [], children: [{ _type: 'span', _key: 's', text: 'Hi', marks: ['underline'] }] }]
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'content', value: body })).toMatchObject({ ok: true })
    expect(docs.get('drafts.p1')?.content).toEqual([{ _type: 'block', _key: 'b1', style: 'normal', markDefs: [], children: [{ _type: 'span', _key: 's', text: 'Hi', marks: [] }] }])
    const bad = [{ _type: 'block', _key: 'b1', markDefs: [{ _type: 'link', _key: 'l', href: 'javascript:x' }], children: [{ _type: 'span', _key: 's', text: 'x', marks: ['l'] }] }]
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'content', value: bad })).toMatchObject({ ok: false, field: 'content' })
    // Vide et obligatoire : refusé.
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'content', value: [] })).toMatchObject({ ok: false, error: 'Body is required.' })
  })

  it('image : asset existant de la médiathèque seulement', async () => {
    const { deps, docs } = makeDeps([post('p1')], { assets: ['image-abc-10x10-jpg'] })
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'image', value: 'image-def-10x10-jpg' })).toMatchObject({ ok: false, error: 'This image no longer exists in Media.' })
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'image', value: 'file-abc-pdf' })).toMatchObject({ ok: false, field: 'image' })
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'image', value: 'image-abc-10x10-jpg' })).toMatchObject({ ok: true })
    expect(docs.get('drafts.p1')?.image).toEqual({ _type: 'image', asset: { _type: 'reference', _ref: 'image-abc-10x10-jpg' } })
  })

  it('valeur identique au publié → redevient Live', async () => {
    const { deps } = makeDeps([post('p1'), post('drafts.p1', { title: 'Changed' })])
    expect(await saveFieldCore(deps, { collectionId: 'blog', id: 'p1', field: 'title', value: 'Post p1' })).toMatchObject({ ok: true, status: 'live' })
  })
})

describe('createItemCore', () => {
  it('crée un brouillon avec titre, slug unique, date du jour et clé d’ordre en fin de liste', async () => {
    const { deps, docs } = makeDeps([post('p1', { orderRank: 'a0', slug: { current: 'untitled-post' } })])
    const result = await createItemCore(deps, { collectionId: 'blog' })
    expect(result.ok).toBe(true)
    const id = (result as { id: string }).id
    const draft = docs.get(`drafts.${id}`)!
    expect(draft).toMatchObject({ _type: 'post', title: 'Untitled post', slug: { _type: 'slug', current: 'untitled-post-2' }, publishedAt: '2026-09-27T00:00:00.000Z' })
    expect((draft.orderRank as string) > 'a0').toBe(true)
    expect(docs.has(id)).toBe(false)
  })
})

describe('reorderCore', () => {
  const faq = (id: string, rank: string | null): SanityDoc => ({ _id: id, _type: 'faq', question: id, answer: [], ...(rank ? { orderRank: rank } : {}) })

  it('une seule écriture, clé entre les deux nouveaux voisins, dans le brouillon', async () => {
    const { deps, docs, log } = makeDeps([faq('f1', 'a0'), faq('f2', 'a1'), faq('f3', 'a2')])
    const result = await reorderCore(deps, { collectionId: 'faq', id: 'f3', beforeId: 'f1', afterId: 'f2' })
    expect(result).toMatchObject({ ok: true, updates: [{ id: 'f3', status: 'changed' }] })
    expect(log).toHaveLength(1)
    const rank = docs.get('drafts.f3')?.orderRank as string
    expect(rank > 'a0' && rank < 'a1').toBe(true)
    expect(docs.get('f3')?.orderRank).toBe('a2')
  })

  it('clés en double : renumérotation, ordre voulu respecté', async () => {
    const { deps, docs } = makeDeps([faq('f1', 'a0'), faq('f2', 'a0'), faq('f3', null)])
    const result = await reorderCore(deps, { collectionId: 'faq', id: 'f3', beforeId: null, afterId: 'f1' })
    expect(result.ok).toBe(true)
    const current = ['f1', 'f2', 'f3'].map((id) => ({ id, rank: (docs.get(`drafts.${id}`) ?? docs.get(id))?.orderRank as string }))
    expect(sortByRank(current).map((i) => i.id)).toEqual(['f3', 'f1', 'f2'])
    expect(isStrictlyOrdered(sortByRank(current))).toBe(true)
  })

  it('collection sans ordre manuel ou entrée invalide : refus', async () => {
    const { deps } = makeDeps([faq('f1', 'a0')])
    expect(await reorderCore(deps, { collectionId: 'faq', id: 'f1', beforeId: '"]*', afterId: null })).toMatchObject({ ok: false })
    expect(await reorderCore(deps, { collectionId: 'faq', id: 'zz', beforeId: null, afterId: null })).toMatchObject({ ok: false, error: 'This item no longer exists.' })
  })
})

describe('statusActionCore et deleteItemsCore', () => {
  it('Discard changes : supprime le brouillon, retour à Live', async () => {
    const { deps, docs } = makeDeps([post('p1'), post('drafts.p1', { title: 'x' })])
    expect(await statusActionCore(deps, { collectionId: 'blog', id: 'p1', action: 'discard' })).toMatchObject({ ok: true, status: 'live' })
    expect(docs.has('drafts.p1')).toBe(false)
    expect(docs.has('p1')).toBe(true)
  })
  it('Delete draft : seulement pour un élément jamais publié', async () => {
    const { deps, docs } = makeDeps([post('p1'), post('drafts.p2')])
    expect(await statusActionCore(deps, { collectionId: 'blog', id: 'p1', action: 'delete-draft' })).toMatchObject({ ok: false })
    expect(docs.has('p1')).toBe(true)
    expect(await statusActionCore(deps, { collectionId: 'blog', id: 'p2', action: 'delete-draft' })).toMatchObject({ ok: true, status: null })
    expect(docs.has('drafts.p2')).toBe(false)
  })
  it('Discard sur un brouillon seul : refus', async () => {
    const { deps } = makeDeps([post('drafts.p2')])
    expect(await statusActionCore(deps, { collectionId: 'blog', id: 'p2', action: 'discard' })).toMatchObject({ ok: false })
  })
  it('suppression multiple : brouillons seuls supprimés, éléments en ligne ignorés', async () => {
    const { deps, docs } = makeDeps([post('p1'), post('drafts.p2'), post('drafts.p3')])
    expect(await deleteItemsCore(deps, { collectionId: 'blog', ids: ['p1', 'p2', 'p3'] })).toEqual({ ok: true, deleted: ['p2', 'p3'], skipped: ['p1'] })
    expect([...docs.keys()]).toEqual(['p1'])
  })
})
