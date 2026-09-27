import { z } from 'zod'

/**
 * API de gestion des accès Sanity (Access API, https://www.sanity.io/docs/http-reference/access-api), appelée côté
 * SERVEUR avec le jeton de l'utilisateur (ses droits Sanity : seul un Administrator lit et invite).
 * `fetch` injectable (tests). Aucune donnée de jeton dans les erreurs.
 *
 * - GET  https://api.sanity.io/v2025-07-11/access/project/{projectId}/users    → { data: User[], nextCursor, totalCount }
 * - GET  https://api.sanity.io/v2025-07-11/access/project/{projectId}/invites  → { data: Invite[], nextCursor }
 * - POST https://api.sanity.io/v2025-07-11/access/project/{projectId}/invites  { email, role } → Invite
 */

export const ACCESS_API_VERSION = 'v2025-07-11'
const BASE = 'https://api.sanity.io'
const TIMEOUT_MS = 10_000
const MAX_PAGES = 10

export const accessUserSchema = z.object({
  sanityUserId: z.string(),
  profile: z
    .object({
      displayName: z.string().nullish(),
      email: z.string().nullish(),
      imageUrl: z.string().nullish(),
    })
    .partial()
    .nullish(),
  memberships: z
    .array(
      z.object({
        resourceType: z.string(),
        resourceId: z.string(),
        roleNames: z.array(z.string()).default([]),
        addedAt: z.string().nullish(),
      }),
    )
    .default([]),
})

export const accessInviteSchema = z.object({
  id: z.string(),
  status: z.string(),
  email: z.string().nullish(),
  role: z.string().nullish(),
  inviterType: z.string().nullish(),
  inviterId: z.string().nullish(),
  inviteeId: z.string().nullish(),
  createdAt: z.string().nullish(),
})

export type AccessUser = z.infer<typeof accessUserSchema>
export type AccessInvite = z.infer<typeof accessInviteSchema>

const usersPage = z.object({ data: z.array(accessUserSchema), nextCursor: z.string().nullish() })
const invitesPage = z.object({ data: z.array(accessInviteSchema), nextCursor: z.string().nullish() })

export type TeamErrorCode = 'forbidden' | 'unavailable' | 'bad_request' | 'conflict'

/** Erreur de l'API d'accès, message anglais prêt à afficher. */
export class TeamApiError extends Error {
  constructor(
    readonly code: TeamErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'TeamApiError'
  }
}

export type AccessDeps = { token: string; projectId: string; fetchImpl?: typeof fetch }

function assertProjectId(projectId: string): string {
  if (!/^[a-z0-9]{1,32}$/.test(projectId)) throw new TeamApiError('bad_request', 'The Sanity project is not configured.')
  return projectId
}

async function call(deps: AccessDeps, method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const url = `${BASE}/${ACCESS_API_VERSION}/access/project/${assertProjectId(deps.projectId)}/${path}`
  let res: Response
  try {
    res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${deps.token}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new TeamApiError('unavailable', "Sanity isn't responding. Please try again in a moment.")
  }
  if (res.status === 401 || res.status === 403) {
    throw new TeamApiError('forbidden', 'Your Sanity role doesn’t allow managing the members of this project.', res.status)
  }
  if (res.status === 409) throw new TeamApiError('conflict', 'This person already has an invitation or is already a member.', 409)
  if (res.status >= 400 && res.status < 500) {
    const detail = await res
      .json()
      .then((json: unknown) => (json as { message?: unknown; error?: { description?: unknown } })?.message ?? (json as { error?: { description?: unknown } })?.error?.description)
      .catch(() => undefined)
    throw new TeamApiError('bad_request', typeof detail === 'string' && detail.length < 200 ? `Sanity refused: ${detail}` : 'Sanity refused this request.', res.status)
  }
  if (!res.ok) throw new TeamApiError('unavailable', "Sanity isn't responding. Please try again in a moment.", res.status)
  try {
    return await res.json()
  } catch {
    throw new TeamApiError('unavailable', 'Sanity sent an unreadable answer.')
  }
}

async function paged<T>(deps: AccessDeps, path: string, schema: z.ZodType<{ data: T[]; nextCursor?: string | null }>): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null | undefined
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: '100' })
    if (cursor) query.set('nextCursor', cursor)
    const parsed = schema.safeParse(await call(deps, 'GET', `${path}?${query}`))
    if (!parsed.success) throw new TeamApiError('unavailable', 'Sanity sent an unexpected answer.')
    out.push(...parsed.data.data)
    cursor = parsed.data.nextCursor
    if (!cursor) break
  }
  return out
}

/** Membres du projet (utilisateurs ; les robots, s'il y en a, sont filtrés par `members.ts`). */
export function listProjectUsers(deps: AccessDeps): Promise<AccessUser[]> {
  return paged(deps, 'users', usersPage)
}

/** Invitations du projet (en attente, acceptées, révoquées). */
export function listProjectInvites(deps: AccessDeps): Promise<AccessInvite[]> {
  return paged(deps, 'invites', invitesPage)
}

/** Invite une personne avec un rôle du projet. */
export async function createProjectInvite(deps: AccessDeps, invite: { email: string; role: string }): Promise<AccessInvite> {
  const parsed = accessInviteSchema.safeParse(await call(deps, 'POST', 'invites', invite))
  if (!parsed.success) throw new TeamApiError('unavailable', 'Sanity sent an unexpected answer.')
  return parsed.data
}

/** Gestion des membres sur sanity.io (lien « Invite in Sanity ↗ »). */
export function sanityManageMembersUrl(projectId: string): string {
  return `https://www.sanity.io/manage/project/${encodeURIComponent(projectId)}/members`
}
