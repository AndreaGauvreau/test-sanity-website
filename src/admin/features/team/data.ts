import 'server-only'

import type { Session } from '@/admin/core/contracts'
import { parseKuartzAllowlist } from '@/admin/core/contracts/roles'
import { readSanityEnv } from '@/admin/core/sanity/env'

import { TeamApiError, listProjectInvites, listProjectUsers, type AccessDeps } from './access-api'
import { buildTeam, type PendingInvite, type TeamMember, type TeamSummary } from './members'

/**
 * Données de B4 (et de la carte Team de B1), lues avec le jeton Sanity de l'UTILISATEUR, côté serveur seulement.
 * Session de développement (pas de jeton utilisateur) : état explicite `no-token`, jamais de repli sur un jeton robot
 * (le jeton robot est Editor : il ne lit pas les membres, et ce ne serait pas l'identité de la personne).
 */

export type TeamState =
  | { kind: 'no-token' }
  | { kind: 'error'; code: TeamApiError['code']; message: string }
  | { kind: 'ok'; members: TeamMember[]; pending: PendingInvite[]; summary: TeamSummary; canInvite: boolean }

export async function loadTeam(session: Session, fetchImpl?: typeof fetch): Promise<TeamState> {
  if (!session.sanityToken) return { kind: 'no-token' }
  const deps: AccessDeps = { token: session.sanityToken, projectId: readSanityEnv().projectId, fetchImpl }
  try {
    const users = await listProjectUsers(deps)
    // Les invitations ne servent qu'au « invited by » et à la liste des invitations en attente : leur échec ne bloque pas l'écran.
    const invites = await listProjectInvites(deps).catch(() => [])
    // Tag KUARTZ : même liste blanche que le rôle `kuartz` de l'admin (FOLLOWUPS #40), lue ici, côté serveur.
    const allowlist = parseKuartzAllowlist(process.env.KUARTZ_ALLOWLIST)
    const team = buildTeam(users, invites, deps.projectId, { allowlist, currentUserId: session.user.id })
    // Inviter = rôle Administrator dans Sanity (le seul qui gère les membres), c'est-à-dire le client admin.
    return { kind: 'ok', ...team, canInvite: session.sanityRoles.includes('administrator') }
  } catch (err) {
    if (err instanceof TeamApiError) return { kind: 'error', code: err.code, message: err.message }
    console.error('[admin/team] loading members failed:', err instanceof Error ? err.message : err)
    return { kind: 'error', code: 'unavailable', message: "Sanity isn't responding. Please try again in a moment." }
  }
}

/** Carte Team de B1 : résumé seulement (null si indisponible). */
export async function loadTeamSummary(session: Session, fetchImpl?: typeof fetch): Promise<TeamSummary | null | 'no-token'> {
  const state = await loadTeam(session, fetchImpl)
  if (state.kind === 'no-token') return 'no-token'
  return state.kind === 'ok' ? state.summary : null
}
