import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { EngineUser } from '../../../src/admin/core/contracts'
import { can, type Capability } from '../../../src/admin/core/contracts'
import { verifyEngineBearer, verifyEngineUser } from '../../../src/admin/core/engine/signature'
import { EngineError, forbidden, notFound } from './errors'

/**
 * Serveur HTTP du moteur (node:http, 127.0.0.1 seulement) et routeur extensible.
 *
 * Chaque requête : Bearer ENGINE_SECRET (temps constant) puis identité signée X-Kz-User / X-Kz-User-Sig
 * (`verifyEngineBearer` + `verifyEngineUser` d'auth-core, même fichier que l'admin) → sinon 401 ; route de la table →
 * sinon 404 ; droit du rôle signé revérifié (`can`, contracts/roles.ts) → sinon 403 ; corps JSON borné (64 Kio).
 * Réponses JSON `no-store` ; erreurs au format `EngineErrorBody` du contrat, messages anglais ; une exception imprévue
 * devient 500 `internal` sans détail (le détail reste dans le journal du moteur).
 *
 * Extensible : engine-publish (`/publish`, `/versions`) et ask-ai (`/ask`) ajoutent leurs routes avec `router.add`.
 */

export const MAX_BODY_BYTES = 64 * 1024

export type RouteContext = {
  user: EngineUser
  params: Record<string, string>
  query: URLSearchParams
  /** Corps JSON (POST), `undefined` si vide. */
  body: unknown
  signal: AbortSignal
}

export type RouteResult =
  | { status?: number; json: unknown }
  | { status?: number; png: Buffer }

export type RouteDef = {
  method: 'GET' | 'POST'
  /** « /editor/jobs/:id/answer » : segments fixes et paramètres `:nom`. */
  path: string
  /** Droit exigé (null = toute identité signée). */
  capability: Capability | null
  /** Validation des paramètres (défaut : segment sûr ^[\w.-]{1,128}$). */
  params?: Record<string, RegExp>
  handler: (ctx: RouteContext) => Promise<RouteResult> | RouteResult
}

export type Router = {
  add(route: RouteDef): void
  match(method: string, pathname: string): { route: RouteDef; params: Record<string, string> } | null
  routes(): readonly RouteDef[]
}

const SAFE_SEGMENT = /^[\w.-]{1,128}$/

export function createRouter(): Router {
  const table: { route: RouteDef; parts: string[] }[] = []
  return {
    add(route) {
      if (!route.path.startsWith('/')) throw new Error(`Route path must start with /: ${route.path}`)
      const parts = route.path.split('/').slice(1)
      const clash = table.find((entry) => entry.route.method === route.method && entry.parts.join('/') === parts.join('/'))
      if (clash) throw new Error(`Route already registered: ${route.method} ${route.path}`)
      table.push({ route, parts })
    },
    match(method, pathname) {
      const segments = pathname.split('/').slice(1)
      if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
      for (const { route, parts } of table) {
        if (route.method !== method || parts.length !== segments.length) continue
        const params: Record<string, string> = {}
        let ok = true
        for (let i = 0; i < parts.length && ok; i++) {
          const part = parts[i]
          let segment: string
          try {
            segment = decodeURIComponent(segments[i])
          } catch {
            ok = false
            break
          }
          // Un segment encodé (%2e%2e) ne doit jamais redevenir « . » ou « .. ».
          if (segment === '.' || segment === '..') {
            ok = false
            break
          }
          if (part.startsWith(':')) {
            const name = part.slice(1)
            const pattern = route.params?.[name] ?? SAFE_SEGMENT
            if (!pattern.test(segment)) ok = false
            else params[name] = segment
          } else if (part !== segment) {
            ok = false
          }
        }
        if (ok) return { route, params }
      }
      return null
    },
    routes: () => table.map((entry) => entry.route),
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new EngineError(413, 'bad_request', 'Request body too large.')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buffer.length
    // Compté en flux : Content-Length peut manquer ou mentir.
    if (size > MAX_BODY_BYTES) throw new EngineError(413, 'bad_request', 'Request body too large.')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return undefined
  const type = String(req.headers['content-type'] ?? '')
  if (type && !/^application\/json\b/i.test(type)) throw new EngineError(415, 'bad_request', 'Expected a JSON body.')
  try {
    return JSON.parse(text)
  } catch {
    throw new EngineError(400, 'bad_request', 'Invalid JSON body.')
  }
}

const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
}

function sendJson(res: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value)
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

function sendError(res: ServerResponse, error: EngineError) {
  sendJson(res, error.status, error.toBody())
}

export type EngineServerOptions = {
  router: Router
  secret: string
  log?: (line: string) => void
}

/** Gestionnaire HTTP (séparé du serveur pour les tests). */
export function createHandler(options: EngineServerOptions) {
  const log = options.log ?? ((line: string) => console.error(line))
  return async (req: IncomingMessage, res: ServerResponse) => {
    const abort = new AbortController()
    res.on('close', () => abort.abort())
    try {
      const method = req.method ?? 'GET'
      const url = new URL(req.url ?? '/', 'http://engine.local')

      // 1. Authentification : Bearer puis identité signée. 401 seulement ici.
      if (!verifyEngineBearer(req.headers.authorization, options.secret)) {
        throw new EngineError(401, 'unauthorized', 'Unauthorized.')
      }
      const headers = { get: (name: string) => { const value = req.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value } }
      const user = await verifyEngineUser(headers, options.secret)
      if (!user) throw new EngineError(401, 'unauthorized', 'Unauthorized.')

      // 2. Route, puis droit du rôle signé.
      const matched = options.router.match(method, url.pathname)
      if (!matched) throw notFound()
      if (matched.route.capability && !can(user.role, matched.route.capability)) throw forbidden()

      // 3. Corps (POST seulement), borné.
      const body = method === 'POST' ? await readBody(req) : undefined
      const result = await matched.route.handler({ user, params: matched.params, query: url.searchParams, body, signal: abort.signal })
      const status = result.status ?? 200
      if ('png' in result) {
        res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'image/png', 'content-length': result.png.length, 'cache-control': 'private, max-age=300' })
        res.end(result.png)
      } else {
        sendJson(res, status, result.json)
      }
    } catch (error) {
      if (res.headersSent) {
        res.destroy()
        return
      }
      if (error instanceof EngineError) return sendError(res, error)
      log(`[engine] ${req.method} ${req.url?.split('?')[0]} → ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
      sendError(res, new EngineError(500, 'internal', 'Internal error of the AI engine.'))
    }
  }
}

export function createEngineServer(options: EngineServerOptions): Server {
  const server = createServer(createHandler(options))
  server.headersTimeout = 20_000
  server.requestTimeout = 60_000
  server.keepAliveTimeout = 5_000
  return server
}
