import { describe, expect, it, vi } from 'vitest'

import type { Session } from '@/admin/core/contracts'

import { inviteMember } from './invite'

const base: Session = {
  user: { id: 'm', name: 'Marie', email: 'marie@conduit.com' },
  role: 'client',
  sanityRoles: ['administrator'],
  sanityToken: 'user-token',
  dev: false,
  expiresAt: '2099-01-01T00:00:00Z',
}

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ id: 'i1', status: 'pending', email: 'julie@conduit.com', role: 'editor' }), { status: 201 })) as unknown as typeof fetch
}

describe('inviteMember', () => {
  it('invite avec le jeton de l’utilisateur (e-mail normalisé)', async () => {
    const fetchImpl = okFetch()
    await expect(inviteMember(base, { email: '  Julie@Conduit.com ', role: 'editor' }, { projectId: 'proj1', fetchImpl })).resolves.toEqual({
      ok: true,
      message: 'Invitation sent to julie@conduit.com as Editor.',
    })
    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(JSON.parse(String(init.body))).toEqual({ email: 'julie@conduit.com', role: 'editor' })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer user-token')
  })

  it('refuse sans jeton utilisateur (session de dev) ou sans rôle Administrator, sans appel', async () => {
    const fetchImpl = okFetch()
    await expect(inviteMember({ ...base, sanityToken: null, dev: true }, { email: 'a@b.co', role: 'editor' }, { projectId: 'p', fetchImpl })).resolves.toEqual({
      ok: false,
      error: 'Sign in with Sanity to manage the team.',
    })
    await expect(inviteMember({ ...base, sanityRoles: ['editor'] }, { email: 'a@b.co', role: 'editor' }, { projectId: 'p', fetchImpl })).resolves.toMatchObject({ ok: false })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('valide l’entrée (zod) : e-mail, rôle de la liste', async () => {
    const fetchImpl = okFetch()
    await expect(inviteMember(base, { email: 'not-an-email', role: 'editor' }, { projectId: 'p', fetchImpl })).resolves.toMatchObject({ ok: false, field: 'email' })
    await expect(inviteMember(base, { email: 'a@b.co', role: 'owner' }, { projectId: 'p', fetchImpl })).resolves.toMatchObject({ ok: false, field: 'role' })
    await expect(inviteMember(base, null, { projectId: 'p', fetchImpl })).resolves.toMatchObject({ ok: false })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rend le message de Sanity en cas de refus', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 409 })) as unknown as typeof fetch
    await expect(inviteMember(base, { email: 'a@b.co', role: 'editor' }, { projectId: 'p', fetchImpl })).resolves.toEqual({
      ok: false,
      error: 'This person already has an invitation or is already a member.',
    })
  })
})
