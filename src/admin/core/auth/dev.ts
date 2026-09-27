import { ADMIN_ROLES, type AdminRole } from '@/admin/core/contracts/roles'
import type { Session } from '@/admin/core/contracts/session'

import { DEV_ROLE_OFF } from './constants'

/**
 * Connexion de développement (ADMIN_DEV_AUTOLOGIN=kuartz|client|editor). Module PUR, partagé par le proxy et
 * `session.ts`.
 *
 * Acceptée SEULEMENT si NODE_ENV === 'development' ET requête sur 127.0.0.1 / localhost / [::1] (en-tête Host, et
 * X-Forwarded-Host s'il existe). Hors de ces conditions, la variable est ignorée et un avertissement bruyant est
 * écrit dans le journal du serveur (une fois par cause).
 */

export type DevEnv = { NODE_ENV?: string; ADMIN_DEV_AUTOLOGIN?: string }

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/** « 127.0.0.1:4040 » → « 127.0.0.1 » ; « [::1]:4040 » → « [::1] ». */
export function hostnameOf(host: string | null | undefined): string {
  if (!host) return ''
  const value = host.trim().toLowerCase()
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    return end === -1 ? value : value.slice(0, end + 1)
  }
  return value.split(':')[0]
}

export function isLocalHost(host: string | null | undefined): boolean {
  return LOCAL_HOSTNAMES.has(hostnameOf(host))
}

export function parseAdminRole(value: string | null | undefined): AdminRole | null {
  const v = value?.trim().toLowerCase()
  return (ADMIN_ROLES as readonly string[]).includes(v ?? '') ? (v as AdminRole) : null
}

export type DevAutologinDecision =
  | { enabled: true; role: AdminRole }
  | { enabled: false; reason: 'unset' | 'invalid-role' | 'not-development' | 'not-local' | 'suspended' }

/**
 * Décide si la requête reçoit une session de développement.
 * `devRoleCookie` : valeur du cookie kz_dev_role (sélecteur de rôle, ou « off » après Log out).
 */
export function decideDevAutologin(input: {
  env: DevEnv
  host: string | null | undefined
  forwardedHost?: string | null
  devRoleCookie?: string | null
}): DevAutologinDecision {
  const raw = input.env.ADMIN_DEV_AUTOLOGIN?.trim()
  if (!raw) return { enabled: false, reason: 'unset' }
  if (input.env.NODE_ENV !== 'development') return { enabled: false, reason: 'not-development' }
  const baseRole = parseAdminRole(raw)
  if (!baseRole) return { enabled: false, reason: 'invalid-role' }
  if (!isLocalHost(input.host)) return { enabled: false, reason: 'not-local' }
  if (input.forwardedHost && !isLocalHost(input.forwardedHost)) return { enabled: false, reason: 'not-local' }
  if (input.devRoleCookie === DEV_ROLE_OFF) return { enabled: false, reason: 'suspended' }
  return { enabled: true, role: parseAdminRole(input.devRoleCookie) ?? baseRole }
}

const warned = new Set<string>()

/** Refus bruyant (une fois par cause) quand la variable est présente mais ignorée. */
export function warnIfDevAutologinRefused(decision: DevAutologinDecision, log: (msg: string) => void = console.error): void {
  if (decision.enabled || decision.reason === 'unset' || decision.reason === 'suspended') return
  if (warned.has(decision.reason)) return
  warned.add(decision.reason)
  const why = {
    'not-development': 'NODE_ENV is not "development"',
    'invalid-role': 'its value is not kuartz, client or editor',
    'not-local': 'the request host is not 127.0.0.1 / localhost',
  }[decision.reason]
  log(`[admin/auth] ADMIN_DEV_AUTOLOGIN is set but IGNORED because ${why}. Remove it from this environment.`)
}

/** Réinitialise la mémoire des avertissements (tests). */
export function resetDevWarnings(): void {
  warned.clear()
}

const DEV_NAMES: Record<AdminRole, string> = { kuartz: 'Dev · Kuartz', client: 'Dev · Client admin', editor: 'Dev · Editor' }
const DEV_SANITY_ROLE: Record<AdminRole, string> = { kuartz: 'developer', client: 'administrator', editor: 'editor' }

/** Session de développement : aucun jeton Sanity (les écritures passent par SANITY_API_WRITE_TOKEN). */
export function buildDevSession(role: AdminRole, now: Date, ttlSeconds: number): Session {
  return {
    user: { id: `dev-${role}`, name: DEV_NAMES[role], email: `dev-${role}@localhost` },
    role,
    sanityRoles: [DEV_SANITY_ROLE[role]],
    sanityToken: null,
    dev: true,
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
  }
}
