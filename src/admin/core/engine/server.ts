import 'server-only'

import type { Session } from '../contracts/session'

import { EngineRequestError, ENGINE_MESSAGES, isEngineErrorBody } from './errors'
import { handleMockEngineRequest } from './mock'
import type { EngineMethod } from './routes'
import { toEngineUser } from './signature'
import { callEngine, type EngineTransportDeps } from './transport'

/**
 * Canal serveur vers le moteur IA. SERVEUR SEULEMENT (ENGINE_SECRET et ENGINE_IDENTITY_PRIVATE_KEY ne quittent jamais
 * le serveur).
 * - `engineFetch` : pour les Server Components / server actions (JSON typé, lève EngineRequestError) ;
 * - `relayEngineRequest` : pour le relais /admin/api/engine/[...path] (renvoie la Response telle quelle).
 * Les deux passent par la liste blanche (routes.ts) et le contrôle des droits du rôle.
 */

function deps(): EngineTransportDeps {
  return {
    env: {
      ENGINE_URL: process.env.ENGINE_URL,
      ENGINE_SECRET: process.env.ENGINE_SECRET,
      ENGINE_IDENTITY_PRIVATE_KEY: process.env.ENGINE_IDENTITY_PRIVATE_KEY,
      ENGINE_MOCK: process.env.ENGINE_MOCK,
      NODE_ENV: process.env.NODE_ENV,
    },
    mock: handleMockEngineRequest,
  }
}

export function relayEngineRequest(input: {
  session: Session
  method: EngineMethod
  segments: readonly string[]
  search?: URLSearchParams
  body?: string
}): Promise<Response> {
  return callEngine({ ...input, user: toEngineUser(input.session) }, deps())
}

/**
 * Appel JSON typé. `path` : « editor/state », « publish/status »… (sans / initial) ; `query` : paramètres permis
 * par la route. Exemple : `await engineFetch<PublishStatus>(session, 'GET', 'publish/status')`.
 */
export async function engineFetch<T>(
  session: Session,
  method: EngineMethod,
  path: string,
  options: { body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const res = await relayEngineRequest({
    session,
    method,
    segments: path.split('/').filter(Boolean),
    search: new URLSearchParams(options.query ?? {}),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const parsed = res.status === 204 ? null : await res.json().catch(() => undefined)
  if (!res.ok) {
    if (isEngineErrorBody(parsed)) throw new EngineRequestError(res.status, parsed.error.code, parsed.error.message)
    throw new EngineRequestError(res.status, 'internal', ENGINE_MESSAGES.badResponse)
  }
  return parsed as T
}
