import { describe, expect, it } from 'vitest'

import { parseKuartzAllowlist } from '@/admin/core/contracts/roles'

import type { AccessInvite, AccessUser } from './access-api'
import { INVITE_ROLES, buildTeam, firstName, mainRole, roleTitle, teamCardText } from './members'

const P = 'proj1'
// Liste blanche du serveur (KUARTZ_ALLOWLIST) : le domaine de Kuartz.
const allowlist = parseKuartzAllowlist('@kuartz.studio')
const NONE = parseKuartzAllowlist('')
const user = (id: string, name: string | null, email: string | null, roles: string[], addedAt = '2026-01-01', project = P): AccessUser => ({
  sanityUserId: id,
  profile: { displayName: name, email, imageUrl: null },
  memberships: [{ resourceType: 'project', resourceId: project, roleNames: roles, addedAt }],
})
const accepted = (id: string, inviterId: string, inviteeId: string): AccessInvite => ({ id, status: 'accepted', inviterId, inviteeId, role: null, email: null })

describe('rôles et Kuartz', () => {
  it('SEC-05 : le client ne peut inviter ni Developer ni aucun rôle qui ouvrirait l’accès Kuartz', () => {
    expect(INVITE_ROLES.map((r) => r.value)).toEqual(['editor', 'administrator', 'viewer'])
  })

  it('titres des rôles, rôle principal', () => {
    expect(roleTitle('administrator')).toBe('Administrator')
    expect(roleTitle('content-lead')).toBe('Content lead')
    expect(mainRole(['viewer', 'editor'])).toBe('editor')
    expect(mainRole(['developer', 'administrator'])).toBe('administrator')
    expect(mainRole(['custom'])).toBe('custom')
  })
  it('prénoms', () => {
    expect(firstName('Marie Dupont')).toBe('Marie')
    expect(firstName('', 'paul@conduit.com')).toBe('paul')
  })
})

describe('buildTeam (Figma B4)', () => {
  const users = [
    user('l', 'Léo', 'leo@kuartz.studio', ['developer'], '2026-02-03'),
    user('m', 'Marie Dupont', 'marie@conduit.com', ['administrator'], '2026-01-01'),
    user('p', 'Paul Martin', 'paul@conduit.com', ['editor'], '2026-02-01'),
    user('a', 'Andrea', 'andrea@kuartz.studio', ['developer'], '2026-02-02'),
  ]
  const invites = [accepted('i1', 'm', 'p'), accepted('i2', 'm', 'a'), accepted('i3', 'm', 'l')]

  it('reproduit la liste du Figma : ordre, rôles, « invited by », « owner », KUARTZ', () => {
    const { members, summary } = buildTeam(users, invites, P, { allowlist, currentUserId: 'p' })
    expect(members.map((m) => [m.name, m.email, m.meta, m.kuartz])).toEqual([
      ['Marie Dupont', 'marie@conduit.com', 'Administrator · owner', false],
      ['Paul Martin', 'paul@conduit.com', 'Editor · invited by Marie', false],
      ['Andrea', 'andrea@kuartz.studio', 'Developer · invited by Marie', true],
      ['Léo', 'leo@kuartz.studio', 'Developer · invited by Marie', true],
    ])
    expect(members.find((m) => m.id === 'p')?.isCurrentUser).toBe(true)
    expect(summary).toEqual({ members: 4, kuartz: 2 })
    expect(teamCardText(summary)).toEqual({ value: '4 members', hint: '2 from Kuartz' })
  })

  it('écarte les robots, les autres projets, les rôles vides ; images https seulement', () => {
    const { members } = buildTeam(
      [
        { sanityUserId: 'robot', profile: { displayName: 'Deploy token' }, memberships: [{ resourceType: 'project', resourceId: P, roleNames: ['editor'] }] },
        user('x', 'Other', 'o@x.com', ['administrator'], '2026-01-01', 'other'),
        user('z', 'Nobody', 'n@x.com', []),
        { ...user('m', 'Marie', 'marie@conduit.com', ['administrator']), profile: { displayName: 'Marie', email: 'marie@conduit.com', imageUrl: 'javascript:alert(1)' } },
      ],
      [],
      P,
      { allowlist },
    )
    expect(members.map((m) => m.id)).toEqual(['m'])
    expect(members[0].imageUrl).toBeUndefined()
    expect(members[0].meta).toBe('Administrator · owner')
  })

  it('invitations en attente : e-mail, rôle, qui a invité', () => {
    const { pending } = buildTeam(users, [...invites, { id: 'i9', status: 'pending', email: 'julie@conduit.com', role: 'editor', inviterId: 'm' }, { id: 'i8', status: 'revoked', email: 'x@y.z', role: 'editor' }], P, { allowlist })
    expect(pending).toEqual([{ id: 'i9', email: 'julie@conduit.com', role: 'editor', meta: 'Editor · invited by Marie', kuartz: false }])
  })

  it('FOLLOWUPS #40 (B4) : tag KUARTZ = liste blanche du serveur, pas le rôle Developer ni l’e-mail seul', () => {
    const outsider = user('d', 'Dev', 'dev@agency.com', ['developer'], '2026-03-01')
    const pendingInvites: AccessInvite[] = [
      { id: 'i5', status: 'pending', email: 'new@kuartz.studio', role: 'viewer' },
      { id: 'i6', status: 'pending', email: 'dev2@agency.com', role: 'developer' },
    ]
    // Developer ajouté par le client hors liste blanche : pas KUARTZ (l'admin le traite en editor).
    const listed = buildTeam([...users, outsider], pendingInvites, P, { allowlist })
    expect(listed.members.find((m) => m.id === 'd')?.kuartz).toBe(false)
    expect(listed.members.filter((m) => m.kuartz).map((m) => m.id)).toEqual(['a', 'l'])
    expect(listed.pending.map((p) => [p.id, p.kuartz])).toEqual([
      ['i5', true],
      ['i6', false],
    ])
    // Liste blanche vide : personne n'est Kuartz, même avec un e-mail @kuartz.studio.
    const empty = buildTeam(users, invites, P, { allowlist: NONE })
    expect(empty.summary).toEqual({ members: 4, kuartz: 0 })
    // Liste par id Sanity : l'e-mail ne compte pas, l'id oui.
    const byId = buildTeam(users, invites, P, { allowlist: parseKuartzAllowlist('l') })
    expect(byId.members.filter((m) => m.kuartz).map((m) => m.id)).toEqual(['l'])
  })

  it('un seul membre : « 1 member », aucun Kuartz', () => {
    const { summary } = buildTeam([users[1]], [], P, { allowlist })
    expect(teamCardText(summary)).toEqual({ value: '1 member', hint: 'No one from Kuartz' })
  })
})
