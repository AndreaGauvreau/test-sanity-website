import { describe, expect, it, vi } from 'vitest'

import { signInWithSid } from './login'

const SID = 'abcdefghijklmnopqrstuvwxyz0123'

function sanity(me: unknown, meStatus = 200) {
  const calls: string[] = []
  const f = vi.fn(async (url: string) => {
    calls.push(url)
    if (url.includes('/auth/fetch')) return Response.json({ token: 'user-token-abcdef' })
    if (url.includes('/users/me')) return Response.json(me, { status: meStatus })
    if (url.includes('/auth/logout')) return new Response(null, { status: 200 })
    throw new Error(url)
  })
  return { f, calls }
}

describe('signInWithSid', () => {
  it('Administrator → session client avec le jeton', async () => {
    const { f } = sanity({ id: 'u1', name: 'Marie', email: 'm@c.com', roles: [{ name: 'administrator' }] })
    const res = await signInWithSid({ projectId: 'p', sid: SID, fetchImpl: f })
    expect(res).toEqual({
      ok: true,
      session: { user: { id: 'u1', name: 'Marie', email: 'm@c.com' }, role: 'client', sanityRoles: ['administrator'], sanityToken: 'user-token-abcdef', dev: false },
    })
  })
  it('Developer → kuartz', async () => {
    const { f } = sanity({ id: 'u2', name: 'Andrea', email: 'a@k.studio', roles: [{ name: 'developer' }] })
    const res = await signInWithSid({ projectId: 'p', sid: SID, fetchImpl: f })
    expect(res.ok && res.session.role).toBe('kuartz')
  })
  it('Viewer → 403 avec message clair, jeton révoqué', async () => {
    const { f, calls } = sanity({ id: 'u3', name: 'V', email: 'v@c.com', roles: [{ name: 'viewer' }] })
    const res = await signInWithSid({ projectId: 'p', sid: SID, fetchImpl: f })
    expect(res).toMatchObject({ ok: false, status: 403, code: 'forbidden' })
    expect(!res.ok && res.message).toMatch(/\(Viewer\).*Ask the site owner/)
    expect(calls.some((u) => u.endsWith('/auth/logout'))).toBe(true)
  })
  it('non-membre (aucun rôle) → « Ask the site owner to invite you. »', async () => {
    const { f } = sanity({ id: 'u4', name: 'N', email: 'n@c.com', roles: [] })
    const res = await signInWithSid({ projectId: 'p', sid: SID, fetchImpl: f })
    expect(!res.ok && res.message).toBe("Your Sanity account isn't a member of this project. Ask the site owner to invite you.")
  })
  it('/users/me refusé → 401, jeton révoqué', async () => {
    const { f, calls } = sanity({ message: 'nope' }, 401)
    const res = await signInWithSid({ projectId: 'p', sid: SID, fetchImpl: f })
    expect(res).toMatchObject({ ok: false, status: 401 })
    expect(calls.some((u) => u.endsWith('/auth/logout'))).toBe(true)
  })
})
