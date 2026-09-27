import type { SanityClient } from '@sanity/client'

import { SanityWriteError } from './paths'

/**
 * Accès minimal à Sanity utilisé par les aides de brouillon : lire des documents par id, appliquer des mutations
 * brutes en UNE transaction. Interface étroite = faux client trivial dans les tests.
 */

export type SanityDoc = { _id: string; _type: string; _rev?: string; [field: string]: unknown }

export type DraftMutation =
  | { createIfNotExists: SanityDoc }
  | { create: SanityDoc }
  | { patch: { id: string; set?: Record<string, unknown>; unset?: string[]; ifRevisionID?: string } }
  | { delete: { id: string } }

export interface DraftStore {
  /** Documents par id, dans l'ordre demandé (null si absent ou illisible). */
  getDocuments(ids: string[]): Promise<(SanityDoc | null)[]>
  /** Applique les mutations atomiquement (une transaction). */
  mutate(mutations: DraftMutation[]): Promise<void>
}

/** Adaptateur du vrai client. Traduit les erreurs HTTP de Sanity en SanityWriteError (message anglais). */
export function storeFromClient(client: SanityClient): DraftStore {
  return {
    async getDocuments(ids) {
      try {
        const docs = await client.getDocuments<Record<string, unknown>>(ids)
        return docs.map((d) => (d ? (d as unknown as SanityDoc) : null))
      } catch (err) {
        throw toWriteError(err)
      }
    },
    async mutate(mutations) {
      try {
        // Les formes de DraftMutation sont celles de l'API de mutation de Sanity.
        await client.mutate(mutations as Parameters<SanityClient['mutate']>[0], { visibility: 'sync', returnDocuments: false })
      } catch (err) {
        throw toWriteError(err)
      }
    },
  }
}

export function toWriteError(err: unknown): SanityWriteError {
  if (err instanceof SanityWriteError) return err
  const status = (err as { statusCode?: unknown })?.statusCode
  if (status === 401 || status === 403) {
    return new SanityWriteError('forbidden', "You don't have permission to edit this in Sanity.")
  }
  if (status === 404) return new SanityWriteError('not_found', 'This item no longer exists.')
  if (status === 409) return new SanityWriteError('bad_request', 'This item was changed at the same time. Reload and try again.')
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new SanityWriteError('bad_request', "Sanity rejected this change.")
  }
  return new SanityWriteError('unavailable', "Sanity isn't responding. Please try again in a moment.")
}
