/**
 * Rôles et droits de l'admin.
 *
 * Le rôle vient du rôle de l'utilisateur dans le projet Sanity du client (voir docs/admin/ARCHITECTURE.md § Auth) :
 * Administrator → « client » (barre verte du Figma), Editor → « editor ».
 * « kuartz » (barre bleue) N'EST PAS déduit du seul rôle Sanity Developer, que le client peut attribuer lui-même
 * (constat de sécurité SEC-05) : il faut en plus figurer sur la liste blanche de Kuartz (variable serveur
 * KUARTZ_ALLOWLIST : ids Sanity, e-mails exacts ou domaines « @kuartz.studio »). Un Developer hors liste est un
 * « editor » (moindre privilège). Tout autre rôle (Viewer, personnalisé) n'entre pas dans l'admin.
 *
 * CONTRAT PARTAGÉ — propriétaire : l'orchestrateur. Un agent qui a besoin d'un droit de plus
 * le demande dans le CLAUDE.md de son module (section « Demandes de contrat ») au lieu de l'ajouter ici.
 */

export const ADMIN_ROLES = ['kuartz', 'client', 'editor'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

/** Rôle Sanity (nom technique renvoyé par /users/me) → rôle de l'admin, AVANT la liste blanche de Kuartz. */
export const SANITY_ROLE_TO_ADMIN: Readonly<Record<string, AdminRole>> = {
  administrator: 'client',
  developer: 'editor',
  editor: 'editor',
}

/** Liste blanche de Kuartz, lue par le serveur dans KUARTZ_ALLOWLIST (valeurs séparées par des virgules). */
export type KuartzAllowlist = { ids: readonly string[]; emails: readonly string[]; domains: readonly string[] }

/** « p1aB2c, marie@kuartz.studio, @kuartz.studio » → liste blanche normalisée (minuscules pour e-mails et domaines). */
export function parseKuartzAllowlist(raw: string | undefined): KuartzAllowlist {
  const ids: string[] = []
  const emails: string[] = []
  const domains: string[] = []
  for (const item of (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (item.startsWith('@')) domains.push(item.slice(1).toLowerCase())
    else if (item.includes('@')) emails.push(item.toLowerCase())
    else ids.push(item)
  }
  return { ids, emails, domains }
}

export function isKuartzMember(user: { id: string; email: string }, list: KuartzAllowlist): boolean {
  const email = user.email.trim().toLowerCase()
  const domain = email.includes('@') ? email.slice(email.lastIndexOf('@') + 1) : ''
  return list.ids.includes(user.id) || (email !== '' && list.emails.includes(email)) || (domain !== '' && list.domains.includes(domain))
}

/**
 * Rôle de l'admin d'après les rôles Sanity du PROJET et la liste blanche de Kuartz.
 * kuartz = rôle Sanity developer ou administrator ET membre de la liste blanche ; sinon le plus fort de la table.
 * null = pas d'accès à l'admin.
 */
export function resolveAdminRole(
  sanityRoles: readonly string[],
  user: { id: string; email: string },
  allowlist: KuartzAllowlist,
): AdminRole | null {
  const roles = sanityRoles.map((r) => r.toLowerCase())
  if ((roles.includes('developer') || roles.includes('administrator')) && isKuartzMember(user, allowlist)) return 'kuartz'
  const mapped = roles.map((r) => SANITY_ROLE_TO_ADMIN[r]).filter((r): r is AdminRole => !!r)
  return ROLE_PRIORITY.find((r) => mapped.includes(r)) ?? null
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
  /** B5 · carte « Claude connection » : voir et changer l'accès du moteur à Claude (clé API, abonnement local). */
  | 'ai.access'
  /** Publish (E1, Top bar). */
  | 'publish.run'
  /** Modifier réglages, pages, CMS, médias. */
  | 'content.write'

export const CAPABILITIES: Readonly<Record<AdminRole, readonly Capability[]>> = {
  kuartz: ['settings.code', 'hub.link', 'publish.diff', 'versions.rollback', 'ai.editor', 'ai.ask', 'ai.access', 'publish.run', 'content.write'],
  client: ['settings.team', 'ai.editor', 'ai.ask', 'ai.access', 'publish.run', 'content.write'],
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
