import 'server-only'

import type { FieldDef } from '@/admin/core/contracts/manifest'
import { can } from '@/admin/core/contracts/roles'
import type { Session } from '@/admin/core/contracts/session'

import {
  insertItem,
  moveItem,
  updateDraftArrayWith,
  type ArrayItem,
  type ArrayMove,
  type ArrayPosition,
  type ArrayUpdateOptions,
} from './array-core'
import { getReadClient, getWriteClient } from './clients'
import {
  applyDraftPatch,
  createDraftWith,
  deleteDraftWith,
  getDocumentStateWith,
  type DocumentState,
  type DraftPatch,
} from './draft-core'
import { SanityWriteError } from './paths'
import { storeFromClient, type DraftStore } from './store'

/**
 * Aides communes aux features pour lire et écrire des BROUILLONS (`drafts.<id>`). SERVEUR SEULEMENT.
 * Chaque écriture exige une session avec le droit `content.write`, relit avec le jeton de l'utilisateur et valide
 * les valeurs d'après leur FieldDef quand il est fourni. La logique pure est dans draft-core.ts (testée).
 * `store` : injection pour les tests ; par défaut le vrai client.
 */

export type { DocumentState, DraftPatch } from './draft-core'
export type { ArrayItem, ArrayMove, ArrayPosition, ArrayUpdateOptions } from './array-core'
export { insertItem, moveItem, newArrayKey } from './array-core'

function writeStore(session: Session, store?: DraftStore): DraftStore {
  if (!can(session.role, 'content.write')) throw new SanityWriteError('forbidden', "You don't have access to this.")
  return store ?? storeFromClient(getWriteClient(session))
}

/** État d'un document : publié, brouillon, et la valeur à afficher (brouillon s'il existe). Jeton Viewer. */
export function getDocumentState<T = Record<string, unknown>>(id: string, options: { store?: DraftStore } = {}): Promise<DocumentState<T>> {
  return getDocumentStateWith<T>(options.store ?? storeFromClient(getReadClient({ perspective: 'raw' })), id)
}

/**
 * Écrit UN champ dans le brouillon (créé depuis le publié si besoin, dans la même transaction).
 * `value` null/undefined → unset. `field` : règles de validation (longueur, obligation, liste fermée…).
 */
export function saveDraftField(
  session: Session,
  id: string,
  path: string,
  value: unknown,
  options: { field?: FieldDef; store?: DraftStore } = {},
): Promise<{ draftId: string }> {
  const store = writeStore(session, options.store)
  const patch: DraftPatch = value === null || value === undefined ? { unset: [path] } : { set: { [path]: value } }
  return applyDraftPatch(store, id, patch, options.field ? { [path]: options.field } : undefined)
}

/** Écrit plusieurs champs d'un coup (une transaction). `fields` : FieldDef par chemin, pour la validation. */
export function setDraftFields(
  session: Session,
  id: string,
  patch: DraftPatch,
  options: { fields?: Record<string, FieldDef>; store?: DraftStore } = {},
): Promise<{ draftId: string }> {
  return applyDraftPatch(writeStore(session, options.store), id, patch, options.fields)
}

/** Nouvel élément de collection : `drafts.<uuid>` du type donné. Retourne l'id PUBLIÉ (sans « drafts. »). */
export function createDraft(
  session: Session,
  type: string,
  initial: Record<string, unknown> = {},
  options: { fields?: Record<string, FieldDef>; store?: DraftStore; id?: string } = {},
): Promise<{ id: string; draftId: string }> {
  return createDraftWith(writeStore(session, options.store), type, initial, options)
}

/** Supprime le brouillon d'un document (jamais la version publiée). Élément jamais publié → il disparaît. */
export function deleteDraft(session: Session, id: string, options: { store?: DraftStore } = {}): Promise<{ draftId: string }> {
  return deleteDraftWith(writeStore(session, options.store), id)
}

// ─── Tableaux du brouillon, sans course (ifRevisionID, relecture sur 409) : array-core.ts ─────────────────────────

/**
 * Transformation d'ensemble d'un tableau du brouillon (`update` PURE : elle peut être rappelée après relecture).
 * Ex. : `await updateDraftArray(session, 'siteSettings', 'scripts', (items) => items.filter(…), { field })`.
 */
export function updateDraftArray(
  session: Session,
  id: string,
  path: string,
  update: (items: ArrayItem[]) => ArrayItem[],
  options: ArrayUpdateOptions & { store?: DraftStore } = {},
): Promise<{ draftId: string; items: ArrayItem[] }> {
  return updateDraftArrayWith(writeStore(session, options.store), id, path, update, options)
}

/**
 * Ajoute un élément (clé générée s'il n'en a pas) : à la fin par défaut, ou `'start'`, `{ before: key }`, `{ after: key }`.
 * Retourne la clé de l'élément ajouté.
 */
export async function insertDraftArrayItem(
  session: Session,
  id: string,
  path: string,
  item: Record<string, unknown>,
  options: ArrayUpdateOptions & { position?: ArrayPosition; store?: DraftStore } = {},
): Promise<{ draftId: string; key: string; items: ArrayItem[] }> {
  let key = ''
  const result = await updateDraftArray(
    session,
    id,
    path,
    (items) => {
      const next = insertItem(items, item, options.position)
      key = next.find((i) => !items.some((old) => old._key === i._key))!._key
      return next
    },
    options,
  )
  return { ...result, key }
}

/** Déplace l'élément `key` : `'up'`, `'down'`, `'first'`, `'last'`, `{ before }`, `{ after }` ou `{ index }`. */
export function moveDraftArrayItem(
  session: Session,
  id: string,
  path: string,
  key: string,
  to: ArrayMove,
  options: ArrayUpdateOptions & { store?: DraftStore } = {},
): Promise<{ draftId: string; items: ArrayItem[] }> {
  return updateDraftArray(session, id, path, (items) => moveItem(items, key, to), options)
}
