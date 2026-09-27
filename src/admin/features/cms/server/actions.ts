'use server'

import {
  createItemCore,
  deleteItemsCore,
  reorderCore,
  saveFieldCore,
  statusActionCore,
  type ActionResult,
  type ReorderResult,
  type SaveFieldResult,
} from './actions-core'
import { cmsDeps } from './deps'
import type { CmsRow } from '../lib/rows'
import type { CmsStatus } from '../lib/status'

/**
 * Server actions du CMS (C3, C4, G5). Minces : droit, zod, manifeste et écriture sont dans actions-core.ts
 * (testé avec un faux magasin). Les entrées sont typées pour l'appelant mais revalidées côté serveur.
 */

export async function saveFieldAction(input: { collectionId: string; id: string; field: string; value: unknown }): Promise<SaveFieldResult> {
  return saveFieldCore(cmsDeps(), input)
}

export async function createItemAction(input: { collectionId: string }): Promise<ActionResult<{ id: string }>> {
  return createItemCore(cmsDeps(), input)
}

export async function reorderAction(input: { collectionId: string; id: string; beforeId: string | null; afterId: string | null }): Promise<ReorderResult> {
  return reorderCore(cmsDeps(), input)
}

export async function statusAction(input: {
  collectionId: string
  id: string
  action: 'discard' | 'delete-draft'
}): Promise<ActionResult<{ status: CmsStatus | null; row: CmsRow | null }>> {
  return statusActionCore(cmsDeps(), input)
}

export async function deleteItemsAction(input: { collectionId: string; ids: string[] }): Promise<ActionResult<{ deleted: string[]; skipped: string[] }>> {
  return deleteItemsCore(cmsDeps(), input)
}
