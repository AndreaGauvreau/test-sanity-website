import type { FieldDef } from '@/admin/core/contracts'

/**
 * Aides pures du formulaire généré (C1) : lecture des valeurs, chemins, éléments de tableau.
 * Les chemins produits ici sont ceux que `resolveFieldAtPath` (manifest.ts) accepte côté serveur.
 */

export type Obj = Record<string, unknown>

export function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function childOf(value: unknown, name: string): unknown {
  return isObj(value) ? value[name] : undefined
}

/** Chemin d'un champ sous un parent : `hero` + `title` → `hero.title`. */
export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}.${name}` : name
}

/** Chemin d'un élément de tableau : `hero.ratings` + `g2` → `hero.ratings[_key=="g2"]`. */
export function itemPath(arrayPath: string, key: string): string {
  return `${arrayPath}[_key=="${key}"]`
}

/** Tableau à longueur fixe (min === max) : ni ajout ni suppression, chaque champ s'enregistre seul. */
export function isFixedLength(field: FieldDef): boolean {
  return field.kind === 'array' && field.min !== undefined && field.min === field.max
}

const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Clé `_key` d'un nouvel élément (12 caractères, [a-z0-9], compatible avec le motif de validation). */
export function newKey(random: () => number = Math.random): string {
  let key = ''
  for (let i = 0; i < 12; i++) key += KEY_ALPHABET[Math.floor(random() * KEY_ALPHABET.length)]
  return key
}

/**
 * Nouvel élément d'un tableau : `_key` neuf et `_type` = `FieldDef.itemType` quand le manifeste le déclare, sinon
 * repris d'un élément voisin (absent si le tableau est vide et sans `itemType`).
 */
export function newArrayItem(siblings: readonly unknown[], random?: () => number, itemType?: string): Obj {
  const type = itemType || siblings.map((s) => childOf(s, '_type')).find((t): t is string => typeof t === 'string')
  const existing = new Set(siblings.map((s) => childOf(s, '_key')))
  let key = newKey(random)
  while (existing.has(key)) key = newKey(random)
  return type ? { _key: key, _type: type } : { _key: key }
}

/**
 * Opération sur un tableau à longueur variable, par CLÉ d'élément (server action `savePageArrayAction`, écritures sans
 * course de core/sanity). Jamais le tableau entier : un ajout fait ailleurs entre-temps n'est pas effacé.
 */
export type ArrayOp =
  | { op: 'insert'; item: Obj; after: string | null }
  | { op: 'update'; item: Obj }
  | { op: 'remove'; key: string }
  | { op: 'move'; key: string; to: { before: string } | { after: string } }

const keyOf = (item: Obj): string => item._key as string

/** Clé de l'élément enregistré le plus proche AVANT `key` dans l'ordre local (null : aucun, insérer au début). */
export function previousSavedKey(items: readonly Obj[], key: string, unsaved: ReadonlySet<string>): string | null {
  const index = items.findIndex((item) => keyOf(item) === key)
  for (let i = index - 1; i >= 0; i--) if (!unsaved.has(keyOf(items[i]))) return keyOf(items[i])
  return null
}

/**
 * Destination d'un déplacement d'après l'ordre LOCAL : avant l'élément enregistré qui le suit, sinon après celui qui le
 * précède ; null s'il est seul parmi les éléments enregistrés (rien à envoyer).
 */
export function moveTarget(items: readonly Obj[], key: string, unsaved: ReadonlySet<string>): { before: string } | { after: string } | null {
  const index = items.findIndex((item) => keyOf(item) === key)
  if (index === -1) return null
  for (let i = index + 1; i < items.length; i++) if (!unsaved.has(keyOf(items[i]))) return { before: keyOf(items[i]) }
  const previous = previousSavedKey(items, key, unsaved)
  return previous ? { after: previous } : null
}

/**
 * Tableau affiché après une écriture : ordre et éléments du SERVEUR (ajouts faits ailleurs inclus, retraits faits
 * ailleurs appliqués), mais version LOCALE des éléments connus (saisie en cours) ; les éléments locaux pas encore
 * enregistrés (`unsaved`) restent après leur prédécesseur local.
 */
export function mergeArrayItems(local: readonly Obj[], server: readonly Obj[], unsaved: ReadonlySet<string>): Obj[] {
  const localByKey = new Map(local.map((item) => [keyOf(item), item]))
  const result = server.filter((item) => typeof item._key === 'string').map((item) => localByKey.get(keyOf(item)) ?? item)
  local.forEach((item, index) => {
    const key = keyOf(item)
    if (!unsaved.has(key) || result.some((r) => keyOf(r) === key)) return
    let position = 0
    for (let j = index - 1; j >= 0; j--) {
      const at = result.findIndex((r) => keyOf(r) === keyOf(local[j]))
      if (at !== -1) {
        position = at + 1
        break
      }
    }
    result.splice(position, 0, item)
  })
  return result
}

/** Éléments d'un tableau exploitables (objets avec une `_key` texte). */
export function arrayItems(value: unknown): Obj[] {
  return Array.isArray(value) ? value.filter((item): item is Obj => isObj(item) && typeof item._key === 'string') : []
}

/** Valeur d'un champ texte pour un <input> : chaîne, jamais null. */
export function textValue(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

/** Valeur à enregistrer pour un texte : chaîne vide → null (unset), sinon la chaîne. */
export function normalizeText(value: string): string | null {
  return value === '' ? null : value
}

/** Référence Sanity (`{ _type: 'reference', _ref }`) → id, ou null. */
export function referenceId(value: unknown): string | null {
  const ref = childOf(value, '_ref')
  return typeof ref === 'string' ? ref : null
}

export function toReference(id: string | null): Obj | null {
  return id ? { _type: 'reference', _ref: id } : null
}

/** Image Sanity → id d'asset (`image-…`), ou null. */
export function imageAssetId(value: unknown): string | null {
  const ref = childOf(childOf(value, 'asset'), '_ref')
  return typeof ref === 'string' ? ref : null
}

/** Id d'asset image valide (`image-<hash>-<l>x<h>-<ext>`). */
export const IMAGE_ASSET_ID = /^image-[A-Za-z0-9]{8,64}-\d{1,5}x\d{1,5}-[a-z0-9]{2,5}$/

export function toImage(assetId: string | null): Obj | null {
  return assetId ? { _type: 'image', asset: { _type: 'reference', _ref: assetId } } : null
}

/**
 * Copie de `doc` avec `value` écrite au chemin (`hero.title`, `items[_key=="a"].title`) ; null/undefined retire le
 * champ. Sert à garder à jour la valeur locale du formulaire après un enregistrement réussi (une section refermée
 * puis rouverte montre la dernière valeur enregistrée). Chemin supposé valide (même grammaire que core/sanity).
 */
export function setAtPath(doc: Obj, path: string, value: unknown): Obj {
  const segments = path.split('.').map((part) => {
    const bracket = part.indexOf('[')
    return {
      name: bracket === -1 ? part : part.slice(0, bracket),
      keys: [...part.matchAll(/\[_key=="([\w-]+)"\]/g)].map((m) => m[1]),
    }
  })
  const write = (node: unknown, index: number): unknown => {
    const { name, keys } = segments[index]
    const base: Obj = isObj(node) ? { ...node } : {}
    const last = index === segments.length - 1
    if (keys.length === 0) {
      if (last) {
        if (value === null || value === undefined) delete base[name]
        else base[name] = value
      } else base[name] = write(base[name], index + 1)
      return base
    }
    const list = Array.isArray(base[name]) ? (base[name] as unknown[]) : []
    base[name] = list.map((item) => (isObj(item) && item._key === keys[0] ? (last ? value : write(item, index + 1)) : item))
    return base
  }
  return write(doc, 0) as Obj
}
