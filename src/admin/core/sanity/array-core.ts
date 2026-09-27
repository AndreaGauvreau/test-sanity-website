import type { FieldDef } from '@/admin/core/contracts/manifest'

import { stripSystemFields } from './draft-core'
import {
  assertFieldPath,
  assertPublishedId,
  draftIdOf,
  getValueAtPath,
  isWriteConflict,
  keyedTargetsExist,
  SanityWriteError,
} from './paths'
import type { DraftMutation, DraftStore } from './store'
import { validateFieldValue } from './validate'

/**
 * Écritures d'un TABLEAU du brouillon (insertion, réordonnancement, mise à jour d'ensemble) sans course : logique PURE
 * testée avec un faux DraftStore (FOLLOWUPS #20).
 *
 * Problème réglé : une feature qui relit le tableau, le modifie puis réécrit le tableau ENTIER efface ce qu'un autre
 * onglet ou utilisateur a écrit entre-temps. Ici chaque écriture est conditionnée :
 * - brouillon existant → `patch { set, ifRevisionID: <_rev lu> }` : Sanity refuse (409) si le brouillon a changé ;
 * - pas de brouillon → `create(drafts.<id>)` (et non createIfNotExists) : 409 si un brouillon est né entre-temps.
 * Sur 409 on RELIT et on réapplique la transformation (pure) ; après `attempts` essais, erreur « changed at the same
 * time » (message anglais de toWriteError).
 */

export type ArrayItem = Record<string, unknown> & { _key: string }

export type ArrayPosition = 'start' | 'end' | { before: string } | { after: string }
export type ArrayMove = 'up' | 'down' | 'first' | 'last' | { before: string } | { after: string } | { index: number }

export type ArrayUpdateOptions = {
  /** FieldDef du tableau (kind 'array') : bornes min/max, sous-champs, clés uniques. Recommandé. */
  field?: FieldDef
  /** Essais en cas d'écriture concurrente (défaut 3, borné à 1..5). */
  attempts?: number
}

const KEY_PATTERN = /^[\w-]{1,64}$/

function asItems(value: unknown): ArrayItem[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new SanityWriteError('bad_request', 'This field is not a list.')
  return value.map((item) => {
    if (!item || typeof item !== 'object' || typeof (item as { _key?: unknown })._key !== 'string') {
      throw new SanityWriteError('bad_request', 'This list has an item without a key. Reload and try again.')
    }
    return item as ArrayItem
  })
}

/** Contrôle structurel de tout tableau écrit : objets avec `_key` sûr et unique. */
function assertWellFormed(items: readonly unknown[]): void {
  const seen = new Set<string>()
  for (const item of items) {
    const key = item && typeof item === 'object' ? (item as { _key?: unknown })._key : undefined
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) throw new SanityWriteError('bad_request', 'Invalid list item.')
    if (seen.has(key)) throw new SanityWriteError('bad_request', 'Two list items have the same key.')
    seen.add(key)
  }
}

function indexOfKey(items: readonly ArrayItem[], key: string): number {
  const index = items.findIndex((item) => item._key === key)
  if (index === -1) throw new SanityWriteError('not_found', 'This item no longer exists. Reload and try again.')
  return index
}

/** Clé Sanity courte et aléatoire (12 caractères hexadécimaux, comme le Studio). */
export function newArrayKey(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

/** Transformation pure : insère `item` à la position demandée (clé générée si absente, jamais en double). */
export function insertItem(items: readonly ArrayItem[], item: Record<string, unknown>, position: ArrayPosition = 'end'): ArrayItem[] {
  const taken = new Set(items.map((i) => i._key))
  let key = typeof item._key === 'string' ? item._key : newArrayKey()
  if (typeof item._key !== 'string') while (taken.has(key)) key = newArrayKey()
  if (taken.has(key)) throw new SanityWriteError('bad_request', 'Two list items have the same key.')
  const next = [...items]
  const entry = { ...item, _key: key } as ArrayItem
  if (position === 'start') next.unshift(entry)
  else if (position === 'end') next.push(entry)
  else if ('before' in position) next.splice(indexOfKey(items, position.before), 0, entry)
  else next.splice(indexOfKey(items, position.after) + 1, 0, entry)
  return next
}

/** Transformation pure : déplace l'élément `key`. Déjà en place (premier qui monte…) → erreur claire. */
export function moveItem(items: readonly ArrayItem[], key: string, to: ArrayMove): ArrayItem[] {
  const from = indexOfKey(items, key)
  const rest = items.filter((_, i) => i !== from)
  let target: number
  if (to === 'up') target = from - 1
  else if (to === 'down') target = from + 1
  else if (to === 'first') target = 0
  else if (to === 'last') target = items.length - 1
  else if ('index' in to) target = to.index
  else if ('before' in to) target = indexOfKey(rest, to.before)
  else target = indexOfKey(rest, to.after) + 1
  if (!Number.isInteger(target) || target < 0 || target > items.length - 1) {
    throw new SanityWriteError('bad_request', to === 'up' || to === 'first' ? 'This item is already first.' : 'This item is already last.')
  }
  if (target === from && (to === 'up' || to === 'down')) throw new SanityWriteError('bad_request', 'This item is already in place.')
  rest.splice(target, 0, items[from])
  return rest
}

/**
 * Applique `update` au tableau `path` du brouillon de `id`, en écriture conditionnée (voir en tête de fichier).
 * `update` reçoit une COPIE des éléments actuels (brouillon s'il existe, sinon publié) et renvoie le nouveau tableau ;
 * elle peut être rappelée (relecture après 409) : elle doit être PURE. Retourne le tableau écrit.
 */
export async function updateDraftArrayWith(
  store: DraftStore,
  id: string,
  path: string,
  update: (items: ArrayItem[]) => ArrayItem[],
  options: ArrayUpdateOptions = {},
): Promise<{ draftId: string; items: ArrayItem[] }> {
  const publishedId = assertPublishedId(id)
  assertFieldPath(path)
  const draftId = draftIdOf(publishedId)
  const attempts = Math.min(5, Math.max(1, options.attempts ?? 3))

  for (let attempt = 1; ; attempt++) {
    const [published, draft] = await store.getDocuments([publishedId, draftId])
    if (!published && !draft) throw new SanityWriteError('not_found', 'This item no longer exists.')
    const base = (draft ?? published)!
    if (!keyedTargetsExist(base, path)) throw new SanityWriteError('not_found', 'This item no longer exists. Reload and try again.')

    const next = update(asItems(getValueAtPath(base, path)).map((item) => ({ ...item })))
    assertWellFormed(next)
    if (options.field) {
      const message = validateFieldValue(options.field, next)
      if (message) throw new SanityWriteError('validation', message, { [path]: message })
    }

    const mutations: DraftMutation[] = draft
      ? [{ patch: { id: draftId, set: { [path]: next }, ...(draft._rev ? { ifRevisionID: draft._rev } : {}) } }]
      : [
          { create: { ...stripSystemFields(published!), _id: draftId, _type: published!._type } },
          { patch: { id: draftId, set: { [path]: next } } },
        ]
    try {
      await store.mutate(mutations)
      return { draftId, items: next }
    } catch (err) {
      if (isWriteConflict(err) && attempt < attempts) continue
      throw err
    }
  }
}
