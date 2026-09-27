import { z } from 'zod'

import type { Session } from '@/admin/core/contracts'

import { TeamApiError, createProjectInvite, type AccessDeps } from './access-api'
import { INVITE_ROLES, roleTitle } from './members'

/**
 * Cœur de l'invitation (B4), sans Next : entrée validée par zod, droits revérifiés (Administrator dans Sanity,
 * jeton de l'utilisateur présent), puis POST à l'API d'accès. Le vrai refus final reste celui de Sanity.
 */

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  role: z.enum(INVITE_ROLES.map((r) => r.value) as [string, ...string[]]),
})

export type InviteResult = { ok: true; message: string } | { ok: false; error: string; field?: 'email' | 'role' }

export async function inviteMember(
  session: Session,
  input: unknown,
  deps: { projectId: string; fetchImpl?: typeof fetch },
): Promise<InviteResult> {
  if (!session.sanityToken) return { ok: false, error: 'Sign in with Sanity to manage the team.' }
  if (!session.sanityRoles.includes('administrator')) {
    return { ok: false, error: 'Only a Sanity Administrator can invite people. Use “Invite in Sanity” instead.' }
  }
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    return field === 'role'
      ? { ok: false, error: 'Choose a role.', field: 'role' }
      : { ok: false, error: 'Enter a valid email address.', field: 'email' }
  }
  const access: AccessDeps = { token: session.sanityToken, projectId: deps.projectId, fetchImpl: deps.fetchImpl }
  try {
    await createProjectInvite(access, parsed.data)
    return { ok: true, message: `Invitation sent to ${parsed.data.email} as ${roleTitle(parsed.data.role)}.` }
  } catch (err) {
    if (err instanceof TeamApiError) return { ok: false, error: err.message }
    throw err
  }
}
