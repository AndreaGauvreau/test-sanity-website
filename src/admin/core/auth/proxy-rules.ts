import { can, type AdminRole, type Capability } from '@/admin/core/contracts/roles'
import { renewPreviewToken, verifyPreviewToken } from '@/admin/core/engine/preview-token'

import { ADMIN_LOGIN_PATH, AUTH_MESSAGES, REQUEST_PATH_HEADER, SESSION_COOKIE } from './constants'
import { decideDevAutologin, isLocalHost, type DevEnv } from './dev'
import { loginUrlFor } from './next-path'

/**
 * Décisions du proxy Next (`src/proxy.ts`), en fonctions PURES testées sans Next. `src/proxy.ts` ne fait
 * qu'appliquer la décision (NextResponse).
 *
 * Deux modes, exclusifs :
 * - normal (site public + admin) : seul `/admin/**` est concerné ; le reste du site passe sans changement ;
 * - aperçu de l'éditeur (KZ_EDITOR_PREVIEW=1, serveur 4042 lancé par le moteur) : TOUTE requête exige un jeton
 *   d'aperçu COURT (`v1.<exp>.<uid>.<sig>`, core/engine/preview-token.ts) ; le secret racine ENGINE_PREVIEW_SECRET
 *   n'est plus jamais accepté du navigateur (constat SEC-09).
 *
 * Le proxy n'est qu'un contrôle optimiste (présence du cookie) : la vraie vérification est `requireSession()`.
 * Exception : les pages réservées par un droit (PAGE_CAPABILITIES) sont refusées ICI, avant tout rendu, pour
 * répondre une vraie 404 (FOLLOWUPS #21 : sous un loading.tsx, un notFound() de la page part en 200).
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
  /** Heure courante en secondes Unix (tests) ; défaut Date.now(). */
  nowSeconds?: number
  /**
   * Rôle de la requête (cookie `kz_admin` déchiffré et rôle recalculé, sinon session de dev), appelé seulement pour
   * une page de PAGE_CAPABILITIES. null = pas de session (la page redirige elle-même vers A1).
   */
  resolveRole?: () => Promise<AdminRole | null>
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
  | { type: 'next'; requestHeaders?: Record<string, string>; responseHeaders?: Record<string, string>; setCookies?: CookieSpec[] }
  | { type: 'redirect'; location: string; responseHeaders?: Record<string, string>; setCookies?: CookieSpec[] }
  /** Réécriture interne (l'URL affichée ne change pas). */
  | { type: 'rewrite'; location: string; requestHeaders?: Record<string, string>; responseHeaders?: Record<string, string> }
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

/** En-têtes de la page d'essai de l'éditeur (développement seulement) : elle s'affiche dans l'iframe de l'éditeur. */
export const HARNESS_PATH = '/admin/editor/harness'
export const HARNESS_FRAME_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'",
}

/**
 * Pages réservées par un droit : refusées par le proxy (404) AVANT le rendu. La page garde son
 * `requireCapability(...)` en première ligne (défense en profondeur, server actions).
 */
export const PAGE_CAPABILITIES: readonly { prefix: string; capability: Capability }[] = [
  { prefix: '/admin/settings/code', capability: 'settings.code' },
  { prefix: '/admin/settings/team', capability: 'settings.team' },
]

/** Page interne (hors de tout loading.tsx) qui appelle notFound() tout de suite : vraie 404, 404 de l'admin. */
export const ADMIN_DENIED_PATH = '/admin/auth/denied'

export function pageCapabilityFor(pathname: string): Capability | null {
  return PAGE_CAPABILITIES.find((p) => isUnder(pathname, p.prefix))?.capability ?? null
}

export async function decideProxy(input: ProxyInput): Promise<ProxyDecision> {
  if (input.env.KZ_EDITOR_PREVIEW === '1') return decidePreview(input)
  return decideAdmin(input)
}

// ─── Mode normal : /admin ────────────────────────────────────────────────────

async function decideAdmin(input: ProxyInput): Promise<ProxyDecision> {
  const { pathname } = input
  if (!isUnder(pathname, '/admin')) return { type: 'next' }

  // Page d'essai de l'éditeur : affichable dans l'iframe de l'admin (même origine), en développement seulement.
  const harness = input.env.NODE_ENV === 'development' && isUnder(pathname, HARNESS_PATH)
  const responseHeaders = { ...(harness ? HARNESS_FRAME_HEADERS : ADMIN_SECURITY_HEADERS) }
  // Toujours réécrit : une valeur envoyée par le navigateur n'arrive jamais jusqu'aux pages.
  const requestHeaders = { [REQUEST_PATH_HEADER]: `${pathname}${input.search}` }

  if (isPublicAdminPath(pathname)) return { type: 'next', requestHeaders, responseHeaders }

  const dev = input.cookies[SESSION_COOKIE]
    ? null
    : decideDevAutologin({
        env: input.env,
        host: input.host,
        forwardedHost: input.forwardedHost,
        devRoleCookie: input.cookies.kz_dev_role,
      })
  const hasSession = !!input.cookies[SESSION_COOKIE] || !!dev?.enabled

  if (hasSession) {
    // Page réservée par un droit : 404 réelle AVANT le rendu (GET/HEAD seulement ; les server actions ont leur garde).
    const capability = pageCapabilityFor(pathname)
    if (capability && (input.method === 'GET' || input.method === 'HEAD') && input.resolveRole) {
      const role = await input.resolveRole()
      if (role && !can(role, capability)) return { type: 'rewrite', location: ADMIN_DENIED_PATH, requestHeaders, responseHeaders }
    }
    return { type: 'next', requestHeaders, responseHeaders }
  }

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

/** Fermés en aperçu, même avec un jeton valide : admin, Studio, mode brouillon, revalidation (FOLLOWUPS #1). */
export const PREVIEW_CLOSED_PREFIXES = ['/admin', '/studio', '/api/draft-mode', '/api/revalidate']
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

async function decidePreview(input: ProxyInput): Promise<ProxyDecision> {
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

  const now = Math.floor(input.nowSeconds ?? Date.now() / 1000)
  // Cookie renouvelé à chaque requête acceptée (FOLLOWUPS #39) : jeton RE-SIGNÉ pour le même utilisateur, échéance
  // glissante (maintenant + 15 min, jamais plus courte que celle du jeton reçu) ; Max-Age = même échéance que le jeton.
  const previewCookie = async (verified: { exp: number; userId: string }): Promise<CookieSpec> => {
    const renewed = await renewPreviewToken(secret, verified, now)
    const local = isLocalHost(input.host)
    return {
      name: PREVIEW_COOKIE,
      value: renewed.token,
      httpOnly: true,
      // En local (127.0.0.1:4040 → :4042) l'iframe est « same-site » : Lax suffit. Hébergé : iframe tierce.
      secure: !local,
      sameSite: local ? 'lax' : 'none',
      partitioned: !local,
      path: '/',
      // Même échéance que le jeton : le cookie meurt avec lui.
      maxAge: renewed.exp - now,
    }
  }
  // Jeton échu (même dans la marge d'horloge de 30 s de verifyPreviewToken) : refusé, jamais ranimé par le renouvellement.
  const accept = async (token: string | null | undefined) => {
    const verified = await verifyPreviewToken(secret, token, now)
    return verified && verified.exp > now ? verified : null
  }

  const params = new URLSearchParams(input.search)
  const fromQuery = params.get(PREVIEW_QUERY)
  if (fromQuery !== null) {
    // Jeton COURT seulement : le secret racine brut ne passe jamais (il n'a pas la forme v1.<exp>.<uid>.<sig>).
    const verified = await accept(fromQuery)
    if (!verified) return text(403, 'Preview access denied.')
    params.delete(PREVIEW_QUERY)
    const rest = params.toString()
    return {
      type: 'redirect',
      location: `${input.pathname}${rest ? `?${rest}` : ''}`,
      responseHeaders,
      setCookies: [await previewCookie(verified)],
    }
  }

  const verified = await accept(input.cookies[PREVIEW_COOKIE])
  if (verified) return { type: 'next', responseHeaders, setCookies: [await previewCookie(verified)] }
  return text(403, 'Preview access denied.')
}
