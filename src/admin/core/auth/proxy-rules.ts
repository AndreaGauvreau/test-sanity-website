import { ADMIN_LOGIN_PATH, AUTH_MESSAGES, REQUEST_PATH_HEADER, SESSION_COOKIE } from './constants'
import { decideDevAutologin, isLocalHost, type DevEnv } from './dev'
import { loginUrlFor } from './next-path'

/**
 * Décisions du proxy Next (`src/proxy.ts`), en fonctions PURES testées sans Next. `src/proxy.ts` ne fait
 * qu'appliquer la décision (NextResponse).
 *
 * Deux modes, exclusifs :
 * - normal (site public + admin) : seul `/admin/**` est concerné ; le reste du site passe sans changement ;
 * - aperçu de l'éditeur (KZ_EDITOR_PREVIEW=1, serveur 4042 lancé par le moteur) : TOUTE requête exige le secret d'aperçu.
 *
 * Le proxy n'est qu'un contrôle optimiste (présence du cookie) : la vraie vérification est `requireSession()`.
 */

export const PREVIEW_COOKIE = 'kz_preview'
export const PREVIEW_QUERY = 'kz_preview'

export type ProxyEnv = DevEnv & {
  KZ_EDITOR_PREVIEW?: string
  ENGINE_PREVIEW_SECRET?: string
  ADMIN_ORIGIN?: string
}

export type ProxyInput = {
  method: string
  pathname: string
  /** Avec le « ? » initial, ou chaîne vide. */
  search: string
  host: string | null
  forwardedHost?: string | null
  cookies: Record<string, string | undefined>
  env: ProxyEnv
}

export type CookieSpec = {
  name: string
  value: string
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'none'
  partitioned?: boolean
  path: string
  maxAge: number
}

export type ProxyDecision =
  | { type: 'next'; requestHeaders?: Record<string, string>; responseHeaders?: Record<string, string> }
  | { type: 'redirect'; location: string; responseHeaders?: Record<string, string>; setCookies?: CookieSpec[] }
  | { type: 'respond'; status: number; body: string; contentType: string; responseHeaders?: Record<string, string> }
  | { type: 'log-and-respond'; log: string; status: number; body: string; contentType: string; responseHeaders?: Record<string, string> }

/** Comparaison à temps constant (pas de sortie anticipée sur le premier caractère différent). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export const ADMIN_SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** Chemins de l'admin accessibles sans session : A1, retour de connexion, routes d'authentification. */
export function isPublicAdminPath(pathname: string): boolean {
  return isUnder(pathname, ADMIN_LOGIN_PATH) || isUnder(pathname, '/admin/auth') || isUnder(pathname, '/admin/api/auth')
}

export function decideProxy(input: ProxyInput): ProxyDecision {
  if (input.env.KZ_EDITOR_PREVIEW === '1') return decidePreview(input)
  return decideAdmin(input)
}

// ─── Mode normal : /admin ────────────────────────────────────────────────────

function decideAdmin(input: ProxyInput): ProxyDecision {
  const { pathname } = input
  if (!isUnder(pathname, '/admin')) return { type: 'next' }

  const responseHeaders = { ...ADMIN_SECURITY_HEADERS }
  // Toujours réécrit : une valeur envoyée par le navigateur n'arrive jamais jusqu'aux pages.
  const requestHeaders = { [REQUEST_PATH_HEADER]: `${pathname}${input.search}` }

  if (isPublicAdminPath(pathname)) return { type: 'next', requestHeaders, responseHeaders }
  if (input.cookies[SESSION_COOKIE]) return { type: 'next', requestHeaders, responseHeaders }

  const dev = decideDevAutologin({
    env: input.env,
    host: input.host,
    forwardedHost: input.forwardedHost,
    devRoleCookie: input.cookies.kz_dev_role,
  })
  if (dev.enabled) return { type: 'next', requestHeaders, responseHeaders }

  if (isUnder(pathname, '/admin/api')) {
    return {
      type: 'respond',
      status: 401,
      body: JSON.stringify({ error: { code: 'unauthorized', message: AUTH_MESSAGES.unauthorized } }),
      contentType: 'application/json',
      responseHeaders: { ...responseHeaders, 'Cache-Control': 'no-store' },
    }
  }
  // Server actions (POST) : pas de redirection ici, requireSession('action') répond elle-même.
  if (input.method !== 'GET' && input.method !== 'HEAD') return { type: 'next', requestHeaders, responseHeaders }
  return { type: 'redirect', location: loginUrlFor(`${pathname}${input.search}`), responseHeaders }
}

// ─── Mode aperçu de l'éditeur (4042) ─────────────────────────────────────────

const PREVIEW_CLOSED_PREFIXES = ['/admin', '/studio', '/api/draft-mode']
const MIN_PREVIEW_SECRET_LENGTH = 16

/** `frame-ancestors` limité à l'origine de l'admin ; « 'none' » si ADMIN_ORIGIN est absent ou invalide. */
export function previewFrameAncestors(adminOrigin: string | undefined): string {
  if (!adminOrigin) return "'none'"
  try {
    const url = new URL(adminOrigin)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== adminOrigin.replace(/\/$/, '')) return "'none'"
    return url.origin
  } catch {
    return "'none'"
  }
}

function decidePreview(input: ProxyInput): ProxyDecision {
  const secret = input.env.ENGINE_PREVIEW_SECRET ?? ''
  const ancestors = previewFrameAncestors(input.env.ADMIN_ORIGIN)
  const responseHeaders: Record<string, string> = {
    'Content-Security-Policy': `frame-ancestors ${ancestors}`,
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  }
  const text = (status: number, body: string): ProxyDecision => ({ type: 'respond', status, body, contentType: 'text/plain; charset=utf-8', responseHeaders })

  if (secret.length < MIN_PREVIEW_SECRET_LENGTH) {
    return {
      type: 'log-and-respond',
      log: '[proxy] KZ_EDITOR_PREVIEW=1 but ENGINE_PREVIEW_SECRET is missing or too short: every request is refused.',
      status: 503,
      body: 'Preview is not configured.',
      contentType: 'text/plain; charset=utf-8',
      responseHeaders,
    }
  }
  if (PREVIEW_CLOSED_PREFIXES.some((p) => isUnder(input.pathname, p))) return text(404, 'Not found')

  const params = new URLSearchParams(input.search)
  const fromQuery = params.get(PREVIEW_QUERY)
  if (fromQuery !== null) {
    if (!timingSafeEqualString(fromQuery, secret)) return text(403, 'Preview access denied.')
    params.delete(PREVIEW_QUERY)
    const rest = params.toString()
    const local = isLocalHost(input.host)
    return {
      type: 'redirect',
      location: `${input.pathname}${rest ? `?${rest}` : ''}`,
      responseHeaders,
      setCookies: [
        {
          name: PREVIEW_COOKIE,
          value: secret,
          httpOnly: true,
          // En local (127.0.0.1:4040 → :4042) l'iframe est « same-site » : Lax suffit. Hébergé : iframe tierce.
          secure: !local,
          sameSite: local ? 'lax' : 'none',
          partitioned: !local,
          path: '/',
          maxAge: 12 * 60 * 60,
        },
      ],
    }
  }

  const cookie = input.cookies[PREVIEW_COOKIE]
  if (cookie && timingSafeEqualString(cookie, secret)) return { type: 'next', responseHeaders }
  return text(403, 'Preview access denied.')
}
