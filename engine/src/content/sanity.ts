import { createClient, type SanityClient } from '@sanity/client'

/**
 * Accès Sanity du moteur, derrière un PORT minimal (injectable : les tests passent un faux en mémoire, `fake.ts`) :
 * lire des documents par id (brouillon et publié), créer un brouillon, le modifier (set / unset), le supprimer, lancer
 * des actions (publication avec verrou de révision, abandon de brouillon), et une requête GROQ.
 *
 * Le client réel utilise le jeton d'écriture « robot » (SANITY_API_WRITE_TOKEN, rôle Editor), la perspective `raw`
 * (les brouillons `drafts.*` sont des documents comme les autres), sans CDN. Jamais le jeton d'un utilisateur.
 */

export type SanityDoc = { _id: string; _type: string; _rev?: string; [field: string]: unknown }

export type PatchOps = {
  /** Objets créés s'ils manquent (chemin → valeur), AVANT `set`. */
  setIfMissing?: Record<string, unknown>
  set?: Record<string, unknown>
  unset?: string[]
  /** Verrou optimiste : la mutation échoue si la révision a changé. */
  ifRevisionId?: string
}

export type SanityAction =
  | { actionType: 'sanity.action.document.publish'; draftId: string; publishedId: string; ifDraftRevisionId?: string; ifPublishedRevisionId?: string }
  | { actionType: 'sanity.action.document.discard'; draftId: string; purge?: boolean }

export type SanityPort = {
  /** Documents par id, dans l'ordre (null = absent). */
  getDocuments(ids: string[]): Promise<(SanityDoc | null)[]>
  createIfNotExists(doc: SanityDoc): Promise<void>
  patch(id: string, ops: PatchOps): Promise<void>
  delete(id: string): Promise<void>
  /** API Actions (publication, abandon). */
  action(actions: SanityAction[]): Promise<void>
  fetch<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T>
}

export type SanityWriteSettings = { projectId: string; dataset: string; apiVersion: string; token: string }

/** Client Sanity du robot (jeton d'écriture), perspective raw, sans CDN. */
export function createRobotClient(settings: SanityWriteSettings): SanityClient {
  return createClient({
    projectId: settings.projectId,
    dataset: settings.dataset,
    apiVersion: settings.apiVersion.replace(/^v/, ''),
    token: settings.token,
    useCdn: false,
    perspective: 'raw',
    // Pas de stega : le moteur lit et écrit des valeurs brutes.
    stega: false,
    ignoreBrowserTokenWarning: true,
  })
}

/** Port Sanity sur un client réel. */
export function sanityPort(client: SanityClient): SanityPort {
  return {
    getDocuments: async (ids) => (await client.getDocuments(ids)) as (SanityDoc | null)[],
    createIfNotExists: async (doc) => void (await client.createIfNotExists(doc)),
    async patch(id, ops) {
      let patch = client.patch(id)
      if (ops.setIfMissing && Object.keys(ops.setIfMissing).length) patch = patch.setIfMissing(ops.setIfMissing)
      if (ops.set && Object.keys(ops.set).length) patch = patch.set(ops.set)
      if (ops.unset?.length) patch = patch.unset(ops.unset)
      if (ops.ifRevisionId) patch = patch.ifRevisionId(ops.ifRevisionId)
      await patch.commit({ autoGenerateArrayKeys: false })
    },
    delete: async (id) => void (await client.delete(id)),
    action: async (actions) => void (await client.action(actions)),
    fetch: (query, params) => client.fetch(query, params ?? {}),
  }
}

// ─── Publication et abandon (pour engine-publish) ───────────────────────────

export const draftIdOf = (id: string) => (id.startsWith('drafts.') ? id : `drafts.${id}`)
export const publishedIdOf = (id: string) => id.replace(/^drafts\./, '')

const PUBLISHED_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

function checkId(id: string): string {
  const published = publishedIdOf(id)
  if (!PUBLISHED_ID.test(published) || published.startsWith('drafts.') || published.includes('..')) {
    throw new Error('Invalid Sanity document id.')
  }
  return published
}

/**
 * Publie le brouillon d'un document (API Actions). `ifDraftRevisionId` : la publication échoue si le brouillon a changé
 * depuis que l'utilisateur a vu la liste (« conflict » côté engine-publish).
 */
export async function publishDocument(
  port: SanityPort,
  input: { id: string; ifDraftRevisionId?: string; ifPublishedRevisionId?: string },
): Promise<void> {
  const id = checkId(input.id)
  await port.action([
    {
      actionType: 'sanity.action.document.publish',
      draftId: draftIdOf(id),
      publishedId: id,
      ...(input.ifDraftRevisionId ? { ifDraftRevisionId: input.ifDraftRevisionId } : {}),
      ...(input.ifPublishedRevisionId ? { ifPublishedRevisionId: input.ifPublishedRevisionId } : {}),
    },
  ])
}

/** Abandonne le brouillon d'un document (le publié reste tel quel). */
export async function discardDraft(port: SanityPort, id: string): Promise<void> {
  await port.action([{ actionType: 'sanity.action.document.discard', draftId: draftIdOf(checkId(id)) }])
}

/** Brouillons du dataset (id, type, révision, date) : ce qui attend une publication côté contenu. */
export async function listDrafts(port: SanityPort): Promise<{ _id: string; _type: string; _rev: string; _updatedAt: string }[]> {
  return port.fetch('*[_id in path("drafts.**")]{_id, _type, _rev, _updatedAt} | order(_updatedAt desc)')
}
