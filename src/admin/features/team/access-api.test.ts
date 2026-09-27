import { describe, expect, it, vi } from 'vitest'

import { TeamApiError, createProjectInvite, listProjectInvites, listProjectUsers, sanityManageMembersUrl } from './access-api'

function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = responses.shift() ?? { status: 500 }
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status })
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

describe('API d’accès Sanity', () => {
  it('liste les membres avec le jeton de l’utilisateur, page par page', async () => {
    const u = (id: string) => ({ sanityUserId: id, profile: { email: `${id}@x.com` }, memberships: [] })
    const { impl, calls } = fakeFetch([
      { status: 200, body: { data: [u('a')], nextCursor: 'c2', totalCount: 2 } },
      { status: 200, body: { data: [u('b')], nextCursor: null, totalCount: 2 } },
    ])
    const users = await listProjectUsers({ token: 'tok', projectId: 'proj1', fetchImpl: impl })
    expect(users.map((x) => x.sanityUserId)).toEqual(['a', 'b'])
    expect(calls[0].url).toBe('https://api.sanity.io/v2025-07-11/access/project/proj1/users?limit=100')
    expect(calls[1].url).toBe('https://api.sanity.io/v2025-07-11/access/project/proj1/users?limit=100&nextCursor=c2')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(calls[0].init.method).toBe('GET')
  })

  it('invitations : liste et création (POST { email, role })', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: { data: [{ id: 'i1', status: 'pending', email: 'j@c.com', role: 'editor' }] } },
      { status: 201, body: { id: 'i2', status: 'pending', email: 'k@c.com', role: 'viewer' } },
    ])
    await expect(listProjectInvites({ token: 't', projectId: 'proj1', fetchImpl: impl })).resolves.toHaveLength(1)
    await expect(createProjectInvite({ token: 't', projectId: 'proj1', fetchImpl: impl }, { email: 'k@c.com', role: 'viewer' })).resolves.toMatchObject({ id: 'i2' })
    expect(calls[1].url).toBe('https://api.sanity.io/v2025-07-11/access/project/proj1/invites')
    expect(calls[1].init.method).toBe('POST')
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ email: 'k@c.com', role: 'viewer' })
  })

  it('traduit les erreurs (401/403, 409, 4xx, 5xx, réseau, réponse inattendue)', async () => {
    const deps = (status: number, body?: unknown) => ({ token: 't', projectId: 'proj1', fetchImpl: fakeFetch([{ status, body }]).impl })
    await expect(listProjectUsers(deps(401))).rejects.toMatchObject({ code: 'forbidden' })
    await expect(listProjectUsers(deps(403))).rejects.toMatchObject({ code: 'forbidden' })
    await expect(createProjectInvite(deps(409), { email: 'a@b.c', role: 'editor' })).rejects.toMatchObject({ code: 'conflict' })
    await expect(createProjectInvite(deps(400, { message: 'Invalid role' }), { email: 'a@b.c', role: 'x' })).rejects.toMatchObject({
      code: 'bad_request',
      message: 'Sanity refused: Invalid role',
    })
    await expect(listProjectUsers(deps(502))).rejects.toMatchObject({ code: 'unavailable' })
    await expect(listProjectUsers(deps(200, { nope: true }))).rejects.toMatchObject({ code: 'unavailable' })
    const broken = { token: 't', projectId: 'proj1', fetchImpl: (async () => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch }
    await expect(listProjectUsers(broken)).rejects.toBeInstanceOf(TeamApiError)
  })

  it('refuse un id de projet suspect sans appel réseau', async () => {
    const { impl } = fakeFetch([])
    await expect(listProjectUsers({ token: 't', projectId: '../x', fetchImpl: impl })).rejects.toMatchObject({ code: 'bad_request' })
    expect(impl).not.toHaveBeenCalled()
  })

  it('lien de gestion des membres', () => {
    expect(sanityManageMembersUrl('proj1')).toBe('https://www.sanity.io/manage/project/proj1/members')
  })
})
