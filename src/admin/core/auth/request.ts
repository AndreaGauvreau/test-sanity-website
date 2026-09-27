import { hostnameOf, isLocalHost } from './dev'

/**
 * Lecture sûre des en-têtes d'une requête (origine, même origine). Pur : prend un objet `Headers`-like.
 */

type HeaderReader = { get(name: string): string | null }

/** Première valeur d'un en-tête à valeurs multiples (« a, b » → « a »). */
function first(value: string | null): string | null {
  return value ? value.split(',')[0].trim() || null : null
}

/** Hôte public de la requête (X-Forwarded-Host derrière un proxy, sinon Host). */
export function requestHost(h: HeaderReader): string {
  return first(h.get('x-forwarded-host')) ?? h.get('host') ?? ''
}

/** Origine publique de l'admin pour cette requête (« http://127.0.0.1:4040 », « https://conduit.com »). */
export function requestOrigin(h: HeaderReader): string {
  const host = requestHost(h)
  const proto = first(h.get('x-forwarded-proto')) ?? (isLocalHost(host) ? 'http' : 'https')
  return `${proto === 'http' ? 'http' : 'https'}://${host}`
}

/** Cookie `Secure` partout sauf sur 127.0.0.1 / localhost (http en développement). */
export function shouldUseSecureCookies(h: HeaderReader): boolean {
  return !isLocalHost(requestHost(h))
}

/**
 * Protection CSRF des routes POST de l'admin (en plus de SameSite=Lax) : l'en-tête Origin, s'il est présent, doit
 * être celui de la requête ; `Sec-Fetch-Site: cross-site` est refusé.
 */
export function isSameOriginRequest(h: HeaderReader): boolean {
  const site = h.get('sec-fetch-site')
  if (site === 'cross-site' || site === 'same-site') return false
  const origin = h.get('origin')
  if (!origin) return true
  if (origin === 'null') return false
  try {
    const o = new URL(origin)
    return o.host.toLowerCase() === requestHost(h).toLowerCase() && hostnameOf(o.host) !== ''
  } catch {
    return false
  }
}
