import type { AdminRole } from './roles'

/**
 * Session de l'admin (cookie chiffré `kz_admin`, httpOnly, path /admin).
 *
 * CONTRAT PARTAGÉ — propriétaire : l'orchestrateur. Implémentation : src/admin/core/auth/ (agent auth-core).
 *
 * Point sensible : `sanityToken` est le jeton de session Sanity de l'utilisateur (issu de la connexion A1).
 * Il ne quitte JAMAIS le serveur : pas de props de composant client, pas de JSON renvoyé au navigateur,
 * pas de transmission au moteur IA. Les composants reçoivent `PublicSession`.
 */

export type SessionUser = {
  /** Id Sanity de l'utilisateur (ex. « p1aB2cD3e »). */
  id: string
  name: string
  email: string
  imageUrl?: string
}

export type Session = {
  user: SessionUser
  role: AdminRole
  /** Rôles Sanity bruts, pour le diagnostic (« administrator », « developer »…). */
  sanityRoles: string[]
  /** Jeton Sanity de l'utilisateur. `null` en connexion de développement (ADMIN_DEV_AUTOLOGIN). */
  sanityToken: string | null
  /** Session de développement : aucune écriture ne passe sous le nom d'un vrai utilisateur. */
  dev: boolean
  /** Horodatage ISO d'expiration. */
  expiresAt: string
}

/** Ce qu'un composant client a le droit de connaître de la session. */
export type PublicSession = Omit<Session, 'sanityToken'>

export function toPublicSession({ sanityToken: _omit, ...rest }: Session): PublicSession {
  return rest
}

/** Identité transmise au moteur IA (en-tête signé X-Kz-User, voir engine.ts). Jamais de jeton. */
export type EngineUser = Pick<SessionUser, 'id' | 'name' | 'email'> & { role: AdminRole }
