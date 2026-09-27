import type { FieldDef } from '@/admin/core/contracts/manifest'

import {
  assertFieldPath,
  assertPublishedId,
  draftIdOf,
  isDocumentType,
  keyedTargetsExist,
  SanityWriteError,
} from './paths'
import type { DraftMutation, DraftStore, SanityDoc } from './store'
import { validateFieldValue } from './validate'

/**
 * Logique PURE des brouillons (sans Next, sans client réel) : testée avec un faux DraftStore.
 */

export type DocumentState<T = Record<string, unknown>> = {
  published: (T & SanityDoc) | null
  draft: (T & SanityDoc) | null
  /** Ce que l'interface affiche : le brouillon s'il existe, sinon le publié. */
  value: (T & SanityDoc) | null
}

export type DraftPatch = { set?: Record<string, unknown>; unset?: string[] }

/** Champs système jamais recopiés dans un nouveau brouillon (Sanity les recalcule). */
const SYSTEM_FIELDS = new Set(['_id', '_rev', '_createdAt', '_updatedAt', '_originalId', '_system'])

export function stripSystemFields(doc: SanityDoc): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).filter(([k]) => !SYSTEM_FIELDS.has(k)))
}

export async function getDocumentStateWith<T>(store: DraftStore, id: string): Promise<DocumentState<T>> {
  const publishedId = assertPublishedId(id)
  const [published, draft] = (await store.getDocuments([publishedId, draftIdOf(publishedId)])) as [
    (T & SanityDoc) | null,
    (T & SanityDoc) | null,
  ]
  return { published: published ?? null, draft: draft ?? null, value: draft ?? published ?? null }
}

/** Valide chemins et valeurs ; lève SanityWriteError('validation', …, { chemin: message }) au premier refus. */
export function validatePatch(patch: DraftPatch, fields?: Record<string, FieldDef>): { set: Record<string, unknown>; unset: string[] } {
  const set: Record<string, unknown> = {}
  const unset: string[] = []
  for (const [path, value] of Object.entries(patch.set ?? {})) {
    assertFieldPath(path)
    if (value === null || value === undefined) unset.push(path)
    else set[path] = value
  }
  for (const path of patch.unset ?? []) unset.push(assertFieldPath(path))
  if (Object.keys(set).length === 0 && unset.length === 0) throw new SanityWriteError('bad_request', 'Nothing to save.')

  for (const [path, field] of Object.entries(fields ?? {})) {
    if (!(path in set) && !unset.includes(path)) continue
    const message = validateFieldValue(field, path in set ? set[path] : null)
    if (message) throw new SanityWriteError('validation', message, { [path]: message })
  }
  return { set, unset }
}

/**
 * Applique un patch au brouillon, en UNE transaction :
 * 1. `createIfNotExists(drafts.<id>)` depuis le publié (sans champs système) si le brouillon n'existe pas encore —
 *    si un autre utilisateur le crée entre-temps, le sien est gardé ;
 * 2. `patch` set/unset sur `drafts.<id>`.
 */
export async function applyDraftPatch(
  store: DraftStore,
  id: string,
  patch: DraftPatch,
  fields?: Record<string, FieldDef>,
): Promise<{ draftId: string }> {
  const publishedId = assertPublishedId(id)
  const { set, unset } = validatePatch(patch, fields)
  const draftId = draftIdOf(publishedId)
  const [published, draft] = await store.getDocuments([publishedId, draftId])
  if (!published && !draft) throw new SanityWriteError('not_found', 'This item no longer exists.')
  // Un élément de tableau supprimé entre-temps (autre onglet, autre utilisateur) : refus explicite plutôt qu'un
  // patch sans effet que Sanity accepterait en silence.
  const base = draft ?? published
  for (const path of [...Object.keys(set), ...unset]) {
    if (!keyedTargetsExist(base, path)) throw new SanityWriteError('not_found', 'This item no longer exists. Reload and try again.')
  }

  const mutations: DraftMutation[] = []
  if (!draft && published) {
    mutations.push({ createIfNotExists: { ...stripSystemFields(published), _id: draftId, _type: published._type } })
  }
  mutations.push({
    patch: { id: draftId, ...(Object.keys(set).length ? { set } : {}), ...(unset.length ? { unset } : {}) },
  })
  await store.mutate(mutations)
  return { draftId }
}

/** Nouvel élément de collection (brouillon seul, publié plus tard par Publish). */
export async function createDraftWith(
  store: DraftStore,
  type: string,
  initial: Record<string, unknown>,
  options: { fields?: Record<string, FieldDef>; id?: string } = {},
): Promise<{ id: string; draftId: string }> {
  if (!isDocumentType(type)) throw new SanityWriteError('bad_request', 'Invalid document type.')
  for (const key of Object.keys(initial)) {
    if (!/^[A-Za-z][\w]*$/.test(key)) throw new SanityWriteError('bad_request', 'Invalid field name.')
  }
  for (const [name, field] of Object.entries(options.fields ?? {})) {
    const message = validateFieldValue(field, initial[name])
    if (message) throw new SanityWriteError('validation', message, { [name]: message })
  }
  const id = assertPublishedId(options.id ?? crypto.randomUUID())
  const draftId = draftIdOf(id)
  await store.mutate([{ create: { ...initial, _id: draftId, _type: type } }])
  return { id, draftId }
}

export async function deleteDraftWith(store: DraftStore, id: string): Promise<{ draftId: string }> {
  const draftId = draftIdOf(assertPublishedId(id))
  await store.mutate([{ delete: { id: draftId } }])
  return { draftId }
}
