import { describe, expect, it } from 'vitest'

import { can } from '@/admin/core/contracts/roles'

import { resolveAdminRole } from './roles'

describe('resolveAdminRole', () => {
  it('mappe les rôles Sanity du projet', () => {
    expect(resolveAdminRole(['administrator'])).toBe('client')
    expect(resolveAdminRole(['developer'])).toBe('kuartz')
    expect(resolveAdminRole(['editor'])).toBe('editor')
  })
  it('garde le plus fort quand il y en a plusieurs', () => {
    expect(resolveAdminRole(['editor', 'administrator'])).toBe('client')
    expect(resolveAdminRole(['administrator', 'developer'])).toBe('kuartz')
  })
  it('refuse Viewer, rôle inconnu, liste vide, clés du prototype', () => {
    expect(resolveAdminRole(['viewer'])).toBeNull()
    expect(resolveAdminRole(['contributor', 'custom-role'])).toBeNull()
    expect(resolveAdminRole([])).toBeNull()
    expect(resolveAdminRole(['constructor', '__proto__', 'toString'])).toBeNull()
  })
  it('ignore la casse et les espaces', () => {
    expect(resolveAdminRole([' Administrator '])).toBe('client')
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
