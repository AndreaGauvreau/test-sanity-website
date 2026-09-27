'use server'

import { requireCapability } from '@/admin/core/auth/session'

import { generalDeps } from './deps'
import { actionErrorMessage, isUnexpectedError } from './errors'
import { removeGeneralImage, saveGeneralValue, type ActionResult, type GeneralDeps } from './save'

/**
 * Server actions de B2 (Site Settings › General). Chacune commence par `requireCapability('content.write', 'action')`,
 * valide son entrée (zod, dans save.ts) et écrit dans le BROUILLON `drafts.siteSettings` au nom de l'utilisateur
 * (son jeton ; jeton robot seulement en session de dev). Réponse : `{ ok }` ou `{ ok: false, error }` (anglais).
 * Rien n'est publié ici : Publish (E1) s'en charge.
 *
 * L'ENVOI d'image n'est pas une action : route `POST /admin/settings/general/image` (upload-route.ts, FOLLOWUPS #40),
 * pour que `serverActions.bodySizeLimit` reste au défaut de Next (SEC-02). Ces actions ne portent que de petits JSON.
 */

async function run<T extends object>(label: string, work: (deps: GeneralDeps) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const session = await requireCapability('content.write', 'action')
    return await work(generalDeps(session))
  } catch (err) {
    if (isUnexpectedError(err)) console.error(`[admin/general] ${label} failed:`, err instanceof Error ? err.message : err)
    return { ok: false, error: actionErrorMessage(err) }
  }
}

/** Titre, description, indexation. Entrée : `{ field, value }`. */
export async function saveGeneralValueAction(input: unknown): Promise<ActionResult> {
  return run('save', (deps) => saveGeneralValue(deps, input))
}

/** Retire l'image d'un emplacement. Entrée : `{ slot }`. */
export async function removeGeneralImageAction(input: unknown): Promise<ActionResult> {
  return run('remove', (deps) => removeGeneralImage(deps, input))
}
