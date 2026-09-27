'use server'

import adminConfig from '@/admin.config'
import { requireCapability } from '@/admin/core/auth/session'
import type { Session } from '@/admin/core/contracts'
import { getWriteClient } from '@/admin/core/sanity/clients'
import { saveDraftField } from '@/admin/core/sanity/drafts'
import { readSanityEnv } from '@/admin/core/sanity/env'
import { toWriteError } from '@/admin/core/sanity/store'

import { actionErrorMessage, isUnexpectedError } from './errors'
import { removeGeneralImage, saveGeneralValue, uploadGeneralImage, type ActionResult, type GeneralDeps } from './save'
import type { GeneralImage } from './images'

/**
 * Server actions de B2 (Site Settings › General). Chacune commence par `requireCapability('content.write', 'action')`,
 * valide son entrée (zod, dans save.ts) et écrit dans le BROUILLON `drafts.siteSettings` au nom de l'utilisateur
 * (son jeton ; jeton robot seulement en session de dev). Réponse : `{ ok }` ou `{ ok: false, error }` (anglais).
 * Rien n'est publié ici : Publish (E1) s'en charge.
 */

function depsFor(session: Session): GeneralDeps {
  const env = readSanityEnv()
  const id = adminConfig.settings.id
  return {
    projectId: env.projectId,
    dataset: env.dataset,
    saveField: (path, value, field) => saveDraftField(session, id, path, value, { field }),
    async uploadImage(bytes, { filename, contentType }) {
      const client = getWriteClient(session)
      try {
        const asset = await client.assets.upload('image', Buffer.from(bytes), { filename, contentType })
        return { _id: asset._id }
      } catch (err) {
        throw toWriteError(err)
      }
    },
  }
}

async function run<T extends object>(label: string, work: (deps: GeneralDeps) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const session = await requireCapability('content.write', 'action')
    return await work(depsFor(session))
  } catch (err) {
    if (isUnexpectedError(err)) console.error(`[admin/general] ${label} failed:`, err instanceof Error ? err.message : err)
    return { ok: false, error: actionErrorMessage(err) }
  }
}

/** Titre, description, indexation. Entrée : `{ field, value }`. */
export async function saveGeneralValueAction(input: unknown): Promise<ActionResult> {
  return run('save', (deps) => saveGeneralValue(deps, input))
}

/** Envoi d'un favicon ou de l'image sociale. Entrée : FormData `{ slot, file }`. */
export async function uploadGeneralImageAction(form: FormData): Promise<ActionResult<{ image: GeneralImage }>> {
  return run('upload', (deps) => uploadGeneralImage(deps, form))
}

/** Retire l'image d'un emplacement. Entrée : `{ slot }`. */
export async function removeGeneralImageAction(input: unknown): Promise<ActionResult> {
  return run('remove', (deps) => removeGeneralImage(deps, input))
}
