import { describe, expect, it } from 'vitest'

import type { AccessInvite, AccessUser } from './access-api'
import { buildTeam, firstName, isKuartzEmail, mainRole, roleTitle, teamCardText } from './members'

const P = 'proj1'
const user = (id: string, name: string | null, email: string | null, roles: string[], addedAt = '2026-01-01', project = P): AccessUser => ({
  sanityUserId: id,
  profile: { displayName: name, email, imageUrl: null },
  memberships: [{ resourceType: 'project', resourceId: project, roleNames: roles, addedAt }],
})
const accepted = (id: string, inviterId: string, inviteeId: string): AccessInvite => ({ id, status: 'accepted', inviterId, inviteeId, role: null, email: null })

describe('rôles et Kuartz', () => {
  it('titres des rôles, rôle principal', () => {
    expect(roleTitle('administrator')).toBe('Administrator')
    expect(roleTitle('content-lead')).toBe('Content lead')
    expect(mainRole(['viewer', 'editor'])).toBe('editor')
    expect(mainRole(['developer', 'administrator'])).toBe('administrator')
    expect(mainRole(['custom'])).toBe('custom')
  })
  it('Kuartz par e-mail ; prénoms', () => {
    expect(isKuartzEmail('Andrea@Kuartz.Studio')).toBe(true)
    expect(isKuartzEmail('andrea@kuartz.studio.evil.com')).toBe(false)
    expect(isKuartzEmail(null)).toBe(false)
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
    const { members, summary } = buildTeam(users, invites, P, 'p')
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
    )
    expect(members.map((m) => m.id)).toEqual(['m'])
    expect(members[0].imageUrl).toBeUndefined()
    expect(members[0].meta).toBe('Administrator · owner')
  })

  it('invitations en attente : e-mail, rôle, qui a invité', () => {
    const { pending } = buildTeam(users, [...invites, { id: 'i9', status: 'pending', email: 'julie@conduit.com', role: 'editor', inviterId: 'm' }, { id: 'i8', status: 'revoked', email: 'x@y.z', role: 'editor' }], P)
    expect(pending).toEqual([{ id: 'i9', email: 'julie@conduit.com', role: 'editor', meta: 'Editor · invited by Marie', kuartz: false }])
  })

  it('un seul membre : « 1 member », aucun Kuartz', () => {
    const { summary } = buildTeam([users[1]], [], P)
    expect(teamCardText(summary)).toEqual({ value: '1 member', hint: 'No one from Kuartz' })
  })
})
