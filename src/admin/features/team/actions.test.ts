import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ refresh }))

const auth = vi.hoisted(() => ({ calls: [] as string[][], fail: null as null | string, session: null as unknown }))
vi.mock('@/admin/core/auth/session', () => ({
  requireCapability: vi.fn(async (capability: string, context: string) => {
    auth.calls.push([capability, context])
    if (auth.fail) throw Object.assign(new Error(auth.fail), { name: 'AdminAuthError' })
    return auth.session
  }),
}))

const { inviteMemberAction } = await import('./actions')

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'proj1')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'development')
  auth.calls = []
  auth.fail = null
  auth.session = { user: { id: 'm', name: 'Marie', email: 'm@c.com' }, role: 'client', sanityRoles: ['administrator'], sanityToken: 'tok', dev: false, expiresAt: '2099-01-01' }
  refresh.mockClear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'i', status: 'pending', email: 'a@b.co', role: 'editor' }), { status: 201 })))
})

describe('inviteMemberAction', () => {
  it('exige settings.team en contexte action, puis invite et rafraîchit l’écran', async () => {
    await expect(inviteMemberAction({ email: 'a@b.co', role: 'editor' })).resolves.toMatchObject({ ok: true })
    expect(auth.calls).toEqual([['settings.team', 'action']])
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('sans le droit (Kuartz, editor) : refus, aucun appel à Sanity', async () => {
    auth.fail = "You don't have access to this."
    await expect(inviteMemberAction({ email: 'a@b.co', role: 'editor' })).resolves.toEqual({ ok: false, error: "You don't have access to this." })
    expect(fetch).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('entrée invalide : refus sans rafraîchir', async () => {
    await expect(inviteMemberAction({ email: 'x', role: 'editor' })).resolves.toMatchObject({ ok: false, field: 'email' })
    expect(refresh).not.toHaveBeenCalled()
  })
})
