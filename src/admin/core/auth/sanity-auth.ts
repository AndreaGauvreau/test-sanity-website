import { AUTH_MESSAGES, ADMIN_CALLBACK_PATH, SANITY_AUTH_API_VERSION } from './constants'
import { sanitizeNextPath } from './next-path'

/**
 * Appels HTTP à l'API d'authentification de Sanity. Pur (fetch injectable) : aucun import Next.
 *
 * Flux « token » du Studio installé (vérifié dans node_modules/sanity/lib/WorkspaceLoader-*.js,
 * `createHrefForProvider` / `exchangeSessionForToken`, sanity 6.16) :
 * 1. GET https://api.sanity.io/<v>/auth/providers → { providers: [{ name, title, url }] } (sans jeton) ;
 * 2. le navigateur va sur `<provider.url>?origin=<retour>&projectId=<id>&withSid=true`
 *    (le Studio 6.16 met `withSid=true` en mode token ; `type=<méthode>` seulement en mode cookie/dual) ;
 * 3. retour sur `<origin>#sid=<≥ 20 caractères>` ;
 * 4. GET https://<projectId>.api.sanity.io/<v>/auth/fetch?sid=<sid> → { token } ;
 * 5. GET https://<projectId>.api.sanity.io/<v>/users/me (Bearer) → identité + rôles DU PROJET.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type SanityProvider = { name: string; title: string; url: string }

export type SanityMe = {
  id: string
  name: string
  email: string
  imageUrl?: string
  /** Noms techniques des rôles du projet (« administrator », « developer »…). */
  roles: string[]
}

/** Erreur d'authentification Sanity : `kind` décide du message et du statut HTTP renvoyé à l'admin. */
export class SanityAuthError extends Error {
  constructor(
    readonly kind: 'invalid-sid' | 'unauthorized' | 'unavailable' | 'bad-response',
    message: string,
  ) {
    super(message)
    this.name = 'SanityAuthError'
  }
}

const GLOBAL_API = `https://api.sanity.io/${SANITY_AUTH_API_VERSION}`
const TIMEOUT_MS = 10_000

export function projectApi(projectId: string): string {
  if (!/^[a-z0-9-]+$/i.test(projectId)) throw new Error('Invalid Sanity projectId.')
  return `https://${projectId}.api.sanity.io/${SANITY_AUTH_API_VERSION}`
}

async function call(fetchImpl: FetchLike, url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new SanityAuthError('unavailable', AUTH_MESSAGES.sanityUnavailable)
  }
}

/** Fournisseurs d'identité (Google, GitHub, e-mail…). Seuls les champs attendus sont gardés ; URL https de Sanity seulement. */
export async function fetchProviders(fetchImpl: FetchLike = fetch): Promise<SanityProvider[]> {
  const res = await call(fetchImpl, `${GLOBAL_API}/auth/providers`)
  if (!res.ok) throw new SanityAuthError('unavailable', AUTH_MESSAGES.sanityUnavailable)
  const body = (await res.json().catch(() => null)) as { providers?: unknown } | null
  const list = Array.isArray(body?.providers) ? body.providers : []
  return list.flatMap((p): SanityProvider[] => {
    if (!p || typeof p !== 'object') return []
    const { name, title, url } = p as Record<string, unknown>
    if (typeof name !== 'string' || typeof title !== 'string' || typeof url !== 'string') return []
    if (!/^[\w-]+$/.test(name) || !isSanityHttpsUrl(url)) return []
    return [{ name, title, url }]
  })
}

function isSanityHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && (u.hostname === 'sanity.io' || u.hostname.endsWith('.sanity.io'))
  } catch {
    return false
  }
}

/**
 * URL de connexion chez le fournisseur. `adminOrigin` = origine de l'admin (« http://127.0.0.1:4040 ») ;
 * le retour se fait sur `/admin/auth/callback?next=<chemin nettoyé>`.
 */
export function buildProviderLoginUrl(input: {
  provider: SanityProvider
  projectId: string
  adminOrigin: string
  next?: string | null
}): string {
  const callback = new URL(ADMIN_CALLBACK_PATH, input.adminOrigin)
  callback.searchParams.set('next', sanitizeNextPath(input.next))
  const url = new URL(input.provider.url)
  url.searchParams.set('origin', callback.toString())
  url.searchParams.set('projectId', input.projectId)
  url.searchParams.set('withSid', 'true')
  return url.toString()
}

/** Forme d'un sid (le Studio exige au moins 20 caractères, sans « & »). */
export function isPlausibleSid(sid: unknown): sid is string {
  // Même tolérance que le Studio (/sid=([^&]{20,})/), bornée et sans espace ni séparateur d'URL.
  return typeof sid === 'string' && sid.length >= 20 && sid.length <= 512 && /^[^\s&#?/\\]+$/.test(sid)
}

/** Échange le sid (usage unique) contre le jeton de session Sanity de l'utilisateur. */
export async function exchangeSid(projectId: string, sid: string, fetchImpl: FetchLike = fetch): Promise<string> {
  if (!isPlausibleSid(sid)) throw new SanityAuthError('invalid-sid', AUTH_MESSAGES.signInFailed)
  const url = `${projectApi(projectId)}/auth/fetch?sid=${encodeURIComponent(sid)}`
  const res = await call(fetchImpl, url)
  if (res.status === 404 || res.status === 401 || res.status === 403 || res.status === 400) {
    throw new SanityAuthError('invalid-sid', AUTH_MESSAGES.signInFailed)
  }
  if (!res.ok) throw new SanityAuthError('unavailable', AUTH_MESSAGES.sanityUnavailable)
  const body = (await res.json().catch(() => null)) as { token?: unknown } | null
  if (typeof body?.token !== 'string' || body.token.length < 10) {
    throw new SanityAuthError('bad-response', AUTH_MESSAGES.signInFailed)
  }
  return body.token
}

/** Identité et rôles du projet (hôte du projet : `roles` y est celui du PROJET). */
export async function fetchSanityMe(projectId: string, token: string, fetchImpl: FetchLike = fetch): Promise<SanityMe> {
  const res = await call(fetchImpl, `${projectApi(projectId)}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401 || res.status === 403) throw new SanityAuthError('unauthorized', AUTH_MESSAGES.signInFailed)
  if (!res.ok) throw new SanityAuthError('unavailable', AUTH_MESSAGES.sanityUnavailable)
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.id !== 'string' || !body.id) throw new SanityAuthError('unauthorized', AUTH_MESSAGES.signInFailed)
  const roles = new Set<string>()
  if (Array.isArray(body.roles)) {
    for (const r of body.roles) {
      if (typeof r === 'string') roles.add(r)
      else if (r && typeof r === 'object' && typeof (r as { name?: unknown }).name === 'string') roles.add((r as { name: string }).name)
    }
  }
  if (typeof body.role === 'string' && body.role) roles.add(body.role)
  return {
    id: body.id,
    name: typeof body.name === 'string' && body.name ? body.name : typeof body.email === 'string' ? body.email : body.id,
    email: typeof body.email === 'string' ? body.email : '',
    imageUrl: typeof body.profileImage === 'string' && body.profileImage ? body.profileImage : undefined,
    roles: [...roles],
  }
}

/** Invalide le jeton côté Sanity (POST /auth/logout). Ne lève jamais : la déconnexion locale doit toujours aboutir. */
export async function revokeSanityToken(projectId: string, token: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await call(fetchImpl, `${projectApi(projectId)}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}
