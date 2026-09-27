/**
 * Rôles et droits de l'admin.
 *
 * Le rôle vient du rôle de l'utilisateur dans le projet Sanity du client (voir docs/admin/ARCHITECTURE.md § Auth) :
 * Administrator → « client » (barre verte du Figma), Developer → « kuartz » (barre bleue), Editor → « editor ».
 * Tout autre rôle (Viewer, personnalisé) n'entre pas dans l'admin.
 *
 * CONTRAT PARTAGÉ — propriétaire : l'orchestrateur. Un agent qui a besoin d'un droit de plus
 * le demande dans le CLAUDE.md de son module (section « Demandes de contrat ») au lieu de l'ajouter ici.
 */

export const ADMIN_ROLES = ['kuartz', 'client', 'editor'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

/** Rôle Sanity (nom technique renvoyé par /users/me) → rôle de l'admin. */
export const SANITY_ROLE_TO_ADMIN: Readonly<Record<string, AdminRole>> = {
  administrator: 'client',
  developer: 'kuartz',
  editor: 'editor',
}

/** Quand l'utilisateur a plusieurs rôles Sanity, le plus fort l'emporte. */
export const ROLE_PRIORITY: readonly AdminRole[] = ['kuartz', 'client', 'editor']

export type Capability =
  /** B3 · Code (scripts du site) — Kuartz seulement. */
  | 'settings.code'
  /** B4 · Team — le client admin seulement (question 11 : l'éditeur invité ne voit pas Team). */
  | 'settings.team'
  /** Lien « ↗ Kuartz hub » en bas de la sidebar. */
  | 'hub.link'
  /** E1 · bouton « ‹/› Diff » du code d'une modification IA. */
  | 'publish.diff'
  /** E2 · retour arrière (Instant Rollback). */
  | 'versions.rollback'
  /** Éditeur IA (D) et Ask AI (G4). */
  | 'ai.editor'
  | 'ai.ask'
  /** Publish (E1, Top bar). */
  | 'publish.run'
  /** Modifier réglages, pages, CMS, médias. */
  | 'content.write'

export const CAPABILITIES: Readonly<Record<AdminRole, readonly Capability[]>> = {
  kuartz: ['settings.code', 'hub.link', 'publish.diff', 'versions.rollback', 'ai.editor', 'ai.ask', 'publish.run', 'content.write'],
  client: ['settings.team', 'ai.editor', 'ai.ask', 'publish.run', 'content.write'],
  editor: ['ai.editor', 'ai.ask', 'publish.run', 'content.write'],
}

export function can(role: AdminRole, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability)
}

/** Libellé affiché sous le nom de l'utilisateur dans la sidebar (« Marie · Client admin »). */
export const ROLE_LABEL: Readonly<Record<AdminRole, string>> = {
  kuartz: 'Kuartz',
  client: 'Client admin',
  editor: 'Editor',
}
