/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('./actions', () => ({ inviteMemberAction: vi.fn(async () => ({ ok: false, error: 'not in tests' })) }))

const { TeamScreen } = await import('./TeamScreen')
const { InviteControl } = await import('./InviteControl')
import { parseKuartzAllowlist } from '@/admin/core/contracts/roles'

import { buildTeam } from './members'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(cleanup)

const MANAGE = 'https://www.sanity.io/manage/project/p/members'
const team = buildTeam(
  [
    { sanityUserId: 'm', profile: { displayName: 'Marie Dupont', email: 'marie@conduit.com' }, memberships: [{ resourceType: 'project', resourceId: 'p', roleNames: ['administrator'] }] },
    { sanityUserId: 'a', profile: { displayName: 'Andrea', email: 'andrea@kuartz.studio' }, memberships: [{ resourceType: 'project', resourceId: 'p', roleNames: ['developer'] }] },
  ],
  [{ id: 'i', status: 'accepted', inviterId: 'm', inviteeId: 'a' }],
  'p',
  { allowlist: parseKuartzAllowlist('@kuartz.studio') },
)

describe('TeamScreen (B4)', () => {
  it('liste des membres : nom, e-mail, tag KUARTZ, rôle · invited by ; lien « Invite in Sanity »', () => {
    render(<TeamScreen state={{ kind: 'ok', ...team, canInvite: false }} siteName="Conduit" manageUrl={MANAGE} />)
    const list = screen.getByRole('list', { name: 'Members' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('Marie Dupont')
    expect(items[0].textContent).toContain('Administrator · owner')
    expect(items[1].textContent).toContain('KUARTZ')
    expect(items[1].textContent).toContain('Developer · invited by Marie')
    const link = screen.getByRole('link', { name: /Invite in Sanity/ })
    expect(link.getAttribute('href')).toBe(MANAGE)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.getByText(/Kuartz members are Developers/)).toBeTruthy()
    expect(screen.getByText('Members of the Sanity project “Conduit”, owned by Conduit. Invitations and roles are managed in Sanity.')).toBeTruthy()
  })

  it('Administrator : bouton « Invite » + « Manage in Sanity »', () => {
    render(<TeamScreen state={{ kind: 'ok', ...team, canInvite: true }} siteName="Conduit" manageUrl={MANAGE} />)
    expect(screen.getByRole('button', { name: 'Invite' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Manage in Sanity/ })).toBeTruthy()
  })

  it('session de dev : « Sign in with Sanity to manage the team »', () => {
    render(<TeamScreen state={{ kind: 'no-token' }} siteName="Conduit" manageUrl={MANAGE} />)
    expect(screen.getByRole('heading', { name: 'Sign in with Sanity to manage the team' })).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Sign in with Sanity' })
    expect(button.closest('form')?.getAttribute('action')).toBe('/admin/api/auth/logout')
    expect(screen.getByRole('link', { name: /Invite in Sanity/ })).toBeTruthy()
  })

  it('erreurs : droits Sanity insuffisants, Sanity injoignable', () => {
    const { unmount } = render(<TeamScreen state={{ kind: 'error', code: 'forbidden', message: 'Nope.' }} siteName="Conduit" manageUrl={MANAGE} />)
    expect(screen.getByRole('heading', { name: 'Your Sanity role can’t list the members' })).toBeTruthy()
    unmount()
    render(<TeamScreen state={{ kind: 'error', code: 'unavailable', message: 'Down.' }} siteName="Conduit" manageUrl={MANAGE} />)
    expect(screen.getByRole('heading', { name: 'Couldn’t load the team' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Reload' })).toBeTruthy()
  })
})

describe('InviteControl', () => {
  it('ouvre la fenêtre, envoie { email, role }, ferme et annonce le succès', async () => {
    const invite = vi.fn(async () => ({ ok: true as const, message: 'Invitation sent to julie@conduit.com as Editor.' }))
    render(<InviteControl invite={invite} />)
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invite to the Sanity project' })
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'julie@conduit.com' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }))
    await waitFor(() => expect(invite).toHaveBeenCalledWith({ email: 'julie@conduit.com', role: 'editor' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('status').textContent).toBe('Invitation sent to julie@conduit.com as Editor.')
  })

  it('refus : message sous le champ, la fenêtre reste ouverte', async () => {
    const invite = vi.fn(async () => ({ ok: false as const, error: 'Enter a valid email address.', field: 'email' as const }))
    render(<InviteControl invite={invite} />)
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    const dialog = await screen.findByRole('dialog')
    const email = within(dialog).getByLabelText('Email')
    fireEvent.change(email, { target: { value: 'nope' } })
    fireEvent.submit(email.closest('form')!)
    await waitFor(() => expect(within(dialog).getByText('Enter a valid email address.')).toBeTruthy())
    expect(email.getAttribute('aria-invalid')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(email))
  })

  it('Envoyer est désactivé tant que l’e-mail est vide', async () => {
    render(<InviteControl invite={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    const dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByRole('button', { name: 'Send invitation' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
