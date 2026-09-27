import { ADMIN_HOME, AUTH_MESSAGES, DEV_ROLE_OFF } from '@/admin/core/auth/constants'
import { parseAdminRole } from '@/admin/core/auth/dev'
import { sanitizeNextPath } from '@/admin/core/auth/next-path'
import { isSameOriginRequest } from '@/admin/core/auth/request'
import { getDevLoginState, jsonError, writeDevRoleCookie } from '@/admin/core/auth/session'

/**
 * POST /admin/api/auth/dev-role { role: 'kuartz' | 'client' | 'editor' | 'off', next? } — DÉVELOPPEMENT SEULEMENT.
 * Sélecteur de rôle de la session de dev (menu utilisateur, A1 en dev). 404 dès que ADMIN_DEV_AUTOLOGIN n'est pas
 * permis pour cette requête (NODE_ENV, hôte local). Sans effet sur une vraie session Sanity (elle reste prioritaire).
 * JSON → { ok, role } ; formulaire HTML → 303 vers `next` (ou /admin).
 */
export async function POST(request: Request) {
  const state = await getDevLoginState()
  if (!state.available) return jsonError(404, 'not_found', 'Not found')
  if (!isSameOriginRequest(request.headers)) return jsonError(403, 'forbidden', AUTH_MESSAGES.badOrigin)

  const isJson = request.headers.get('content-type')?.includes('application/json') ?? false
  let rawRole: unknown
  let rawNext: unknown
  if (isJson) {
    const body = (await request.json().catch(() => null)) as { role?: unknown; next?: unknown } | null
    rawRole = body?.role
    rawNext = body?.next
  } else {
    const form = await request.formData().catch(() => null)
    rawRole = form?.get('role')
    rawNext = form?.get('next')
  }

  const role = rawRole === DEV_ROLE_OFF ? DEV_ROLE_OFF : parseAdminRole(typeof rawRole === 'string' ? rawRole : null)
  if (!role) return jsonError(400, 'bad_request', 'Unknown role.')
  await writeDevRoleCookie(role)

  if (isJson) return Response.json({ ok: true, role }, { headers: { 'cache-control': 'no-store' } })
  const next = typeof rawNext === 'string' ? sanitizeNextPath(rawNext) : ADMIN_HOME
  return new Response(null, { status: 303, headers: { Location: next, 'cache-control': 'no-store' } })
}
