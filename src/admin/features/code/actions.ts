'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'

import { AdminAuthError, requireCapability } from '@/admin/core/auth/session'
import type { Session } from '@/admin/core/contracts/session'
import { SanityWriteError } from '@/admin/core/sanity/paths'

import { CODE_MAX } from './scripts'
import { createScript, deleteScript, moveScript, setScriptEnabled, updateScript } from './script-writes'

/**
 * Server actions de B3 (scripts du site). Chacune :
 * 1. `requireCapability('settings.code', 'action')` EN PREMIER (Kuartz seulement) — le code est injecté tel quel
 *    sur le site publié : c'est une exécution de code voulue, réservée à ce droit ;
 * 2. valide ses entrées (zod, puis `checkScript` + FieldDef dans script-writes.ts) ;
 * 3. écrit le brouillon de siteSettings, puis `refresh()` (la liste B3 est relue par le Server Component).
 * Réponse : `{ ok: true }` ou `{ ok: false, error, fieldErrors? }` (messages anglais prêts à afficher).
 */

export type ScriptActionResult = { ok: true; key: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }

const key = z.string().regex(/^[\w-]{1,64}$/)

const values = z.object({
  name: z.string().max(500),
  placement: z.enum(['headEnd', 'bodyStart', 'bodyEnd']),
  page: z.string().min(1).max(100),
  run: z.enum(['once', 'everyPageVisit']),
  code: z.string().max(CODE_MAX + 1),
})

const saveInput = z.object({ key: key.optional(), values }).strict()
const enabledInput = z.object({ key, enabled: z.boolean() }).strict()
const keyInput = z.object({ key }).strict()
const moveInput = z.object({ key, direction: z.enum(['up', 'down']) }).strict()

const GENERIC = "Couldn't save the script. Please try again."

function failure(err: unknown): ScriptActionResult {
  if (err instanceof AdminAuthError) return { ok: false, error: err.status === 401 ? 'Your session has expired. Sign in again.' : "You don't have access to this." }
  if (err instanceof SanityWriteError) {
    return { ok: false, error: err.message, ...(err.code === 'validation' && err.details ? { fieldErrors: err.details } : {}) }
  }
  console.error('[code] script write failed', err)
  return { ok: false, error: GENERIC }
}

/** Droit d'abord, puis entrées, puis écriture ; `refresh()` relit la liste B3 après une écriture réussie. */
async function run<T>(input: unknown, schema: z.ZodType<T>, write: (session: Session, data: T) => Promise<{ key: string }>): Promise<ScriptActionResult> {
  let session: Session
  try {
    session = await requireCapability('settings.code', 'action')
  } catch (err) {
    return failure(err)
  }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }
  try {
    const { key } = await write(session, parsed.data)
    refresh()
    return { ok: true, key }
  } catch (err) {
    return failure(err)
  }
}

/** Nouveau script (`key` absent) ou modification (`key` donné). */
export async function saveScriptAction(input: { key?: string; values: z.infer<typeof values> }): Promise<ScriptActionResult> {
  return run(input, saveInput, (session, data) => (data.key ? updateScript(session, data.key, data.values) : createScript(session, data.values)))
}

export async function setScriptEnabledAction(input: { key: string; enabled: boolean }): Promise<ScriptActionResult> {
  return run(input, enabledInput, (session, data) => setScriptEnabled(session, data.key, data.enabled))
}

export async function deleteScriptAction(input: { key: string }): Promise<ScriptActionResult> {
  return run(input, keyInput, (session, data) => deleteScript(session, data.key))
}

export async function moveScriptAction(input: { key: string; direction: 'up' | 'down' }): Promise<ScriptActionResult> {
  return run(input, moveInput, (session, data) => moveScript(session, data.key, data.direction))
}
