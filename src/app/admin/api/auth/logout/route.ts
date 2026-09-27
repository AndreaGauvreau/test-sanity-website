import { ADMIN_LOGIN_PATH, AUTH_MESSAGES } from '@/admin/core/auth/constants'
import { isSameOriginRequest } from '@/admin/core/auth/request'
import { jsonError, logout } from '@/admin/core/auth/session'

/**
 * POST /admin/api/auth/logout — révoque le jeton Sanity (POST /auth/logout) et efface le cookie.
 * Formulaire HTML → 303 vers /admin/login ; `Accept: application/json` → { ok: true }.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers)) return jsonError(403, 'forbidden', AUTH_MESSAGES.badOrigin)
  await logout()
  if (request.headers.get('accept')?.includes('application/json')) {
    return Response.json({ ok: true, redirect: ADMIN_LOGIN_PATH }, { headers: { 'cache-control': 'no-store' } })
  }
  return new Response(null, { status: 303, headers: { Location: ADMIN_LOGIN_PATH, 'cache-control': 'no-store' } })
}
