import type { Session } from '@/admin/core/contracts/session'

import { AUTH_MESSAGES } from './constants'
import { resolveAdminRole, type KuartzAllowlist } from './roles'
import { exchangeSid, fetchSanityMe, revokeSanityToken, SanityAuthError, type FetchLike } from './sanity-auth'

/**
 * Connexion A1 côté serveur : sid → jeton → /users/me → rôle de l'admin. Pur (fetch et liste blanche injectés).
 * Le rôle « kuartz » exige la liste blanche de Kuartz (SEC-05, voir roles.ts) : un Developer hors liste = editor.
 * Un compte sans rôle d'admin (Viewer, rôle personnalisé, non-membre) est refusé ET son jeton est révoqué
 * aussitôt : on ne garde jamais un jeton qui n'ouvre pas de session.
 */

export type SignInResult =
  | { ok: true; session: Omit<Session, 'expiresAt'> }
  | { ok: false; status: 400 | 401 | 403 | 502; code: 'bad_request' | 'unauthorized' | 'forbidden' | 'unavailable'; message: string }

const ROLE_TITLES: Record<string, string> = { viewer: 'Viewer', contributor: 'Contributor' }

export async function signInWithSid(input: {
  projectId: string
  sid: string
  /** Liste blanche de Kuartz (route : `kuartzAllowlistFromEnv()`). */
  allowlist: KuartzAllowlist
  fetchImpl?: FetchLike
}): Promise<SignInResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  let token: string
  try {
    token = await exchangeSid(input.projectId, input.sid, fetchImpl)
  } catch (err) {
    return failure(err)
  }

  let me
  try {
    me = await fetchSanityMe(input.projectId, token, fetchImpl)
  } catch (err) {
    await revokeSanityToken(input.projectId, token, fetchImpl)
    return failure(err)
  }

  const role = resolveAdminRole(me.roles, me, input.allowlist)
  if (!role) {
    await revokeSanityToken(input.projectId, token, fetchImpl)
    const message =
      me.roles.length === 0
        ? AUTH_MESSAGES.notMember
        : AUTH_MESSAGES.roleDenied(me.roles.map((r) => ROLE_TITLES[r.toLowerCase()] ?? r).join(', '))
    return { ok: false, status: 403, code: 'forbidden', message }
  }

  return {
    ok: true,
    session: {
      user: { id: me.id, name: me.name, email: me.email, ...(me.imageUrl ? { imageUrl: me.imageUrl } : {}) },
      role,
      sanityRoles: me.roles,
      sanityToken: token,
      dev: false,
    },
  }
}

function failure(err: unknown): SignInResult {
  if (err instanceof SanityAuthError) {
    if (err.kind === 'unavailable') return { ok: false, status: 502, code: 'unavailable', message: err.message }
    return { ok: false, status: 401, code: 'unauthorized', message: err.message }
  }
  return { ok: false, status: 502, code: 'unavailable', message: AUTH_MESSAGES.sanityUnavailable }
}
