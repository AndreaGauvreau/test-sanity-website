import {
  parseKuartzAllowlist,
  resolveAdminRole as resolveFromContract,
  SANITY_ROLE_TO_ADMIN,
  type AdminRole,
  type KuartzAllowlist,
} from '@/admin/core/contracts/roles'
import type { Session } from '@/admin/core/contracts/session'

/**
 * Rôles Sanity du projet + identité + liste blanche de Kuartz → rôle de l'admin (contrat roles.ts). Pur.
 *
 * Constat SEC-05 : le rôle Sanity Developer, que le client peut attribuer lui-même, ne donne PLUS « kuartz ».
 * kuartz = Developer ou Administrator ET membre de KUARTZ_ALLOWLIST (ids Sanity, e-mails exacts, domaines « @… »).
 * Un Developer hors liste est un « editor ». Aucun rôle reconnu → null (accès refusé).
 */

export type { KuartzAllowlist } from '@/admin/core/contracts/roles'

/** Liste blanche lue dans l'environnement du serveur (KUARTZ_ALLOWLIST). Vide si absente : personne n'est kuartz. */
export function kuartzAllowlistFromEnv(raw: string | undefined = process.env.KUARTZ_ALLOWLIST): KuartzAllowlist {
  return parseKuartzAllowlist(raw)
}

/** Nettoie les rôles bruts (espaces, casse, clés du prototype, non-textes) puis applique le contrat. */
export function resolveAdminRole(
  sanityRoles: readonly unknown[],
  user: { id: string; email: string },
  allowlist: KuartzAllowlist,
): AdminRole | null {
  const clean: string[] = []
  for (const raw of sanityRoles) {
    if (typeof raw !== 'string') continue
    const key = raw.trim().toLowerCase()
    // hasOwn : « constructor », « __proto__ »… ne doivent jamais passer pour un rôle.
    if (Object.hasOwn(SANITY_ROLE_TO_ADMIN, key)) clean.push(key)
  }
  return resolveFromContract(clean, user, allowlist)
}

/**
 * Session RÉELLE lue dans le cookie : son rôle est recalculé à chaque lecture d'après ses rôles Sanity et la liste
 * blanche ACTUELLE. Ainsi un cookie scellé avant SEC-05 (Developer → kuartz) ou une personne retirée de
 * KUARTZ_ALLOWLIST perd le rôle kuartz sans attendre l'expiration. Rôle devenu nul → null (plus de session).
 * Les sessions de développement (dev: true) gardent le rôle choisi par ADMIN_DEV_AUTOLOGIN.
 */
export function reconcileSessionRole(session: Session, allowlist: KuartzAllowlist): Session | null {
  if (session.dev) return session
  const role = resolveAdminRole(session.sanityRoles, session.user, allowlist)
  if (!role) return null
  return role === session.role ? session : { ...session, role }
}
