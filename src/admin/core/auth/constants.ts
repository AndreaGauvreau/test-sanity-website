/**
 * Constantes de l'accès à l'admin. Module PUR (aucun import Next / Node) : lu par le proxy, les routes, les tests.
 */

/** Cookie de session chiffré (JWE). */
export const SESSION_COOKIE = 'kz_admin'
/** Cookie du sélecteur de rôle de développement (session de dev seulement). */
export const DEV_ROLE_COOKIE = 'kz_dev_role'
/** Valeur de DEV_ROLE_COOKIE qui suspend la connexion automatique de dev (après « Log out »). */
export const DEV_ROLE_OFF = 'off'

/** Portée des cookies de l'admin. */
export const ADMIN_COOKIE_PATH = '/admin'

/** Durée d'une session : 12 h. Un changement de rôle dans Sanity prend effet à la connexion suivante. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60

export const ADMIN_HOME = '/admin'
export const ADMIN_LOGIN_PATH = '/admin/login'
export const ADMIN_CALLBACK_PATH = '/admin/auth/callback'

/** En-tête de requête posé par le proxy : chemin demandé (pour `next=` des redirections vers A1). */
export const REQUEST_PATH_HEADER = 'x-kz-path'

/** Version de l'API Sanity pour l'authentification (formats vérifiés : /auth/providers, /auth/fetch, /users/me). */
export const SANITY_AUTH_API_VERSION = 'v2021-06-07'

/** Messages affichés à l'utilisateur de l'admin (anglais). */
export const AUTH_MESSAGES = {
  notMember: "Your Sanity account isn't a member of this project. Ask the site owner to invite you.",
  roleDenied: (role: string) =>
    `Your role in this Sanity project (${role}) doesn't give access to the admin. Ask the site owner to invite you as an Editor or Administrator.`,
  signInFailed: 'Sign-in failed or expired. Please try again.',
  sanityUnavailable: "Sanity isn't responding. Please try again in a moment.",
  unauthorized: 'Your session has expired. Sign in again.',
  forbidden: "You don't have access to this.",
  badOrigin: 'This request was blocked (cross-site).',
  missingSid: 'Missing sign-in code. Please sign in again.',
  notConfigured: 'Sign-in is not configured on this server.',
} as const

/**
 * `?error=<code>` posé sur /admin/login par les routes d'authentification → message à afficher sur A1.
 * Codes : `provider` (fournisseur inconnu ou Sanity injoignable depuis /admin/api/auth/login). Inconnu → null.
 */
export function loginErrorMessage(code: string | null | undefined): string | null {
  if (code === 'provider') return "Couldn't reach this sign-in provider. Please try again."
  return null
}
