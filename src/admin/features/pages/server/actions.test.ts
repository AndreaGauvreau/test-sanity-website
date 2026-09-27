import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Server actions avec un faux Next (garde de session simulée) et un FAUX client Sanity (getWriteClient) : la garde
 * passe EN PREMIER, puis l'écriture passe par le client de l'utilisateur. Aucun réseau.
 */

vi.mock('server-only', () => ({}))
// `../lib/seo-preview` (modèles par défaut de C6) importe `@/lib/seo` → `urlFor` → variables publiques Sanity.
vi.hoisted(() => {
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'test1234')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'development')
})

const state = vi.hoisted(() => ({
  mode: 'ok' as 'ok' | 'unauthorized' | 'forbidden',
  docs: {} as Record<string, Record<string, unknown>>,
  mutations: [] as unknown[],
  calls: [] as string[],
}))

vi.mock('@/admin/core/auth/session', () => {
  class AdminAuthError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message)
    }
  }
  return {
    AdminAuthError,
    requireCapability: async (capability: string, context: string) => {
      state.calls.push(`guard:${capability}:${context}`)
      if (state.mode === 'unauthorized') throw new AdminAuthError(401, 'unauthorized', 'Your session has expired. Sign in again.')
      if (state.mode === 'forbidden') throw new AdminAuthError(403, 'forbidden', "You don't have access to this.")
      return {
        user: { id: 'u1', name: 'Marie', email: 'm@c.com' },
        role: 'client',
        sanityRoles: ['administrator'],
        sanityToken: 'user-token',
        dev: false,
        expiresAt: '2099-01-01T00:00:00.000Z',
      }
    },
  }
})

vi.mock('@/admin/core/sanity/clients', () => ({
  getWriteClient: (session: { sanityToken: string }) => {
    state.calls.push(`client:${session.sanityToken}`)
    return {
      getDocuments: async (ids: string[]) => ids.map((id) => state.docs[id] ?? null),
      mutate: async (mutations: unknown) => {
        state.mutations.push(mutations)
      },
    }
  },
  getReadClient: () => ({
    getDocuments: async (ids: string[]) => ids.map((id) => state.docs[id] ?? null),
  }),
}))

const { saveArticleSeoAction, savePageArrayAction, savePageFieldAction, savePageSeoAction } = await import('./actions')

beforeEach(() => {
  state.mode = 'ok'
  state.mutations = []
  state.calls = []
  state.docs = {
    dockSchedulingPage: { _id: 'dockSchedulingPage', _type: 'dockSchedulingPage', hero: { title: 'Dock' } },
    'articleSeo-post': { _id: 'articleSeo-post', _type: 'articleSeoTemplate', collection: 'post' },
  }
})

describe('server actions', () => {
  it('C1 : garde content.write puis écriture avec le jeton de l’utilisateur', async () => {
    expect(await savePageFieldAction({ pageId: 'home', path: 'hero.title', value: 'Dock scheduling, solved.' })).toEqual({ ok: true })
    expect(state.calls[0]).toBe('guard:content.write:action')
    expect(state.calls).toContain('client:user-token')
    expect(state.mutations).toHaveLength(1)
  })

  it('C2 et C6 passent aussi par la garde', async () => {
    expect(await savePageSeoAction({ pageId: 'home', key: 'metaTitle', value: 'Dock' })).toEqual({ ok: true })
    expect(await saveArticleSeoAction({ pageId: 'blog', key: 'metaDescription', value: '{{excerpt}}' })).toEqual({ ok: true })
    expect(state.calls.filter((c) => c.startsWith('guard:'))).toEqual(['guard:content.write:action', 'guard:content.write:action'])
  })

  it('sans session ou sans droit : message, aucun client, aucune écriture', async () => {
    state.mode = 'unauthorized'
    expect(await savePageFieldAction({ pageId: 'home', path: 'hero.title', value: 'x' })).toEqual({
      ok: false,
      error: 'Your session has expired. Sign in again.',
    })
    state.mode = 'forbidden'
    expect(await savePageSeoAction({ pageId: 'home', key: 'metaTitle', value: 'x' })).toEqual({ ok: false, error: "You don't have access to this." })
    expect(state.calls.some((c) => c.startsWith('client:'))).toBe(false)
    expect(state.mutations).toHaveLength(0)
  })

  it('C1 tableau (FOLLOWUPS #40) : garde d’abord, puis ajout par clé en écriture conditionnée avec le jeton de l’utilisateur', async () => {
    const item = { _key: 'r1', platform: 'g2', label: '4.7 on G2' }
    const result = await savePageArrayAction({ pageId: 'home', path: 'hero.ratings', op: 'insert', item, after: null })
    expect(result).toEqual({ ok: true, items: [{ ...item, _type: 'rating' }] })
    expect(state.calls[0]).toBe('guard:content.write:action')
    expect(state.calls).toContain('client:user-token')
    // Pas de brouillon : create (409 si un brouillon naît entre-temps), jamais createIfNotExists + tableau entier.
    expect(state.mutations[0]).toEqual([
      { create: expect.objectContaining({ _id: 'drafts.dockSchedulingPage' }) },
      { patch: { id: 'drafts.dockSchedulingPage', set: { 'hero.ratings': [{ ...item, _type: 'rating' }] } } },
    ])
    state.mode = 'forbidden'
    state.mutations = []
    expect(await savePageArrayAction({ pageId: 'home', path: 'hero.ratings', op: 'remove', key: 'r1' })).toEqual({ ok: false, error: "You don't have access to this." })
    expect(state.mutations).toHaveLength(0)
  })

  it('entrée invalide : refus sans écriture', async () => {
    expect((await savePageFieldAction({ pageId: 'home', path: 'hero.title' + '.x'.repeat(200), value: 'x' })).ok).toBe(false)
    expect((await savePageFieldAction(null)).ok).toBe(false)
    expect(state.mutations).toHaveLength(0)
  })
})
