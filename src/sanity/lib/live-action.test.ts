import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }))
vi.mock('next/cache', () => cache)
vi.mock('next/headers', () => ({ draftMode: async () => ({ isEnabled: false }) }))

const { onContentChange, onPublishFromAdmin, purgeSiteCache } = await import('./live-action')

describe('server actions du site (SEC-02)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('onPublishFromAdmin : seulement les sync tags connus, nombre borné', async () => {
    await onPublishFromAdmin(['sanity:s1:abc', 'sanity:everything', 'x'])
    expect(cache.revalidateTag).toHaveBeenCalledTimes(1)
    expect(cache.revalidateTag).toHaveBeenCalledWith('sanity:s1:abc', { expire: 0 })

    cache.revalidateTag.mockClear()
    await onPublishFromAdmin(Array.from({ length: 10_000 }, (_, i) => `sanity:s1:t${i}`))
    expect(cache.revalidateTag.mock.calls.length).toBeLessThanOrEqual(64)
  })

  it('onPublishFromAdmin / onContentChange : entrée invalide = aucune invalidation, sans erreur', async () => {
    await expect(onPublishFromAdmin('nope')).resolves.toBeUndefined()
    await expect(onContentChange([])).resolves.toBeUndefined()
    await expect(onContentChange(['sanity:posts'])).resolves.toBeUndefined()
    expect(cache.revalidateTag).not.toHaveBeenCalled()
    expect(cache.updateTag).not.toHaveBeenCalled()
  })

  it('onContentChange : updateTag sur les tags connus seulement', async () => {
    await onContentChange(['sanity:s1:abc', 'sanity:s1:abc', 'bad'])
    expect(cache.updateTag.mock.calls).toEqual([['sanity:s1:abc']])
  })

  it('purgeSiteCache : sans effet hors développement', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await purgeSiteCache()
    expect(cache.revalidatePath).not.toHaveBeenCalled()
    vi.stubEnv('NODE_ENV', 'development')
    await purgeSiteCache()
    expect(cache.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
