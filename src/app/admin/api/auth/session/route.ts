import { z } from 'zod'

import { AUTH_MESSAGES } from '@/admin/core/auth/constants'
import { signInWithSid } from '@/admin/core/auth/login'
import { sanitizeNextPath } from '@/admin/core/auth/next-path'
import { isSameOriginRequest } from '@/admin/core/auth/request'
import { jsonError, writeSessionCookie } from '@/admin/core/auth/session'
import { toPublicSession } from '@/admin/core/contracts/session'

/**
 * POST /admin/api/auth/session { sid, next? } — fin de la connexion A1 (appelée par /admin/auth/callback).
 * Échange le sid contre le jeton Sanity, lit le rôle du projet, pose le cookie chiffré `kz_admin`.
 * Réponse : { ok: true, redirect, session: PublicSession } — jamais le jeton.
 */

const bodySchema = z.object({ sid: z.string().min(1).max(512), next: z.string().max(1024).optional() })

export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers)) return jsonError(403, 'forbidden', AUTH_MESSAGES.badOrigin)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, 'bad_request', AUTH_MESSAGES.missingSid)

  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
  if (!projectId || !process.env.ADMIN_SESSION_SECRET) {
    console.error('[admin/auth] NEXT_PUBLIC_SANITY_PROJECT_ID or ADMIN_SESSION_SECRET is missing.')
    return jsonError(500, 'internal', AUTH_MESSAGES.notConfigured)
  }

  const result = await signInWithSid({ projectId, sid: parsed.data.sid })
  if (!result.ok) return jsonError(result.status, result.code, result.message)

  const session = await writeSessionCookie(result.session)
  return Response.json(
    { ok: true, redirect: sanitizeNextPath(parsed.data.next), session: toPublicSession(session) },
    { headers: { 'cache-control': 'no-store' } },
  )
}
