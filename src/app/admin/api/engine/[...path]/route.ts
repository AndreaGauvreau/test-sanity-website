import type { NextRequest } from 'next/server'

import { isSameOriginRequest } from '@/admin/core/auth/request'
import { authErrorResponse, requireSession } from '@/admin/core/auth/session'
import { ENGINE_MESSAGES, engineErrorResponse } from '@/admin/core/engine/errors'
import { MAX_ENGINE_BODY_BYTES, type EngineMethod } from '@/admin/core/engine/routes'
import { relayEngineRequest } from '@/admin/core/engine/server'
import { readBodyCapped } from '@/admin/core/engine/transport'

/**
 * Relais navigateur → moteur IA : /admin/api/engine/<route du contrat engine.ts>.
 * requireSession → liste BLANCHE + droits du rôle (core/engine/routes.ts) → Bearer ENGINE_SECRET + identité signée.
 * Rien d'autre ne passe : ni cookies, ni en-têtes du navigateur, ni routes hors contrat, ni paramètres non permis.
 * Propriétaire : auth-core.
 *
 * Pas de `export const dynamic` : la route lit les cookies (donc dynamique), et cette option est interdite si
 * `cacheComponents` est activé un jour (Next 16).
 */

type Context = { params: Promise<{ path: string[] }> }

async function handle(request: NextRequest, context: Context, method: EngineMethod): Promise<Response> {
  let session
  try {
    session = await requireSession('route')
  } catch (err) {
    return authErrorResponse(err)
  }

  let body: string | undefined
  if (method === 'POST') {
    if (!isSameOriginRequest(request.headers)) return engineErrorResponse(403, 'forbidden', ENGINE_MESSAGES.forbidden)
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (declared > MAX_ENGINE_BODY_BYTES) return engineErrorResponse(413, 'bad_request', ENGINE_MESSAGES.tooLarge)
    const read = await readBodyCapped(request.body, MAX_ENGINE_BODY_BYTES)
    if (read === null) return engineErrorResponse(413, 'bad_request', ENGINE_MESSAGES.tooLarge)
    body = read
  }

  const { path } = await context.params
  return relayEngineRequest({ session, method, segments: path ?? [], search: request.nextUrl.searchParams, body })
}

export function GET(request: NextRequest, context: Context) {
  return handle(request, context, 'GET')
}

export function POST(request: NextRequest, context: Context) {
  return handle(request, context, 'POST')
}
