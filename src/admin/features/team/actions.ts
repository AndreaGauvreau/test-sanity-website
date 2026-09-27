'use server'

import { refresh } from 'next/cache'

import { requireCapability } from '@/admin/core/auth/session'
import { readSanityEnv } from '@/admin/core/sanity/env'

import { inviteMember, type InviteResult } from './invite'

/**
 * Server action de B4 : inviter un membre dans le projet Sanity. `settings.team` (client admin) EN PREMIER,
 * entrée validée par zod (invite.ts), jeton de l'utilisateur seulement. Rafraîchit l'écran pour montrer l'invitation.
 */
export async function inviteMemberAction(input: unknown): Promise<InviteResult> {
  try {
    const session = await requireCapability('settings.team', 'action')
    const result = await inviteMember(session, input, { projectId: readSanityEnv().projectId })
    if (result.ok) refresh()
    return result
  } catch (err) {
    const name = (err as { name?: unknown } | null)?.name
    if (name === 'AdminAuthError') return { ok: false, error: (err as Error).message }
    console.error('[admin/team] invite failed:', err instanceof Error ? err.message : err)
    return { ok: false, error: "Couldn't send the invitation. Please try again." }
  }
}
