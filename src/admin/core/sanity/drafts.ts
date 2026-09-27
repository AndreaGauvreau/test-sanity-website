import 'server-only'

import type { FieldDef } from '@/admin/core/contracts/manifest'
import { can } from '@/admin/core/contracts/roles'
import type { Session } from '@/admin/core/contracts/session'

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
