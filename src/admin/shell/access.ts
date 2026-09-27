import { can, type AdminRole, type Capability } from '@/admin/core/contracts/roles'

import { ADMIN_BASE } from './nav'

/**
 * Droit exigé par une URL de la coque (PUR). Le layout de la coque le vérifie AVANT tout streaming, pour qu'une page
 * refusée réponde une vraie 404 (FOLLOWUPS #21) : un `notFound()` lancé par la page elle-même arrive sous la
 * frontière `<Suspense>` d'un `loading.tsx`, quand Next a déjà envoyé « 200 ».
 *
 * Ce n'est PAS la garde : chaque page garde son `requireCapability` (le layout ne se rejoue pas à la navigation
 * côté client). La table doit suivre ces gardes ; `access.test.ts` le vérifie en lisant les pages de `(shell)`.
 * Préfixes de segments entiers : `/admin/publish` couvre `/admin/publish/versions`, pas `/admin/publishing`.
 */
export const SHELL_ROUTE_CAPABILITIES: readonly { path: string; capability: Capability }[] = [
  { path: `${ADMIN_BASE}/settings/code`, capability: 'settings.code' },
  { path: `${ADMIN_BASE}/settings/team`, capability: 'settings.team' },
  { path: `${ADMIN_BASE}/publish`, capability: 'publish.run' },
  { path: `${ADMIN_BASE}/cms`, capability: 'content.write' },
  { path: `${ADMIN_BASE}/media`, capability: 'content.write' },
]

/** Chemin seul (sans requête ni fragment ni barre finale), décodé ; null si illisible. */
function normalizePath(raw: string): string | null {
  const path = raw.split(/[?#]/, 1)[0] ?? ''
  let decoded: string
  try {
    decoded = decodeURI(path)
  } catch {
    return null
  }
  return decoded.length > 1 ? decoded.replace(/\/+$/, '') : decoded
}

/**
 * Droit exigé par `path` (en-tête `x-kz-path` posé par le proxy : chemin + requête), ou null si la page est ouverte
 * à tout rôle connecté, si le chemin est absent ou illisible.
 */
export function requiredShellCapability(path: string | null | undefined): Capability | null {
  if (!path) return null
  const clean = normalizePath(path)
  if (!clean) return null
  const rule = SHELL_ROUTE_CAPABILITIES.find((r) => clean === r.path || clean.startsWith(`${r.path}/`))
  return rule?.capability ?? null
}

/** Vrai si `role` n'a pas le droit qu'exige `path` (la page répondrait 404). */
export function isShellPathRefused(role: AdminRole, path: string | null | undefined): boolean {
  const capability = requiredShellCapability(path)
  return capability !== null && !can(role, capability)
}
