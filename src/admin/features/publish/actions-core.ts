import { z } from 'zod'

import type { EngineErrorCode, Publication, PublishStatus } from '@/admin/core/contracts/engine'
import type { Capability } from '@/admin/core/contracts/roles'
import type { Session } from '@/admin/core/contracts/session'
import { EngineRequestError } from '@/admin/core/engine/errors'
import type { EngineMethod } from '@/admin/core/engine/routes'

/**
 * Logique des server actions de la publication (actions.ts), sans Next : dépendances injectées, testée avec de
 * faux clients. Chaque action : (1) droit EN PREMIER (`requireCapability(…, 'action')`), (2) entrées validées par zod,
 * (3) appel du moteur par `engineFetch` (liste blanche + identité signée), (4) résultat sérialisable, jamais
 * d'exception vers le navigateur (Next masquerait le message en production).
 */

export type ActionErrorCode = EngineErrorCode
export type ActionResult<T> = { ok: true; data: T } | { ok: false; status: number; code: ActionErrorCode; message: string }

export type ActionDeps = {
  requireCapability: (capability: Capability, context: 'action') => Promise<Session>
  engineFetch: <T>(session: Session, method: EngineMethod, path: string, options?: { body?: unknown }) => Promise<T>
  log?: (message: string) => void
}

/** Messages anglais propres à la publication (les autres viennent du moteur). */
export const PUBLISH_MESSAGES = {
  conflict: 'The list of changes was updated while you were reviewing it. Check it again, then publish.',
  nothing: 'Nothing to publish.',
  invalid: 'Invalid request.',
  rollbackLocal: 'Roll back isn’t available in local mode: this site has no Vercel deployment to return to.',
  unexpected: 'Something went wrong. Try again.',
} as const

// ─── Schémas ────────────────────────────────────────────────────────────────

/** Id publié Sanity ou id de modification du moteur : pas de « drafts. », pas de chemin. */
const itemId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_][\w.-]*$/)
  .refine((v) => !v.startsWith('drafts.'), 'Use the published id.')

export const publishInput = z.object({ expected: z.array(itemId).min(1).max(500) }).strict()

export const discardInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('content'), id: itemId }).strict(),
  z.object({ kind: z.literal('design'), changeId: itemId }).strict(),
])

export const diffInput = z.object({ changeId: itemId }).strict()

export const rollbackInput = z.object({ number: z.number().int().min(1).max(999_999) }).strict()

// ─── Erreurs ────────────────────────────────────────────────────────────────

function isAuthError(err: unknown): err is { status: 401 | 403; code: 'unauthorized' | 'forbidden'; message: string } {
  const e = err as { name?: unknown; status?: unknown } | null
  return !!e && e.name === 'AdminAuthError' && (e.status === 401 || e.status === 403)
}

export function toActionError(err: unknown, log?: (m: string) => void): { ok: false; status: number; code: ActionErrorCode; message: string } {
  if (isAuthError(err)) return { ok: false, status: err.status, code: err.code, message: err.message }
  if (err instanceof EngineRequestError) return { ok: false, status: err.status, code: err.code, message: err.message }
  log?.(`[publish] unexpected error: ${err instanceof Error ? err.message : String(err)}`)
  return { ok: false, status: 500, code: 'internal', message: PUBLISH_MESSAGES.unexpected }
}

function invalid(): { ok: false; status: number; code: ActionErrorCode; message: string } {
  return { ok: false, status: 400, code: 'bad_request', message: PUBLISH_MESSAGES.invalid }
}

// ─── Actions ────────────────────────────────────────────────────────────────

/** Publish N changes (E1, Top bar) : `expected` = ids affichés ; 409 conflict si la liste a changé. */
export async function publishCore(deps: ActionDeps, raw: unknown): Promise<ActionResult<PublishStatus>> {
  try {
    const session = await deps.requireCapability('publish.run', 'action')
    const parsed = publishInput.safeParse(raw)
    if (!parsed.success) {
      const empty = Array.isArray((raw as { expected?: unknown } | null)?.expected) && (raw as { expected: unknown[] }).expected.length === 0
      return empty ? { ok: false, status: 400, code: 'bad_request', message: PUBLISH_MESSAGES.nothing } : invalid()
    }
    const data = await deps.engineFetch<PublishStatus>(session, 'POST', 'publish', { body: { expected: parsed.data.expected } })
    return { ok: true, data }
  } catch (err) {
    const result = toActionError(err, deps.log)
    // La liste a changé entre l'affichage et le clic : message clair, l'interface relit l'état.
    if (result.code === 'conflict') return { ...result, message: PUBLISH_MESSAGES.conflict }
    return result
  }
}

/** Retry après un échec : reprend à l'étape en échec. */
export async function retryCore(deps: ActionDeps): Promise<ActionResult<PublishStatus>> {
  try {
    const session = await deps.requireCapability('publish.run', 'action')
    const data = await deps.engineFetch<PublishStatus>(session, 'POST', 'publish/retry', { body: {} })
    return { ok: true, data }
  } catch (err) {
    return toActionError(err, deps.log)
  }
}

/** Discard : supprime un brouillon de contenu ou annule une modification IA validée. */
export async function discardCore(deps: ActionDeps, raw: unknown): Promise<ActionResult<PublishStatus>> {
  try {
    const session = await deps.requireCapability('publish.run', 'action')
    const parsed = discardInput.safeParse(raw)
    if (!parsed.success) return invalid()
    const data = await deps.engineFetch<PublishStatus>(session, 'POST', 'publish/discard', { body: parsed.data })
    return { ok: true, data }
  } catch (err) {
    return toActionError(err, deps.log)
  }
}

/** ‹/› Diff d'une modification IA : Kuartz seulement (publish.diff). */
export async function diffCore(deps: ActionDeps, raw: unknown): Promise<ActionResult<{ diff: string }>> {
  try {
    const session = await deps.requireCapability('publish.diff', 'action')
    const parsed = diffInput.safeParse(raw)
    if (!parsed.success) return invalid()
    const data = await deps.engineFetch<{ diff: string }>(session, 'GET', `publish/diff/${parsed.data.changeId}`)
    return { ok: true, data: { diff: typeof data?.diff === 'string' ? data.diff : '' } }
  } catch (err) {
    return toActionError(err, deps.log)
  }
}

/** Roll back to this version (E2) : Kuartz seulement ; 501 not_implemented en mode local → message clair. */
export async function rollbackCore(deps: ActionDeps, raw: unknown): Promise<ActionResult<Publication>> {
  try {
    const session = await deps.requireCapability('versions.rollback', 'action')
    const parsed = rollbackInput.safeParse(raw)
    if (!parsed.success) return invalid()
    const data = await deps.engineFetch<Publication>(session, 'POST', `versions/${parsed.data.number}/rollback`, { body: {} })
    return { ok: true, data }
  } catch (err) {
    const result = toActionError(err, deps.log)
    // Le message du moteur peut être technique : celui-ci dit quoi faire (question 5, mode local).
    if (result.code === 'not_implemented') return { ...result, message: PUBLISH_MESSAGES.rollbackLocal }
    return result
  }
}
