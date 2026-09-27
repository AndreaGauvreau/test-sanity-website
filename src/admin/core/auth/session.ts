import 'server-only'

import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'

import { ADMIN_ROLES, can, type AdminRole, type Capability } from '@/admin/core/contracts/roles'
import { toPublicSession, type PublicSession, type Session } from '@/admin/core/contracts/session'

import {
  ADMIN_COOKIE_PATH,
  AUTH_MESSAGES,
  DEV_ROLE_COOKIE,
  DEV_ROLE_OFF,
  REQUEST_PATH_HEADER,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from './constants'
import { openSession, sealSession } from './crypto'
import { buildDevSession, decideDevAutologin, warnIfDevAutologinRefused } from './dev'
import { loginUrlFor } from './next-path'
import { requestOrigin, shouldUseSecureCookies } from './request'
import { buildProviderLoginUrl, fetchProviders, revokeSanityToken, type SanityProvider } from './sanity-auth'

/**
 * Session de l'admin côté serveur (pages, server actions, route handlers). SERVEUR SEULEMENT.
 *
 * - `getSession()` : session du cookie `kz_admin` (déchiffrée, non expirée), sinon session de dev si
 *   ADMIN_DEV_AUTOLOGIN est permis (voir dev.ts), sinon null.
 * - `requireSession(ctx)` / `requireCapability(cap, ctx)` : à appeler EN PREMIER dans chaque page serveur, server action
 *   et route handler. `ctx` décide de la réaction : 'page' → redirection vers A1 (ou 404 si le droit manque) ;
 *   'action' | 'route' → `AdminAuthError` (401/403) ; en route handler, `authErrorResponse(err)` la convertit.
 */

export type AuthContext = 'page' | 'action' | 'route'

export class AdminAuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: 'unauthorized' | 'forbidden',
    message: string,
  ) {
    super(message)
    this.name = 'AdminAuthError'
  }
}

function secret(): string | undefined {
  return process.env.ADMIN_SESSION_SECRET
}

/** Session courante (mise en cache le temps d'un rendu). */
export const getSession = cache(async (): Promise<Session | null> => {
  const [jar, h] = await Promise.all([cookies(), headers()])
  const real = await openSession(jar.get(SESSION_COOKIE)?.value, secret())
  if (real) return real

  const decision = decideDevAutologin({
    env: { NODE_ENV: process.env.NODE_ENV, ADMIN_DEV_AUTOLOGIN: process.env.ADMIN_DEV_AUTOLOGIN },
    host: h.get('host'),
    forwardedHost: h.get('x-forwarded-host'),
    devRoleCookie: jar.get(DEV_ROLE_COOKIE)?.value,
  })
  if (decision.enabled) return buildDevSession(decision.role, new Date(), SESSION_TTL_SECONDS)
  warnIfDevAutologinRefused(decision)
  return null
})

/** Ce que les composants client peuvent recevoir (sans jeton). */
export async function getPublicSession(): Promise<PublicSession | null> {
  const session = await getSession()
  return session ? toPublicSession(session) : null
}

export async function requireSession(context: AuthContext = 'page'): Promise<Session> {
  const session = await getSession()
  if (session) return session
  if (context === 'page') {
    const h = await headers()
    redirect(loginUrlFor(h.get(REQUEST_PATH_HEADER)))
  }
  throw new AdminAuthError(401, 'unauthorized', AUTH_MESSAGES.unauthorized)
}

export async function requireCapability(capability: Capability, context: AuthContext = 'page'): Promise<Session> {
  const session = await requireSession(context)
  if (can(session.role, capability)) return session
  // Page : 404 plutôt que 403, pour ne pas révéler une page réservée à Kuartz (forbidden() exige authInterrupts).
  if (context === 'page') notFound()
  throw new AdminAuthError(403, 'forbidden', AUTH_MESSAGES.forbidden)
}

/** Corps d'erreur JSON commun aux routes de l'admin (même forme que EngineErrorBody). */
export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { 'cache-control': 'no-store' } })
}

/** En route handler : `catch (err) { return authErrorResponse(err) }`. Relance tout ce qui n'est pas une AdminAuthError. */
export function authErrorResponse(err: unknown): Response {
  if (err instanceof AdminAuthError) return jsonError(err.status, err.code, err.message)
  throw err
}

// ─── Cookie (route handlers et server actions seulement : Next interdit d'écrire un cookie pendant un rendu) ───

async function cookieBase(): Promise<{ httpOnly: true; sameSite: 'lax'; path: string; secure: boolean }> {
  const h = await headers()
  return { httpOnly: true, sameSite: 'lax', path: ADMIN_COOKIE_PATH, secure: shouldUseSecureCookies(h) }
}

/** Ouvre la session : chiffre et pose le cookie `kz_admin`. Retourne la session complète (avec expiresAt). */
export async function writeSessionCookie(session: Omit<Session, 'expiresAt'>): Promise<Session> {
  const { value, session: full } = await sealSession(session, secret())
  const jar = await cookies()
  jar.set(SESSION_COOKIE, value, { ...(await cookieBase()), maxAge: SESSION_TTL_SECONDS })
  // Une vraie connexion efface le choix de rôle de dev.
  if (jar.get(DEV_ROLE_COOKIE)) jar.set(DEV_ROLE_COOKIE, '', { ...(await cookieBase()), maxAge: 0 })
  return full
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, '', { ...(await cookieBase()), maxAge: 0 })
}

/**
 * Déconnexion : révoque le jeton chez Sanity (POST /auth/logout), efface le cookie. En développement, suspend la
 * connexion automatique (kz_dev_role=off) pour que « Log out » ramène vraiment sur A1.
 */
export async function logout(): Promise<void> {
  const jar = await cookies()
  const real = await openSession(jar.get(SESSION_COOKIE)?.value, secret())
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
  if (real?.sanityToken && projectId) await revokeSanityToken(projectId, real.sanityToken)
  await clearSessionCookie()
  const devState = await getDevLoginState()
  if (devState.available) {
    jar.set(DEV_ROLE_COOKIE, DEV_ROLE_OFF, { ...(await cookieBase()), maxAge: SESSION_TTL_SECONDS })
  }
}

// ─── Pour la page A1 (agent shell) ───────────────────────────────────────────

export type LoginProviderLink = { name: string; title: string; href: string }

let providersCache: { at: number; list: SanityProvider[] } | null = null
const PROVIDERS_TTL_MS = 10 * 60 * 1000

async function cachedProviders(): Promise<SanityProvider[]> {
  if (providersCache && Date.now() - providersCache.at < PROVIDERS_TTL_MS) return providersCache.list
  const list = await fetchProviders()
  providersCache = { at: Date.now(), list }
  return list
}

/**
 * Boutons « Continue with … » de A1. Chaque `href` pointe sur `/admin/api/auth/login?provider=…&next=…`, qui
 * construit l'URL Sanity côté serveur. En cas d'échec : `providers: []` + `error` (anglais) à afficher.
 */
export async function getLoginProviders(next?: string | null): Promise<{ providers: LoginProviderLink[]; error?: string }> {
  try {
    const list = await cachedProviders()
    const suffix = next ? `&next=${encodeURIComponent(next)}` : ''
    return {
      providers: list.map((p) => ({
        name: p.name,
        title: p.title,
        href: `/admin/api/auth/login?provider=${encodeURIComponent(p.name)}${suffix}`,
      })),
    }
  } catch {
    return { providers: [], error: AUTH_MESSAGES.sanityUnavailable }
  }
}

/** URL du fournisseur (route /admin/api/auth/login). null si le fournisseur n'existe pas. */
export async function providerRedirectUrl(providerName: string, next: string | null): Promise<string | null> {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
  if (!projectId) return null
  const provider = (await cachedProviders()).find((p) => p.name === providerName)
  if (!provider) return null
  const h = await headers()
  return buildProviderLoginUrl({ provider, projectId, adminOrigin: requestOrigin(h), next })
}

/**
 * État du sélecteur de rôle de développement (menu utilisateur, A1 en dev).
 * `available` : ADMIN_DEV_AUTOLOGIN permis pour cette requête (même suspendu par Log out).
 */
export async function getDevLoginState(): Promise<{ available: boolean; activeRole: AdminRole | null; roles: readonly AdminRole[] }> {
  const [jar, h] = await Promise.all([cookies(), headers()])
  const env = { NODE_ENV: process.env.NODE_ENV, ADMIN_DEV_AUTOLOGIN: process.env.ADMIN_DEV_AUTOLOGIN }
  const base = { env, host: h.get('host'), forwardedHost: h.get('x-forwarded-host') }
  const withCookie = decideDevAutologin({ ...base, devRoleCookie: jar.get(DEV_ROLE_COOKIE)?.value })
  const available = withCookie.enabled || withCookie.reason === 'suspended'
  const real = await openSession(jar.get(SESSION_COOKIE)?.value, secret())
  return {
    available,
    activeRole: available && !real && withCookie.enabled ? withCookie.role : null,
    roles: ADMIN_ROLES,
  }
}

/** Pose le rôle de dev (ou « off »). Appelé par la route dev-role après vérification de `getDevLoginState`. */
export async function writeDevRoleCookie(value: AdminRole | typeof DEV_ROLE_OFF): Promise<void> {
  const jar = await cookies()
  jar.set(DEV_ROLE_COOKIE, value, { ...(await cookieBase()), maxAge: SESSION_TTL_SECONDS })
}
