/**
 * Chemins Sanity des textes de l'éditeur (`hero.title`, `features.items[_key=="k1"].title`) : lecture et écriture dans
 * un document JSON. Seule la forme produite par `resolveTextFields` (engine-claude) est acceptée : identifiants, points
 * et filtres `[_key=="…"]` — jamais d'index numérique (l'ordre d'un tableau peut changer entre la sélection et
 * l'écriture).
 */

export type PathSegment = { field: string; key?: string }

const SEGMENT = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[_key=="([A-Za-z0-9_-]{1,64})"\])?$/

/** Découpe un chemin ; lève une erreur sur toute autre forme. */
export function parsePath(path: string): PathSegment[] {
  if (typeof path !== 'string' || !path || path.length > 300) throw new Error('Invalid Sanity path.')
  // Les clés ne contiennent ni point ni guillemet (voir SEGMENT) : on peut couper sur « . » hors crochets.
  const parts = path.match(/(?:[^.[\]]+(?:\[_key=="[^"]*"\])?)/g) ?? []
  if (parts.join('.') !== path) throw new Error(`Invalid Sanity path: ${path.slice(0, 80)}`)
  return parts.map((part) => {
    const match = SEGMENT.exec(part)
    if (!match || match[1] === '__proto__' || match[1] === 'constructor' || match[1] === 'prototype') {
      throw new Error(`Invalid Sanity path: ${path.slice(0, 80)}`)
    }
    return match[2] ? { field: match[1], key: match[2] } : { field: match[1] }
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Valeur au chemin, ou undefined si un maillon manque. */
export function getAtPath(doc: unknown, path: string): unknown {
  let node: unknown = doc
  for (const { field, key } of parsePath(path)) {
    if (!isRecord(node) || !Object.hasOwn(node, field)) return undefined
    node = node[field]
    if (key !== undefined) {
      if (!Array.isArray(node)) return undefined
      node = node.find((item) => isRecord(item) && item._key === key)
      if (node === undefined) return undefined
    }
  }
  return node
}

/**
 * Écrit (ou retire, `value === undefined`) la valeur au chemin, dans une COPIE du document. Crée les objets
 * intermédiaires manquants, jamais un élément de tableau manquant (lève : l'élément a disparu).
 */
export function setAtPath<T>(doc: T, path: string, value: unknown): T {
  const segments = parsePath(path)
  const copy = structuredClone(doc) as unknown
  if (!isRecord(copy)) throw new Error('The document is not an object.')
  let node: Record<string, unknown> = copy
  segments.forEach(({ field, key }, i) => {
    const last = i === segments.length - 1
    if (key === undefined) {
      if (last) {
        if (value === undefined) delete node[field]
        else node[field] = value
        return
      }
      if (!isRecord(node[field])) node[field] = {}
      node = node[field] as Record<string, unknown>
      return
    }
    const list = node[field]
    const item = Array.isArray(list) ? list.find((entry) => isRecord(entry) && entry._key === key) : undefined
    if (!isRecord(item)) throw new Error(`Array item not found: ${field}[_key=="${key}"]`)
    if (last) throw new Error('A Sanity text path cannot end on an array item.')
    node = item
  })
  return copy as T
}
