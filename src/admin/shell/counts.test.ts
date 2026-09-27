import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { buildCountQuery, fetchCollectionCounts } = await import('./counts')

const collections = [
  { id: 'blog', type: 'post' },
  { id: 'testimonials', type: 'testimonial' },
  { id: 'faq', type: 'faq' },
]

afterEach(() => vi.restoreAllMocks())

describe('comptes des collections (sidebar)', () => {
  it('une seule requête, types en paramètres (jamais dans le texte GROQ)', () => {
    const { query, params } = buildCountQuery([{ type: 'post' }, { type: 'x" ] | *[' }])
    expect(query).toBe('{"c0": count(*[_type == $t0]), "c1": count(*[_type == $t1])}')
    expect(params).toEqual({ t0: 'post', t1: 'x" ] | *[' })
  })

  it('renvoie le compte de chaque collection par son id, sans cache', async () => {
    const fetch = vi.fn().mockResolvedValue({ c0: 12, c1: 3, c2: 9 })
    await expect(fetchCollectionCounts({ fetch }, collections)).resolves.toEqual({ blog: 12, testimonials: 3, faq: 9 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1]).toEqual({ t0: 'post', t1: 'testimonial', t2: 'faq' })
    expect(fetch.mock.calls[0][2]).toMatchObject({ cache: 'no-store' })
    expect(fetch.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal)
  })

  it('valeurs invalides → null', async () => {
    const fetch = vi.fn().mockResolvedValue({ c0: -1, c1: '3', c2: Number.NaN })
    await expect(fetchCollectionCounts({ fetch }, collections)).resolves.toEqual({ blog: null, testimonials: null, faq: null })
  })

  it('Sanity en échec : tout à null, la coque ne tombe pas', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetch = vi.fn().mockRejectedValue(new Error('Socket timed out'))
    await expect(fetchCollectionCounts({ fetch }, collections)).resolves.toEqual({ blog: null, testimonials: null, faq: null })
  })

  it('délai dépassé : abandon puis null', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetch = vi.fn(
      (_q: string, _p: Record<string, string>, options: { signal?: AbortSignal }) =>
        new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    )
    await expect(fetchCollectionCounts({ fetch }, collections, 20)).resolves.toEqual({ blog: null, testimonials: null, faq: null })
  })

  it('aucune collection : aucun appel', async () => {
    const fetch = vi.fn()
    await expect(fetchCollectionCounts({ fetch }, [])).resolves.toEqual({})
    expect(fetch).not.toHaveBeenCalled()
  })
})
