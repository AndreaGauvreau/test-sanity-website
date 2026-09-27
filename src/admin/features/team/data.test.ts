import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Session } from '@/admin/core/contracts'

vi.mock('server-only', () => ({}))

const { loadTeam, loadTeamSummary } = await import('./data')

const session: Session = {
  user: { id: 'm', name: 'Marie', email: 'marie@conduit.com' },
  role: 'client',
  sanityRoles: ['administrator'],
  sanityToken: 'user-token',
  dev: false,
  expiresAt: '2099-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'proj1')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'development')
})

function routeFetch(routes: Record<string, { status: number; body?: unknown }>) {
  return vi.fn(async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname.split('/').pop() as string
    const r = routes[path] ?? { status: 404 }
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status })
  }) as unknown as typeof fetch
}

describe('loadTeam', () => {
  it('session de dev sans jeton : état « no-token », aucun appel', async () => {
    const fetchImpl = routeFetch({})
    await expect(loadTeam({ ...session, sanityToken: null, dev: true }, fetchImpl)).resolves.toEqual({ kind: 'no-token' })
    await expect(loadTeamSummary({ ...session, sanityToken: null, dev: true }, fetchImpl)).resolves.toBe('no-token')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('membres lus ; les invitations indisponibles ne bloquent pas ; Administrator peut inviter', async () => {
    const fetchImpl = routeFetch({
      users: {
        status: 200,
        body: { data: [{ sanityUserId: 'm', profile: { displayName: 'Marie', email: 'marie@conduit.com' }, memberships: [{ resourceType: 'project', resourceId: 'proj1', roleNames: ['administrator'] }] }] },
      },
      invites: { status: 500 },
    })
    const state = await loadTeam(session, fetchImpl)
    expect(state).toMatchObject({ kind: 'ok', canInvite: true, summary: { members: 1, kuartz: 0 } })
    await expect(loadTeam({ ...session, sanityRoles: ['developer'], role: 'kuartz' }, fetchImpl)).resolves.toMatchObject({ canInvite: false })
  })

  it('FOLLOWUPS #40 (B4) : tag KUARTZ d’après KUARTZ_ALLOWLIST du serveur', async () => {
    const membership = (roles: string[]) => [{ resourceType: 'project', resourceId: 'proj1', roleNames: roles }]
    const fetchImpl = routeFetch({
      users: {
        status: 200,
        body: {
          data: [
            { sanityUserId: 'm', profile: { displayName: 'Marie', email: 'marie@conduit.com' }, memberships: membership(['administrator']) },
            { sanityUserId: 'a', profile: { displayName: 'Andrea', email: 'andrea@kuartz.studio' }, memberships: membership(['developer']) },
            { sanityUserId: 'd', profile: { displayName: 'Dev', email: 'dev@agency.com' }, memberships: membership(['developer']) },
          ],
        },
      },
      invites: { status: 200, body: { data: [] } },
    })
    vi.stubEnv('KUARTZ_ALLOWLIST', '@kuartz.studio')
    const state = await loadTeam(session, fetchImpl)
    if (state.kind !== 'ok') throw new Error(`état inattendu : ${state.kind}`)
    expect(state.members.map((m) => [m.id, m.kuartz])).toEqual([
      ['m', false],
      ['d', false],
      ['a', true],
    ])
    vi.stubEnv('KUARTZ_ALLOWLIST', '')
    await expect(loadTeam(session, fetchImpl)).resolves.toMatchObject({ summary: { members: 3, kuartz: 0 } })
  })

  it('refus de Sanity : état d’erreur explicite', async () => {
    await expect(loadTeam(session, routeFetch({ users: { status: 403 } }))).resolves.toMatchObject({ kind: 'error', code: 'forbidden' })
    await expect(loadTeam(session, routeFetch({ users: { status: 503 } }))).resolves.toMatchObject({ kind: 'error', code: 'unavailable' })
    await expect(loadTeamSummary(session, routeFetch({ users: { status: 503 } }))).resolves.toBeNull()
  })
})
