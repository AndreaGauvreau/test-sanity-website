import { describe, expect, it } from 'vitest'

import { can, parseKuartzAllowlist } from '@/admin/core/contracts/roles'
import type { Session } from '@/admin/core/contracts/session'

import { kuartzAllowlistFromEnv, reconcileSessionRole, resolveAdminRole } from './roles'

const NONE = parseKuartzAllowlist('')
const LIST = parseKuartzAllowlist('pKuartzId, andrea@kuartz.studio, @kuartz.studio')
const client = { id: 'u1', email: 'marie@conduit.com' }
const outsider = { id: 'u9', email: 'dev@agence-tierce.com' }

describe('resolveAdminRole (SEC-05)', () => {
  it('mappe les rôles Sanity du projet ; Developer seul = editor', () => {
    expect(resolveAdminRole(['administrator'], client, NONE)).toBe('client')
    expect(resolveAdminRole(['developer'], outsider, NONE)).toBe('editor')
    expect(resolveAdminRole(['editor'], client, NONE)).toBe('editor')
  })
  it('régression SEC-05 : un Developer invité par le client, hors liste, n’est PAS kuartz', () => {
    const role = resolveAdminRole(['developer'], outsider, LIST)
    expect(role).toBe('editor')
    expect(can(role!, 'settings.code')).toBe(false)
    // Même Administrator + Developer hors liste : client, jamais kuartz.
    expect(resolveAdminRole(['administrator', 'developer'], outsider, LIST)).toBe('client')
  })
  it('kuartz = Developer ou Administrator ET membre de la liste (id, e-mail, domaine)', () => {
    expect(resolveAdminRole(['developer'], { id: 'pKuartzId', email: '' }, LIST)).toBe('kuartz')
    expect(resolveAdminRole(['developer'], { id: 'x', email: 'Andrea@Kuartz.Studio' }, LIST)).toBe('kuartz')
    expect(resolveAdminRole(['administrator'], { id: 'y', email: 'lea@kuartz.studio' }, LIST)).toBe('kuartz')
    // Membre de la liste mais simple Editor dans Sanity : reste editor.
    expect(resolveAdminRole(['editor'], { id: 'pKuartzId', email: 'andrea@kuartz.studio' }, LIST)).toBe('editor')
    // Domaines voisins : refusés.
    expect(resolveAdminRole(['developer'], { id: 'z', email: 'a@evil-kuartz.studio' }, LIST)).toBe('editor')
    expect(resolveAdminRole(['developer'], { id: 'z', email: 'a@kuartz.studio.evil.com' }, LIST)).toBe('editor')
  })
  it('refuse Viewer, rôle inconnu, liste vide, clés du prototype, valeurs non textuelles', () => {
    expect(resolveAdminRole(['viewer'], client, LIST)).toBeNull()
    expect(resolveAdminRole(['contributor', 'custom-role'], client, LIST)).toBeNull()
    expect(resolveAdminRole([], client, LIST)).toBeNull()
    expect(resolveAdminRole(['constructor', '__proto__', 'toString'], client, LIST)).toBeNull()
    expect(resolveAdminRole([null, 3, { name: 'developer' }], client, LIST)).toBeNull()
  })
  it('ignore la casse et les espaces', () => {
    expect(resolveAdminRole([' Administrator '], client, NONE)).toBe('client')
  })
  it('liste lue dans KUARTZ_ALLOWLIST (absente = personne)', () => {
    expect(kuartzAllowlistFromEnv(undefined)).toEqual({ ids: [], emails: [], domains: [] })
    expect(kuartzAllowlistFromEnv('@kuartz.studio').domains).toEqual(['kuartz.studio'])
  })
})

describe('reconcileSessionRole', () => {
  const base: Session = {
    user: { id: 'u9', name: 'Tiers', email: 'dev@agence-tierce.com' },
    role: 'kuartz',
    sanityRoles: ['developer'],
    sanityToken: 'tok',
    dev: false,
    expiresAt: '2026-09-28T00:00:00.000Z',
  }
  it('régression SEC-05 : un cookie scellé avant le correctif (Developer → kuartz) redevient editor', () => {
    expect(reconcileSessionRole(base, LIST)?.role).toBe('editor')
  })
  it('membre de la liste : kuartz conservé (même objet)', () => {
    const member = { ...base, user: { ...base.user, email: 'andrea@kuartz.studio' } }
    expect(reconcileSessionRole(member, LIST)).toBe(member)
  })
  it('rôle Sanity devenu inconnu → plus de session ; session de dev inchangée', () => {
    expect(reconcileSessionRole({ ...base, sanityRoles: ['viewer'] }, LIST)).toBeNull()
    const dev = { ...base, dev: true, sanityToken: null }
    expect(reconcileSessionRole(dev, NONE)).toBe(dev)
  })
})

describe('droits (contrat roles.ts)', () => {
  it('diff et rollback réservés à Kuartz, Team au client', () => {
    expect(can('kuartz', 'publish.diff')).toBe(true)
    expect(can('client', 'publish.diff')).toBe(false)
    expect(can('editor', 'versions.rollback')).toBe(false)
    expect(can('client', 'settings.team')).toBe(true)
    expect(can('editor', 'settings.team')).toBe(false)
    expect(can('editor', 'ai.editor')).toBe(true)
  })
})
