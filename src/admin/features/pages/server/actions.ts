'use server'

import { AdminAuthError, requireCapability } from '@/admin/core/auth/session'

import { saveArticleSeo, savePageField, savePageSeo, type SaveResult } from './save'

/**
 * Server actions des écrans C1, C2, C6. Chacune : droit `content.write` EN PREMIER, puis le cœur (save.ts) qui
 * valide l'entrée (zod), retrouve le chemin dans le manifeste et la valeur d'après son FieldDef avant d'écrire le
 * brouillon. Réponse sérialisable, message anglais prêt à afficher ; jamais d'exception vers le navigateur.
 */

async function guarded(run: (session: Awaited<ReturnType<typeof requireCapability>>) => Promise<SaveResult>): Promise<SaveResult> {
  let session
  try {
    session = await requireCapability('content.write', 'action')
  } catch (err) {
    if (err instanceof AdminAuthError) return { ok: false, error: err.message }
    throw err
  }
  return run(session)
}

/** C1 : un champ (ou un tableau à longueur variable) du document de la page. */
export async function savePageFieldAction(input: unknown): Promise<SaveResult> {
  return guarded((session) => savePageField(session, input))
}

/** C2 : un champ SEO de la page (meta title, description, image OG, indexation). */
export async function savePageSeoAction(input: unknown): Promise<SaveResult> {
  return guarded((session) => savePageSeo(session, input))
}

/** C6 : un champ du modèle SEO des pages article. */
export async function saveArticleSeoAction(input: unknown): Promise<SaveResult> {
  return guarded((session) => saveArticleSeo(session, input))
}
