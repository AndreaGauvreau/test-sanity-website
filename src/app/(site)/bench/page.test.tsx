import { afterEach, describe, expect, it, vi } from 'vitest'

// /bench (outil de mesure) : page introuvable hors développement (SEC-02).
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/server', () => ({ connection: async () => {} }))
const fetchSpy = vi.hoisted(() => vi.fn(async () => ({ result: [] })))
vi.mock('@/sanity/lib/client', () => ({ client: { withConfig: () => ({ fetch: fetchSpy }) } }))
vi.mock('@/sanity/lib/live', () => ({ sanityFetch: vi.fn() }))
vi.mock('@/sanity/lib/live-action', () => ({ purgeSiteCache: vi.fn() }))
vi.mock('@/components/LiveStatus', () => ({ LiveStatus: () => null }))
vi.mock('@/components/RenderStamp', () => ({ RenderStamp: () => null }))
vi.mock('./browser-bench', () => ({ BrowserBench: () => null }))
vi.mock('./bench.css', () => ({}))

const { default: BenchPage } = await import('./page')

describe('/bench', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(['production', 'test'])('NODE_ENV=%s : notFound, aucune requête', async (env) => {
    vi.stubEnv('NODE_ENV', env)
    await expect(BenchPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
