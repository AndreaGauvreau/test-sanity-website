import type { AccessInvite, AccessUser } from './access-api'

/**
 * Membres de B4 d'après l'API d'accès Sanity. PUR.
 *
 * Figma B4 : avatar, nom, e-mail ; à droite, tag KUARTZ s'il y a lieu, puis « rôle · invited by … »
 * (« Administrator · owner », « Editor · invited by Marie »). Kuartz = membres Developer ou e-mail @kuartz.studio.
 */

export const KUARTZ_EMAIL_DOMAIN = 'kuartz.studio'

/** Rôles invitables depuis l'admin (Figma B4 « RÈGLES ») : Administrator (client), Developer (Kuartz), Editor, Viewer. */
export const INVITE_ROLES = [
  { value: 'editor', label: 'Editor' },
  { value: 'administrator', label: 'Administrator' },
  { value: 'developer', label: 'Developer' },
  { value: 'viewer', label: 'Viewer' },
] as const

export type InviteRole = (typeof INVITE_ROLES)[number]['value']

const ROLE_TITLES: Readonly<Record<string, string>> = {
  administrator: 'Administrator',
  developer: 'Developer',
  editor: 'Editor',
  viewer: 'Viewer',
  contributor: 'Contributor',
}

/** Ordre d'affichage du rôle principal quand un membre en a plusieurs. */
const ROLE_ORDER = ['administrator', 'developer', 'editor', 'contributor', 'viewer']

export type TeamMember = {
  id: string
  name: string
  email: string
  imageUrl?: string
  /** Rôle principal, nom technique (« administrator »). */
  role: string
  /** « Administrator · owner », « Developer · invited by Marie ». */
  meta: string
  kuartz: boolean
  isCurrentUser: boolean
}

export type PendingInvite = { id: string; email: string; role: string; meta: string; kuartz: boolean }

export type TeamSummary = { members: number; kuartz: number }

/** « administrator » → « Administrator » ; rôle personnalisé « content-lead » → « Content lead ». */
export function roleTitle(role: string): string {
  if (ROLE_TITLES[role]) return ROLE_TITLES[role]
  const words = role.replace(/[-_]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : 'Member'
}

export function mainRole(roles: readonly string[]): string {
  const sorted = [...roles].sort((a, b) => rank(a) - rank(b))
  return sorted[0] ?? 'viewer'
}

function rank(role: string): number {
  const i = ROLE_ORDER.indexOf(role)
  return i === -1 ? ROLE_ORDER.length : i
}

export function isKuartzEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(`@${KUARTZ_EMAIL_DOMAIN}`)
}

/** Prénom affiché dans « invited by Marie » : le premier mot du nom, sinon la partie locale de l'e-mail. */
export function firstName(name: string | null | undefined, email?: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0]
  if (first) return first
  return (email ?? '').split('@')[0] || 'someone'
}

function membershipOf(user: AccessUser, projectId: string) {
  return user.memberships.find((m) => m.resourceType === 'project' && m.resourceId === projectId)
}

/**
 * Construit la liste affichée. Règles :
 * - seuls les UTILISATEURS membres du projet (les robots / jetons, sans e-mail ni membership « project », sont écartés) ;
 * - « invited by X » : invitation acceptée dont `inviteeId` est ce membre, `inviterId` → nom du membre qui a invité ;
 * - « owner » : sans invitation connue, l'Administrator arrivé le premier (création du projet) — heuristique documentée ;
 * - Kuartz : rôle Developer ou e-mail @kuartz.studio ;
 * - ordre : Administrators, puis membres du client, puis Kuartz ; à rôle égal, date d'arrivée puis nom.
 */
export function buildTeam(
  users: readonly AccessUser[],
  invites: readonly AccessInvite[],
  projectId: string,
  currentUserId?: string,
): { members: TeamMember[]; pending: PendingInvite[]; summary: TeamSummary } {
  const inProject = users
    .map((user) => ({ user, membership: membershipOf(user, projectId) }))
    .filter(({ user, membership }) => membership && membership.roleNames.length > 0 && !!user.profile?.email)

  const nameById = new Map(inProject.map(({ user }) => [user.sanityUserId, firstName(user.profile?.displayName, user.profile?.email)]))
  const inviterOf = new Map<string, string>()
  for (const invite of invites) {
    if (invite.status === 'accepted' && invite.inviteeId && invite.inviterId) inviterOf.set(invite.inviteeId, invite.inviterId)
  }

  const admins = inProject
    .filter(({ user, membership }) => !inviterOf.has(user.sanityUserId) && membership!.roleNames.includes('administrator'))
    .sort((a, b) => (a.membership!.addedAt ?? '').localeCompare(b.membership!.addedAt ?? ''))
  const ownerId = admins[0]?.user.sanityUserId

  const members = inProject.map(({ user, membership }): TeamMember & { addedAt: string } => {
    const role = mainRole(membership!.roleNames)
    const email = user.profile?.email ?? ''
    const name = user.profile?.displayName?.trim() || email.split('@')[0]
    const inviter = inviterOf.get(user.sanityUserId)
    const inviterName = inviter ? nameById.get(inviter) : undefined
    const suffix = inviterName ? ` · invited by ${inviterName}` : user.sanityUserId === ownerId ? ' · owner' : ''
    return {
      id: user.sanityUserId,
      name,
      email,
      imageUrl: user.profile?.imageUrl && /^https:\/\//.test(user.profile.imageUrl) ? user.profile.imageUrl : undefined,
      role,
      meta: `${roleTitle(role)}${suffix}`,
      kuartz: role === 'developer' || isKuartzEmail(email),
      isCurrentUser: currentUserId === user.sanityUserId,
      addedAt: membership!.addedAt ?? '',
    }
  })

  members.sort((a, b) => group(a) - group(b) || a.addedAt.localeCompare(b.addedAt) || a.name.localeCompare(b.name))

  const pending = invites
    .filter((invite) => invite.status === 'pending' && invite.email)
    .map((invite) => {
      const inviterName = invite.inviterId ? nameById.get(invite.inviterId) : undefined
      const role = invite.role ?? 'viewer'
      return {
        id: invite.id,
        email: invite.email!,
        role,
        meta: `${roleTitle(role)}${inviterName ? ` · invited by ${inviterName}` : ''}`,
        kuartz: role === 'developer' || isKuartzEmail(invite.email),
      }
    })

  return {
    members: members.map(({ addedAt: _addedAt, ...member }) => member),
    pending,
    summary: { members: members.length, kuartz: members.filter((m) => m.kuartz).length },
  }
}

function group(member: TeamMember): number {
  if (member.role === 'administrator') return 0
  return member.kuartz ? 2 : 1
}

/** Carte Team de B1 : « 4 members » · « 2 from Kuartz ». */
export function teamCardText(summary: TeamSummary): { value: string; hint: string } {
  return {
    value: `${summary.members} ${summary.members === 1 ? 'member' : 'members'}`,
    hint: summary.kuartz > 0 ? `${summary.kuartz} from Kuartz` : 'No one from Kuartz',
  }
}
