import 'server-only'

import type { CollectionDef } from '@/admin/core/contracts/manifest'
import { getReadClient } from '@/admin/core/sanity/clients'

import type { CollectionCounts } from './nav'

/**
 * Comptes d'éléments des collections pour la sidebar (« Blog 12 », « slug: 12 »). SERVEUR SEULEMENT.
 * Une seule requête GROQ, perspective `drafts` (brouillons superposés au publié : un élément créé en brouillon
 * compte déjà, un élément publié qui a un brouillon ne compte qu'une fois), jeton Viewer, sans CDN.
 * Échec ou délai dépassé : comptes `null` (la sidebar n'affiche rien) — la coque ne tombe jamais pour un compteur.
 */

/** Client minimal (injectable dans les tests). */
export type CountClient = {
  fetch: (query: string, params: Record<string, string>, options: { signal?: AbortSignal; cache?: RequestCache }) => Promise<unknown>
}

export const COUNT_TIMEOUT_MS = 2500

/** `{ "c0": count(*[_type == $t0]), … }` : les types passent en paramètres, jamais dans le texte de la requête. */
export function buildCountQuery(collections: readonly Pick<CollectionDef, 'type'>[]): { query: string; params: Record<string, string> } {
  const params: Record<string, string> = {}
  const parts = collections.map((c, i) => {
    params[`t${i}`] = c.type
    return `"c${i}": count(*[_type == $t${i}])`
  })
  return { query: `{${parts.join(', ')}}`, params }
}

export async function fetchCollectionCounts(
  client: CountClient,
  collections: readonly Pick<CollectionDef, 'id' | 'type'>[],
  timeoutMs = COUNT_TIMEOUT_MS,
): Promise<CollectionCounts> {
  const empty: Record<string, number | null> = Object.fromEntries(collections.map((c) => [c.id, null]))
  if (collections.length === 0) return empty
  const { query, params } = buildCountQuery(collections)
  try {
    const result = await client.fetch(query, params, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
    if (!result || typeof result !== 'object') return empty
    const row = result as Record<string, unknown>
    return Object.fromEntries(
      collections.map((c, i) => {
        const n = row[`c${i}`]
        return [c.id, typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null]
      }),
    )
  } catch (err) {
    // Sanity injoignable, jeton absent, délai : on le signale au serveur, sans casser la coque.
    console.warn('[admin shell] collection counts unavailable:', err instanceof Error ? err.message : err)
    return empty
  }
}

export function getCollectionCounts(collections: readonly Pick<CollectionDef, 'id' | 'type'>[]): Promise<CollectionCounts> {
  let client: CountClient
  try {
    client = getReadClient({ perspective: 'drafts' }) as unknown as CountClient
  } catch {
    return Promise.resolve(Object.fromEntries(collections.map((c) => [c.id, null])))
  }
  return fetchCollectionCounts(client, collections)
}
