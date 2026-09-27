import { ROLE_PRIORITY, SANITY_ROLE_TO_ADMIN, type AdminRole } from '@/admin/core/contracts/roles'

/**
 * Rôles Sanity du projet → rôle de l'admin (contrat roles.ts). Pur.
 * Plusieurs rôles : le plus fort l'emporte (ROLE_PRIORITY). Aucun rôle reconnu → null (accès refusé).
 */
export function resolveAdminRole(sanityRoles: readonly string[]): AdminRole | null {
  const mapped = new Set<AdminRole>()
  for (const raw of sanityRoles) {
    const key = raw.trim().toLowerCase()
    // hasOwn : « constructor », « __proto__ »… ne doivent jamais passer pour un rôle.
    if (Object.hasOwn(SANITY_ROLE_TO_ADMIN, key)) mapped.add(SANITY_ROLE_TO_ADMIN[key])
  }
  return ROLE_PRIORITY.find((role) => mapped.has(role)) ?? null
}
