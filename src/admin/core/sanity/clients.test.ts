import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Session } from '@/admin/core/contracts/session'

vi.mock('server-only', () => ({}))

const { getReadClient, getWriteClient } = await import('./clients')
const { saveDraftField } = await import('./drafts')
const { toWriteError } = await import('./store')

const base: Session = {
  user: { id: 'u1', name: 'Marie', email: 'm@c.com' },
  role: 'client',
  sanityRoles: ['administrator'],
  sanityToken: 'user-token-123456',
  dev: false,
  expiresAt: '2099-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'testproj')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'development')
  vi.stubEnv('SANITY_API_WRITE_TOKEN', 'robot-token-abcdef')
  vi.stubEnv('SANITY_API_READ_TOKEN', 'viewer-token-abcdef')
})
afterEach(() => vi.unstubAllEnvs())

describe('getWriteClient', () => {
  it('écrit avec le jeton de l’utilisateur, sans CDN ni stega', () => {
    const config = getWriteClient(base).config()
    expect(config.token).toBe('user-token-123456')
    expect(config.useCdn).toBe(false)
    expect(config.dataset).toBe('development')
  })
  it('session de dev : jeton robot seulement en développement', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const dev = { ...base, sanityToken: null, dev: true }
    expect(getWriteClient(dev).config().token).toBe('robot-token-abcdef')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => getWriteClient(dev)).toThrow(/cannot write outside development/)
  })
  it('session de dev sans SANITY_API_WRITE_TOKEN → erreur claire', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SANITY_API_WRITE_TOKEN', '')
    expect(() => getWriteClient({ ...base, sanityToken: null, dev: true })).toThrow(/SANITY_API_WRITE_TOKEN/)
  })
  it('vraie session sans jeton → jamais de repli sur le robot', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(() => getWriteClient({ ...base, sanityToken: null })).toThrow(/no Sanity access/)
  })
})

describe('getReadClient', () => {
  it('jeton Viewer, sans CDN, sans stega, perspective demandée', () => {
    const config = getReadClient({ perspective: 'drafts' }).config()
    expect(config.token).toBe('viewer-token-abcdef')
    expect(config.useCdn).toBe(false)
    expect(config.perspective).toBe('drafts')
    expect(config.stega?.enabled ?? false).toBe(false)
  })
})

describe('drafts.ts', () => {
  it('saveDraftField passe par le magasin injecté', async () => {
    const mutate = vi.fn(async () => {})
    const store = { getDocuments: async (ids: string[]) => ids.map((id) => (id === 'home' ? { _id: 'home', _type: 'page', title: 'A' } : null)), mutate }
    await saveDraftField(base, 'home', 'title', 'B', { store, field: { name: 'title', label: 'Title', kind: 'string' } })
    expect(mutate).toHaveBeenCalledWith([
      { createIfNotExists: { _id: 'drafts.home', _type: 'page', title: 'A' } },
      { patch: { id: 'drafts.home', set: { title: 'B' } } },
    ])
  })
})

describe('toWriteError', () => {
  it('traduit les statuts HTTP de Sanity en messages anglais', () => {
    expect(toWriteError({ statusCode: 403 })).toMatchObject({ code: 'forbidden' })
    expect(toWriteError({ statusCode: 409 })).toMatchObject({ code: 'bad_request', message: expect.stringMatching(/same time/), httpStatus: 409 })
    expect(toWriteError(new Error('ECONNRESET'))).toMatchObject({ code: 'unavailable' })
  })
})
