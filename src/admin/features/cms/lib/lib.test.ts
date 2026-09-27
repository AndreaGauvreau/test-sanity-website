import { describe, expect, it, vi } from 'vitest'

import type { CollectionDef } from '@/admin/core/contracts/manifest'
import adminConfig from '@/admin.config'

import { applyListQuery, canReorder, defaultSort, directionOptions, parseStoredQuery, sortOptions, type ListQuery } from './list-query'
import { imageUrl, parseImageId } from './image-url'
import { isStrictlyOrdered, isValidRank, keyBetween, planMove, rankAfterLast, sortByRank, targetIndexFromNeighbours } from './order'
import { buildRows, countLabel, formatDate, type CmsRow } from './rows'
import { articlePathFor, slugify, uniqueSlug } from './slug'
import { partitionForDelete, runStage, stagedFrom, statusMenu } from './staging'
import { computeStatus, deepEqual } from './status'

const blog = adminConfig.collections.find((c) => c.id === 'blog') as CollectionDef
const faq = adminConfig.collections.find((c) => c.id === 'faq') as CollectionDef
const env = { projectId: 'proj', dataset: 'development' }

describe('computeStatus (Live / Draft / Changed)', () => {
  const published = { _id: 'p1', _type: 'post', _rev: 'a', _updatedAt: '2026-01-01', title: 'Hello', tags: ['a', 'b'] }

  it('publié sans brouillon → live', () => {
    expect(computeStatus(published, null)).toBe('live')
  })
  it('brouillon seul → draft', () => {
    expect(computeStatus(null, { _id: 'drafts.p1', _type: 'post', title: 'x' })).toBe('draft')
  })
  it('brouillon identique (hors champs système) → live', () => {
    const draft = { ...published, _id: 'drafts.p1', _rev: 'zz', _updatedAt: '2026-09-27', _createdAt: 'x' }
    expect(computeStatus(published, draft)).toBe('live')
  })
  it('brouillon différent → changed', () => {
    expect(computeStatus(published, { ...published, _id: 'drafts.p1', title: 'Hello!' })).toBe('changed')
  })
  it('ordre des clés indifférent, ordre des tableaux significatif', () => {
    expect(deepEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true)
    expect(deepEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
    expect(deepEqual({ a: undefined }, {})).toBe(true)
  })
  it('aucune version → null', () => {
    expect(computeStatus(null, null)).toBeNull()
  })
})

describe('ordre manuel (fractional-indexing)', () => {
  const items = [
    { id: 'a', rank: 'a0' },
    { id: 'b', rank: 'a1' },
    { id: 'c', rank: 'a2' },
    { id: 'd', rank: 'a3' },
  ]

  it('clé entre deux voisins : strictement entre les deux', () => {
    const k = keyBetween('a0', 'a1')
    expect(k > 'a0' && k < 'a1').toBe(true)
  })

  it('déplacer vers le haut écrit UNE clé, entre les nouveaux voisins', () => {
    const updates = planMove(items, 'd', 1)
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('d')
    expect(updates[0].rank > 'a0' && updates[0].rank < 'a1').toBe(true)
  })

  it('déplacer en tête et en fin', () => {
    const top = planMove(items, 'c', 0)
    expect(top).toHaveLength(1)
    expect(top[0].rank < 'a0').toBe(true)
    const bottom = planMove(items, 'a', 3)
    expect(bottom).toHaveLength(1)
    expect(bottom[0].rank > 'a3').toBe(true)
  })

  it('aucun déplacement → aucune écriture', () => {
    expect(planMove(items, 'b', 1)).toEqual([])
  })

  it('le nouvel ordre trié par clé est celui voulu', () => {
    const updates = planMove(items, 'a', 2)
    const next = items.map((i) => ({ ...i, rank: updates.find((u) => u.id === i.id)?.rank ?? i.rank }))
    expect(sortByRank(next).map((i) => i.id)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('clés absentes ou en double → renumérotation complète dans l’ordre voulu', () => {
    const broken = [
      { id: 'a', rank: 'a0' },
      { id: 'b', rank: 'a0' },
      { id: 'c', rank: null },
    ]
    const updates = planMove(broken, 'c', 0)
    const next = broken.map((i) => ({ ...i, rank: updates.find((u) => u.id === i.id)?.rank ?? i.rank }))
    expect(isStrictlyOrdered(sortByRank(next))).toBe(true)
    expect(sortByRank(next).map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('clé invalide détectée ; clé de fin de liste', () => {
    expect(isValidRank('a0')).toBe(true)
    expect(isValidRank('')).toBe(false)
    expect(isValidRank('zz!')).toBe(false)
    expect(rankAfterLast(items) > 'a3').toBe(true)
    expect(rankAfterLast([])).toBe('a0')
  })

  it('position cible d’après les voisins envoyés par l’interface', () => {
    expect(targetIndexFromNeighbours(items, 'd', 'a', 'b')).toBe(1)
    expect(targetIndexFromNeighbours(items, 'a', null, 'b')).toBe(0)
    expect(targetIndexFromNeighbours(items, 'a', 'd', null)).toBe(3)
  })

  it('id inconnu → erreur', () => {
    expect(() => planMove(items, 'zz', 0)).toThrow()
  })
})

describe('lignes du tableau', () => {
  const docs = [
    { _id: 'p1', _type: 'post', _updatedAt: '2026-09-01T00:00:00Z', title: 'How to cut dock wait times', slug: { current: 'how-to' }, category: 'Operations', publishedAt: '2026-09-12T08:00:00Z', excerpt: 'Five changes', author: 'Marie Laurent', orderRank: 'a1', image: { asset: { _ref: 'image-abc123-1600x900-jpg' } } },
    { _id: 'p2', _type: 'post', _updatedAt: '2026-08-01T00:00:00Z', title: 'Carrier portals', slug: { current: 'carrier-portals' }, category: 'Analysis', publishedAt: '2026-09-08T08:00:00Z', excerpt: 'Before you roll out', orderRank: 'a0' },
    { _id: 'drafts.p2', _type: 'post', _updatedAt: '2026-09-20T00:00:00Z', title: 'Carrier portals: a checklist', slug: { current: 'carrier-portals' }, category: 'Analysis', publishedAt: '2026-09-08T08:00:00Z', excerpt: 'Before you roll out', orderRank: 'a0' },
    { _id: 'drafts.p3', _type: 'post', _updatedAt: '2026-09-25T00:00:00Z', title: 'Q3 product update', slug: { current: 'q3' }, category: "Buyer's guide", excerpt: 'Line one\nline two' },
  ]
  const rows = buildRows(blog, docs, env)
  const byId = Object.fromEntries(rows.map((r) => [r.id, r])) as Record<string, CmsRow>

  it('regroupe brouillon et publié, statut et valeurs du brouillon', () => {
    expect(rows).toHaveLength(3)
    expect(byId.p1.status).toBe('live')
    expect(byId.p2.status).toBe('changed')
    expect(byId.p2.title).toBe('Carrier portals: a checklist')
    expect(byId.p3.status).toBe('draft')
  })

  it('cellules : date formatée, slug, vignette, édition sur place', () => {
    expect(byId.p1.cells.publishedAt.text).toBe('Sep 12, 2026')
    expect(byId.p3.cells.publishedAt.text).toBe('—')
    expect(byId.p1.cells.slug).toMatchObject({ text: 'how-to', editable: true, raw: 'how-to' })
    expect(byId.p1.cells.image.image).toContain('https://cdn.sanity.io/images/proj/development/abc123-1600x900.jpg')
    expect(byId.p1.cells.category.editable).toBe(false)
    // Texte multiligne : édité dans le panneau, pas dans la cellule.
    expect(byId.p3.cells.excerpt.editable).toBe(false)
    expect(byId.p1.cells.excerpt.editable).toBe(true)
  })

  const base: ListQuery = { sort: { by: 'updated', direction: 'desc' }, conditions: [], search: '' }

  it('tri Last updated / Title / Date / Manual', () => {
    expect(applyListQuery(rows, base).map((r) => r.id)).toEqual(['p3', 'p2', 'p1'])
    expect(applyListQuery(rows, { ...base, sort: { by: 'title', direction: 'asc' } }).map((r) => r.id)).toEqual(['p2', 'p1', 'p3'])
    // Sans date : en fin de liste dans les deux sens.
    expect(applyListQuery(rows, { ...base, sort: { by: 'date', direction: 'asc' } }).map((r) => r.id)).toEqual(['p2', 'p1', 'p3'])
    expect(applyListQuery(rows, { ...base, sort: { by: 'date', direction: 'desc' } }).map((r) => r.id)).toEqual(['p1', 'p2', 'p3'])
    expect(applyListQuery(rows, { ...base, sort: { by: 'manual', direction: 'asc' } }).map((r) => r.id)).toEqual(['p2', 'p1', 'p3'])
  })

  it('filtres is / is not (statut, catégorie), cumulés', () => {
    const live = applyListQuery(rows, { ...base, conditions: [{ id: '1', field: 'status', operator: 'is', value: 'live' }] })
    expect(live.map((r) => r.id)).toEqual(['p1'])
    const notDraft = applyListQuery(rows, { ...base, conditions: [{ id: '1', field: 'status', operator: 'is-not', value: 'draft' }] })
    expect(notDraft.map((r) => r.id).sort()).toEqual(['p1', 'p2'])
    const both = applyListQuery(rows, {
      ...base,
      conditions: [
        { id: '1', field: 'status', operator: 'is-not', value: 'draft' },
        { id: '2', field: 'category', operator: 'is', value: 'Analysis' },
      ],
    })
    expect(both.map((r) => r.id)).toEqual(['p2'])
    // Condition incomplète : ignorée.
    expect(applyListQuery(rows, { ...base, conditions: [{ id: '1', field: 'status', operator: 'is', value: null }] })).toHaveLength(3)
  })

  it('recherche insensible à la casse, aux accents, sur plusieurs mots', () => {
    expect(applyListQuery(rows, { ...base, search: 'CARRIER' }).map((r) => r.id)).toEqual(['p2'])
    expect(applyListQuery(rows, { ...base, search: 'marie laurent' }).map((r) => r.id)).toEqual(['p1'])
    expect(applyListQuery(rows, { ...base, search: 'nothing here' })).toEqual([])
  })

  it('glisser-déposer : seulement en ordre manuel, sans filtre ni recherche', () => {
    expect(canReorder(blog, { ...base, sort: { by: 'manual', direction: 'asc' } })).toBe(true)
    expect(canReorder(blog, base)).toBe(false)
    expect(canReorder(blog, { ...base, sort: { by: 'manual', direction: 'asc' }, search: 'x' })).toBe(false)
  })

  it('options de tri et tri par défaut du manifeste', () => {
    expect(sortOptions(blog).map((o) => o.value)).toEqual(['manual', 'updated', 'title', 'date'])
    expect(sortOptions(faq).map((o) => o.value)).toEqual(['manual', 'updated', 'title'])
    expect(defaultSort(blog)).toEqual({ by: 'updated', direction: 'desc' })
    expect(defaultSort(faq)).toEqual({ by: 'manual', direction: 'asc' })
    expect(directionOptions('date').map((o) => o.label)).toEqual(['Newest first', 'Oldest first'])
  })

  it('état relu du stockage : valeurs inconnues écartées', () => {
    const parsed = parseStoredQuery(
      { sort: { by: 'date', direction: 'up' }, conditions: [{ id: 'x', field: 'secret', operator: 'is', value: 'a' }, { id: 'y', field: 'status', operator: 'is', value: 'live' }], search: 42 },
      blog,
    )
    expect(parsed.sort).toBeUndefined()
    expect(parsed.conditions).toEqual([{ id: 'y', field: 'status', operator: 'is', value: 'live' }])
    expect(parsed.search).toBeUndefined()
  })
})

describe('slug, dates, libellés, URL d’image', () => {
  it('slugify', () => {
    expect(slugify('Carrier portals: a checklist')).toBe('carrier-portals-a-checklist')
    expect(slugify('Déjà vu — l’été')).toBe('deja-vu-lete')
    expect(slugify('  ')).toBe('')
  })
  it('slug unique', () => {
    expect(uniqueSlug('new-post', new Set(['new-post', 'new-post-2']))).toBe('new-post-3')
    expect(uniqueSlug('ok', new Set())).toBe('ok')
  })
  it('chemin public', () => {
    expect(articlePathFor('/blog/:slug', 'carrier-portals')).toBe('/blog/carrier-portals')
    expect(articlePathFor(undefined, 'x')).toBeNull()
  })
  it('formatDate', () => {
    expect(formatDate('2026-09-08T23:30:00Z')).toBe('Sep 8, 2026')
    expect(formatDate('nope')).toBe('—')
  })
  it('countLabel', () => {
    expect(countLabel(12, blog)).toBe('12 posts')
    expect(countLabel(1, blog)).toBe('1 post')
    expect(countLabel(9, faq)).toBe('9 questions')
  })
  it('image CDN', () => {
    expect(parseImageId('image-abc-10x20-png')).toEqual({ hash: 'abc', width: 10, height: 20, ext: 'png' })
    expect(parseImageId('file-abc-pdf')).toBeNull()
    expect(imageUrl('image-abc-10x20-png', env, { w: 5 })).toBe('https://cdn.sanity.io/images/proj/development/abc-10x20.png?w=5&auto=format')
  })
})

describe('staging (dépublier / supprimer au prochain Publish, #31)', () => {
  const pending = (id: string, action?: 'publish' | 'unpublish' | 'delete') => ({ id, type: 'post', path: id, summary: '', updatedAt: '2026-09-27T00:00:00Z', ...(action ? { action } : {}) })

  it('stagedFrom : seulement unpublish / delete, seulement les ids de la collection', () => {
    const status = { pending: { content: [pending('a', 'unpublish'), pending('b', 'delete'), pending('c'), pending('z', 'delete')], design: [], total: 4 } }
    expect(stagedFrom(status, ['a', 'b', 'c'])).toEqual({ a: 'unpublish', b: 'delete' })
    expect(stagedFrom(null, ['a'])).toEqual({})
  })

  it('statusMenu : actions selon le statut et l’état programmé', () => {
    expect(statusMenu('draft').map((a) => a.id)).toEqual(['delete-draft'])
    expect(statusMenu('live').map((a) => a.id)).toEqual(['unpublish', 'delete-live'])
    expect(statusMenu('changed').map((a) => a.id)).toEqual(['discard', 'unpublish', 'delete-live'])
    expect(statusMenu('live', 'unpublish')).toEqual([{ id: 'unstage', label: 'Keep online', icon: 'eye' }])
    expect(statusMenu('changed', 'delete').map((a) => a.id)).toEqual(['unstage'])
  })

  it('partitionForDelete : brouillons, en ligne, déjà programmés', () => {
    const rows = [
      { id: 'd', status: 'draft' as const },
      { id: 'l', status: 'live' as const },
      { id: 'c', status: 'changed' as const },
      { id: 's', status: 'live' as const },
    ]
    const out = partitionForDelete(rows, { s: 'delete' })
    expect(out.drafts.map((r) => r.id)).toEqual(['d'])
    expect(out.live.map((r) => r.id)).toEqual(['l', 'c'])
    expect(out.alreadyStaged.map((r) => r.id)).toEqual(['s'])
  })

  it('runStage : appelle stage / unstage et renvoie l’état ; erreur du moteur → message', async () => {
    const status = { state: 'pending' as const, pending: { content: [pending('a', 'delete')], design: [], total: 1 }, deploy: { mode: 'local' as const } }
    const client = { stage: vi.fn(async () => status), unstage: vi.fn(async () => ({ ...status, pending: { ...status.pending, content: [] } })) }
    expect(await runStage(client, ['a'], 'a', 'delete')).toEqual({ ok: true, staged: { a: 'delete' } })
    expect(client.stage).toHaveBeenCalledWith({ kind: 'delete', id: 'a' })
    expect(await runStage(client, ['a'], 'a', null)).toEqual({ ok: true, staged: {} })
    expect(client.unstage).toHaveBeenCalledWith('a')
    const failing = { stage: vi.fn(async () => Promise.reject(new Error('A publish is running.'))), unstage: vi.fn() }
    expect(await runStage(failing, ['a'], 'a', 'unpublish')).toEqual({ ok: false, error: 'A publish is running.' })
  })
})
