'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ROLE_LABEL, type AdminRole } from '@/admin/core/contracts/roles'
import { IconButton, Menu, MenuGroup, MenuItem, useToast } from '@/admin/ui'

export const DEV_ROLE_ENDPOINT = '/admin/api/auth/dev-role'

/**
 * Sélecteur de rôle de DÉVELOPPEMENT (session ADMIN_DEV_AUTOLOGIN seulement) : rendu par la coque uniquement quand
 * la session courante est une session de dev. POST /admin/api/auth/dev-role (auth-core, 404 hors développement),
 * puis `router.refresh()` : layouts et pages serveur se recalculent avec le nouveau rôle.
 */
export function DevRoleMenu({ activeRole, roles }: { activeRole: AdminRole; roles: readonly AdminRole[] }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const choose = async (role: AdminRole) => {
    if (role === activeRole || busy) return
    setBusy(true)
    try {
      const res = await fetch(DEV_ROLE_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ role }),
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      router.refresh()
    } catch {
      toast.show({ type: 'error', message: "Couldn't switch the development role." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Menu
      trigger={<IconButton icon="user" label={`Development role: ${ROLE_LABEL[activeRole]}`} loading={busy} tooltipPlacement="top" />}
      placement="top-end"
      width={200}
    >
      <MenuGroup label="Development role">
        {roles.map((role) => (
          <MenuItem key={role} selected={role === activeRole} onSelect={() => void choose(role)}>
            {ROLE_LABEL[role]}
          </MenuItem>
        ))}
      </MenuGroup>
    </Menu>
  )
}
