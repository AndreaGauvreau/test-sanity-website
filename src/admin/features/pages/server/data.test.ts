import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// `@/lib/seo` et `@/sanity/lib/image` → `urlFor` → variables publiques Sanity.
vi.hoisted(() => {
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'test1234')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'development')
})

/**
 * Lectures de C6 avec un FAUX client Sanity : requête adaptée à la collection, valeurs des {{variables}} calculées
 * comme la page article du site (src/lib/article-values.ts), modèle par défaut de la collection sans document.
 */

const fetch = vi.fn()
const documents: Record<string, unknown> = {}

vi.mock('@/admin/core/sanity/clients', () => ({ getReadClient: () => ({ fetch }) }))
vi.mock('@/admin/core/sanity/drafts', () => ({
  getDocumentState: async (id: string) => ({ value: documents[id] ?? null, draft: null, published: documents[id] ?? null }),
}))

const { loadArticleOptions, loadArticleTemplate } = await import('./data')

/** Réponses du faux client : lignes pour la requête de liste, total pour `count(…)`. */
function answer(rows: unknown[], total = rows.length) {
  fetch.mockImplementation(async (query: string) => (query.startsWith('count(') ? total : rows))
}

beforeEach(() => {
  fetch.mockReset()
  for (const key of Object.keys(documents)) delete documents[key]
})

describe('loadArticleOptions (« Preview with » de C6)', () => {
  it('post : inchangé ({{date}} AAAA-MM-JJ, titre de l’article)', async () => {
    answer([{ _id: 'p1', title: 'Carrier portals', slug: 'carrier-portals', publishedAt: '2026-09-01T10:00:00Z', excerpt: 'E', author: 'A', category: 'C', image: null }], 12)
    const { options, total } = await loadArticleOptions('post')
    expect(total).toBe(12)
    expect(options).toEqual([
      {
        id: 'p1',
        title: 'Carrier portals',
        slug: 'carrier-portals',
        values: { title: 'Carrier portals', slug: 'carrier-portals', date: '2026-09-01', excerpt: 'E', cover: null, author: 'A', category: 'C' },
        coverUrl: null,
        coverAlt: null,
      },
    ])
    expect(fetch.mock.calls[0][0]).toContain('order(publishedAt desc)')
    expect(fetch.mock.calls[0][1]).toEqual({ type: 'post' })
  })

  it('testimonial : nom en titre, variables du témoignage, ordre de /testimonials, pas d’image', async () => {
    answer([{ _id: 't1', name: 'Dana Ruiz', slug: 'dana-ruiz', company: 'Northwind', role: 'COO', quote: 'Docks run on time.' }], 3)
    const { options, total } = await loadArticleOptions('testimonial')
    expect(total).toBe(3)
    expect(options).toEqual([
      {
        id: 't1',
        title: 'Dana Ruiz',
        slug: 'dana-ruiz',
        values: { name: 'Dana Ruiz', slug: 'dana-ruiz', company: 'Northwind', role: 'COO', quote: 'Docks run on time.' },
        coverUrl: null,
        coverAlt: null,
      },
    ])
    const [query] = fetch.mock.calls[0]
    expect(query).toContain('defined(slug.current)')
    expect(query).toContain('order(coalesce(orderRank, "~") asc, _createdAt desc)')
    expect(query).not.toContain('publishedAt')
  })

  it('faq : question en titre, {{answer}} = texte brut de la réponse ; questions sans réponse exclues', async () => {
    answer([
      {
        _id: 'f1',
        question: 'How do carriers book a slot?',
        slug: 'book-a-slot',
        answer: [{ _type: 'block', children: [{ text: 'From the ' }, { text: 'carrier portal.' }] }, { _type: 'block', children: [{ text: 'Two clicks.' }] }],
      },
    ])
    const { options } = await loadArticleOptions('faq')
    expect(options[0]).toMatchObject({
      title: 'How do carriers book a slot?',
      values: { question: 'How do carriers book a slot?', slug: 'book-a-slot', answer: 'From the carrier portal. Two clicks.' },
      coverUrl: null,
    })
    const queries = fetch.mock.calls.map(([q]) => q as string)
    expect(queries.every((q) => q.includes('defined(answer)'))).toBe(true)
  })

  it('collection sans lecture connue : aucun élément, aucune requête', async () => {
    expect(await loadArticleOptions('nope')).toEqual({ options: [], total: 0 })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('loadArticleTemplate', () => {
  it('sans document : le modèle par défaut de la collection', async () => {
    expect((await loadArticleTemplate('articleSeo-post', 'post')).template.metaTitle).toBe('{{title}}')
    expect(await loadArticleTemplate('articleSeo-testimonial', 'testimonial')).toEqual({
      exists: false,
      template: { metaTitle: 'Testimonial from {{name}}, {{company}}', metaDescription: '{{quote}}', ogImageField: null, ogImage: null, allowIndexing: true },
    })
    expect((await loadArticleTemplate('articleSeo-faq', 'faq')).template).toMatchObject({ metaTitle: '{{question}}', metaDescription: '{{answer}}', ogImageField: null })
  })

  it('document présent : ses valeurs', async () => {
    documents['articleSeo-faq'] = { _id: 'articleSeo-faq', collection: 'faq', metaTitle: '{{question}} | FAQ', allowIndexing: false }
    expect(await loadArticleTemplate('articleSeo-faq', 'faq')).toEqual({
      exists: true,
      template: { metaTitle: '{{question}} | FAQ', metaDescription: null, ogImageField: null, ogImage: null, allowIndexing: false },
    })
  })
})
