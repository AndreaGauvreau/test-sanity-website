import { can } from '../contracts/roles'
import type { EngineUser } from '../contracts/session'

import { ENGINE_MESSAGES, engineErrorResponse, isEngineErrorBody } from './errors'
import type { MockEngineRequest, MockEngineResponse } from './mock/types'
import {
  DEFAULT_ENGINE_TIMEOUT_MS,
  filterEngineQuery,
  matchEngineRoute,
  MAX_ENGINE_BODY_BYTES,
  type EngineMethod,
} from './routes'
import { signEngineUser } from './signature'

/**
 * Transport admin → moteur, sans dépendance Next (dépendances injectées) : testable. `server.ts` le lie à
 * l'environnement réel. Toute requête passe par : liste blanche → droit du rôle → corps JSON borné → moteur simulé
 * ou réseau (Bearer ENGINE_SECRET + identité signée) → réponse normalisée (JSON ou image PNG, `no-store`).
 */

export type EngineTransportEnv = {
  ENGINE_URL?: string
  ENGINE_SECRET?: string
  ENGINE_MOCK?: string
  NODE_ENV?: string
}

export type EngineTransportDeps = {
  env: EngineTransportEnv
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>
  mock?: (request: MockEngineRequest) => Promise<MockEngineResponse>
  log?: (message: string) => void
}

export type EngineCall = {
  method: EngineMethod
  segments: readonly string[]
  search?: URLSearchParams
  /** Corps brut (texte JSON) ; absent = pas de corps. */
  body?: string
  user: EngineUser
}

const mockWarned = { production: false }

/**
 * Lit le corps d'une requête du navigateur en s'arrêtant dès `maxBytes` dépassé (null = trop gros).
 * `Content-Length` peut manquer (envoi fragmenté) ou mentir : on compte les octets réellement reçus.
 */
export async function readBodyCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string | null> {
  if (!body) return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    all.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(all)
}

/** Moteur simulé actif ? Jamais en production (refus bruyant). */
export function useMockEngine(env: EngineTransportEnv, log: (m: string) => void = console.error): boolean {
  if (env.ENGINE_MOCK !== '1') return false
  if (env.NODE_ENV === 'production') {
    if (!mockWarned.production) {
      mockWarned.production = true
      log('[admin/engine] ENGINE_MOCK=1 is IGNORED in production.')
    }
    return false
  }
  return true
}

function engineBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

/** Appel d'une route du moteur. Retourne TOUJOURS une Response (les erreurs sont au format EngineErrorBody). */
export async function callEngine(call: EngineCall, deps: EngineTransportDeps): Promise<Response> {
  const match = matchEngineRoute(call.method, call.segments)
  if (!match) return engineErrorResponse(404, 'not_found', ENGINE_MESSAGES.notFound)
  const { route, params } = match
  if (route.capability && !can(call.user.role, route.capability)) {
    return engineErrorResponse(403, 'forbidden', ENGINE_MESSAGES.forbidden)
  }

  let body: string | undefined
  if (call.method === 'POST') {
    const raw = call.body ?? ''
    if (new TextEncoder().encode(raw).length > MAX_ENGINE_BODY_BYTES) {
      return engineErrorResponse(413, 'bad_request', ENGINE_MESSAGES.tooLarge)
    }
    try {
      body = JSON.stringify(raw.trim() === '' ? {} : JSON.parse(raw))
    } catch {
      return engineErrorResponse(400, 'bad_request', ENGINE_MESSAGES.badRequest)
    }
  }
  const query = filterEngineQuery(route, call.search ?? new URLSearchParams())

  // ─ Moteur simulé ─
  const log = deps.log ?? console.error
  if (useMockEngine(deps.env, log)) {
    if (!deps.mock) return engineErrorResponse(503, 'unavailable', ENGINE_MESSAGES.notConfigured)
    const res = await deps.mock({
      method: call.method,
      segments: call.segments,
      params,
      query,
      body: body === undefined ? undefined : JSON.parse(body),
      user: call.user,
    })
    if ('binary' in res) {
      return new Response(res.binary as BodyInit, { status: res.status, headers: { 'content-type': res.contentType, 'cache-control': 'no-store' } })
    }
    return json(res.status, res.json)
  }

  // ─ Moteur réel ─
  const base = engineBaseUrl(deps.env.ENGINE_URL)
  const secret = deps.env.ENGINE_SECRET
  if (!base || !secret) {
    log('[admin/engine] ENGINE_URL or ENGINE_SECRET is missing or invalid.')
    return engineErrorResponse(503, 'unavailable', ENGINE_MESSAGES.notConfigured)
  }
  const qs = query.toString()
  const url = `${base}/${call.segments.map(encodeURIComponent).join('/')}${qs ? `?${qs}` : ''}`
  const headers: Record<string, string> = {
    authorization: `Bearer ${secret}`,
    accept: route.kind === 'image' ? 'image/png' : 'application/json',
    ...(await signEngineUser(call.user, secret)),
  }
  if (body !== undefined) headers['content-type'] = 'application/json'

  let res: Response
  try {
    res = await (deps.fetchImpl ?? fetch)(url, {
      method: call.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(route.timeoutMs ?? DEFAULT_ENGINE_TIMEOUT_MS),
    })
  } catch (err) {
    const timeout = (err as { name?: string })?.name === 'TimeoutError'
    return engineErrorResponse(timeout ? 504 : 502, 'unavailable', timeout ? ENGINE_MESSAGES.timeout : ENGINE_MESSAGES.unavailable)
  }

  // 401 du moteur = Bearer ou signature refusés, donc ENGINE_SECRET différent des deux côtés : c'est une erreur de
  // configuration, pas une session expirée. Ne jamais renvoyer 401 au navigateur (l'interface enverrait vers A1).
  if (res.status === 401) {
    log('[admin/engine] The engine rejected the admin credentials (401): ENGINE_SECRET differs between .env.local and engine/.env.local.')
    await res.body?.cancel().catch(() => {})
    return engineErrorResponse(503, 'unavailable', ENGINE_MESSAGES.notConfigured)
  }

  const type = res.headers.get('content-type') ?? ''
  if (route.kind === 'image' && res.ok) {
    if (!type.startsWith('image/png')) return engineErrorResponse(502, 'internal', ENGINE_MESSAGES.badResponse)
    return new Response(res.body, { status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=300' } })
  }
  if (res.status === 204) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  // Seul du JSON repart vers le navigateur ; jamais les en-têtes du moteur.
  const text = await res.text().catch(() => '')
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    return engineErrorResponse(502, 'internal', ENGINE_MESSAGES.badResponse)
  }
  if (!res.ok && !isEngineErrorBody(parsed)) {
    return engineErrorResponse(res.status >= 400 && res.status < 600 ? res.status : 502, 'internal', ENGINE_MESSAGES.badResponse)
  }
  if (res.status >= 300 && res.status < 400) return engineErrorResponse(502, 'internal', ENGINE_MESSAGES.badResponse)
  if (res.ok && parsed === null) return engineErrorResponse(502, 'internal', ENGINE_MESSAGES.badResponse)
  return json(res.status, parsed)
}
