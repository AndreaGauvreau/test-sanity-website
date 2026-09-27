import { describe, expect, it } from 'vitest'

import { adminConfig } from '@/admin.config'
import { ADMIN_ROLES, type AdminRole } from '@/admin/core/contracts/roles'

import { DEFAULT_KUARTZ_HUB_URL } from './nav'
import { buildShellSidebarProps } from './sidebar-props'

function session(role: AdminRole, dev = false, imageUrl?: string) {
  return { user: { id: 'u1', name: 'Marie', email: 'marie@conduit.com', imageUrl }, role, dev }
}

const counts = { blog: 12, testimonials: 3, faq: 9 }

describe('buildShellSidebarProps', () => {
  it('Kuartz : lien hub (configurable), Ask AI, avatar bleu, « Kuartz »', () => {
    const props = buildShellSidebarProps({ config: adminConfig, session: session('kuartz'), counts, hubUrlEnv: 'https://hub.example.com' })
    expect(props.hubUrl).toBe('https://hub.example.com/')
    expect(props.askAi).toBe(true)
    expect(props.user).toEqual({ name: 'Marie', roleLabel: 'Kuartz', imageUrl: undefined, tone: 'blue' })
    expect(props.site).toEqual({ name: 'Conduit', domain: 'conduit.com' })
  })

  it('client et editor : pas de lien vers le hub ; avatar vert / neutre', () => {
    const client = buildShellSidebarProps({ config: adminConfig, session: session('client'), counts, hubUrlEnv: 'https://hub.example.com' })
    expect(client.hubUrl).toBeUndefined()
    expect(client.user).toMatchObject({ roleLabel: 'Client admin', tone: 'green' })
    const editor = buildShellSidebarProps({ config: adminConfig, session: session('editor'), counts })
    expect(editor.hubUrl).toBeUndefined()
    expect(editor.user).toMatchObject({ roleLabel: 'Editor', tone: 'neutral' })
  })

  it('hub non configuré → site de Kuartz', () => {
    expect(buildShellSidebarProps({ config: adminConfig, session: session('kuartz'), counts }).hubUrl).toBe(DEFAULT_KUARTZ_HUB_URL)
  })

  it('sélecteur de rôle : session de dev ET autologin permis seulement', () => {
    const devState = { available: true, roles: ADMIN_ROLES }
    expect(buildShellSidebarProps({ config: adminConfig, session: session('client', true), counts, devState }).devRole).toEqual({
      active: 'client',
      roles: ADMIN_ROLES,
    })
    expect(buildShellSidebarProps({ config: adminConfig, session: session('client', false), counts, devState }).devRole).toBeUndefined()
    expect(
      buildShellSidebarProps({ config: adminConfig, session: session('client', true), counts, devState: { available: false, roles: ADMIN_ROLES } })
        .devRole,
    ).toBeUndefined()
  })

  it('aucune donnée sensible vers le client : ni e-mail, ni id, ni champs du manifeste', () => {
    const json = JSON.stringify(buildShellSidebarProps({ config: adminConfig, session: session('kuartz'), counts }))
    expect(json).not.toContain('marie@conduit.com')
    expect(json).not.toContain('"u1"')
    expect(json).not.toContain('maxLength')
  })

  it('image d’avatar : https seulement', () => {
    expect(buildShellSidebarProps({ config: adminConfig, session: session('client', false, 'https://cdn.sanity.io/a.png'), counts }).user.imageUrl).toBe(
      'https://cdn.sanity.io/a.png',
    )
    expect(buildShellSidebarProps({ config: adminConfig, session: session('client', false, 'javascript:x'), counts }).user.imageUrl).toBeUndefined()
  })
})
