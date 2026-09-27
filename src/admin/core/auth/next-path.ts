import { ADMIN_CALLBACK_PATH, ADMIN_HOME, ADMIN_LOGIN_PATH } from './constants'

/**
 * Nettoie le paramètre `next` (retour après connexion). Pur.
 * N'accepte qu'un chemin RELATIF de l'admin (`/admin` ou `/admin/...`) : jamais une URL absolue, `//hôte`,
 * un antislash, un caractère de contrôle, ni les pages de connexion elles-mêmes (boucle). Sinon → `/admin`.
 */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== 'string' || next.length > 1024) return ADMIN_HOME
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return ADMIN_HOME
  if (!next.startsWith('/') || next.startsWith('//')) return ADMIN_HOME
  let url: URL
  try {
    url = new URL(next, 'http://kz.invalid')
  } catch {
    return ADMIN_HOME
  }
  if (url.origin !== 'http://kz.invalid') return ADMIN_HOME
  const path = url.pathname
  if (path !== ADMIN_HOME && !path.startsWith(`${ADMIN_HOME}/`)) return ADMIN_HOME
  if (path === ADMIN_LOGIN_PATH || path.startsWith(`${ADMIN_CALLBACK_PATH}`) || path.startsWith('/admin/api/')) {
    return ADMIN_HOME
  }
  return `${path}${url.search}`
}

/** `/admin/login?next=<chemin>` (le chemin est nettoyé). */
export function loginUrlFor(next: string | null | undefined): string {
  const safe = sanitizeNextPath(next)
  return safe === ADMIN_HOME ? ADMIN_LOGIN_PATH : `${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(safe)}`
}
