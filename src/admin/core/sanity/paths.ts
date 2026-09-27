/**
 * Identifiants et chemins Sanity acceptés par les écritures de l'admin. Pur.
 *
 * Les chemins viennent des features (manifeste, zones) mais passent par des server actions : on les valide comme
 * des entrées non fiables. Format accepté : segments `nom` séparés par des points, et sélecteurs de clé
 * `[_key=="abc"]` pour les éléments de tableau. JAMAIS d'index numérique (l'ordre d'un tableau peut changer entre
 * la lecture et l'écriture) ni de caractère GROQ arbitraire.
 */

export const DRAFT_PREFIX = 'drafts.'

const ID_PATTERN = /^[A-Za-z0-9][\w-]*(?:\.[\w-]+)*$/
const TYPE_PATTERN = /^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)*$/
const SEGMENT = String.raw`[A-Za-z][\w]*`
const KEY_SELECTOR = String.raw`\[_key=="[\w-]{1,64}"\]`
const PATH_PATTERN = new RegExp(String.raw`^${SEGMENT}(?:${KEY_SELECTOR})*(?:\.${SEGMENT}(?:${KEY_SELECTOR})*)*$`)

/** Id publié valide (pas de « drafts. », pas de « versions. », pas de caractère spécial). */
export function isPublishedId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 128 && ID_PATTERN.test(id) && !id.startsWith(DRAFT_PREFIX) && !id.startsWith('versions.')
}

export function assertPublishedId(id: unknown): string {
  if (!isPublishedId(id)) throw new SanityWriteError('bad_request', 'Invalid document id.')
  return id
}

export function draftIdOf(id: string): string {
  return `${DRAFT_PREFIX}${id}`
}

/** « drafts.abc » → « abc » ; « abc » → « abc ». */
export function publishedIdOf(id: string): string {
  return id.startsWith(DRAFT_PREFIX) ? id.slice(DRAFT_PREFIX.length) : id
}

export function isDocumentType(type: unknown): type is string {
  return typeof type === 'string' && type.length <= 64 && TYPE_PATTERN.test(type) && !type.startsWith('sanity.') && !type.startsWith('system.')
}

export function isFieldPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length > 256 || !PATH_PATTERN.test(path)) return false
  // Aucun segment système (_id, _type, _rev…) : seul `_key` apparaît, dans les sélecteurs.
  return !path.split('.').some((segment) => segment.startsWith('_'))
}

export function assertFieldPath(path: unknown): string {
  if (!isFieldPath(path)) throw new SanityWriteError('bad_request', 'Invalid field path.')
  return path
}

/** Segment d'un chemin validé : nom du champ, puis sélecteurs de clé successifs (tableaux imbriqués). */
export type PathSegment = { name: string; keys: string[] }

/** « features.items[_key=="a1"].title » → [{features}, {items, keys:[a1]}, {title}]. Chemin supposé valide. */
export function parseFieldPath(path: string): PathSegment[] {
  return path.split('.').map((part) => {
    const bracket = part.indexOf('[')
    const name = bracket === -1 ? part : part.slice(0, bracket)
    const keys = [...part.matchAll(/\[_key=="([\w-]+)"\]/g)].map((m) => m[1])
    return { name, keys }
  })
}

/**
 * Chaque sélecteur `[_key=="…"]` du chemin désigne-t-il un élément existant de `doc` ?
 * Sanity ignore SANS ERREUR un patch dont le sélecteur ne correspond à rien : on le détecte avant d'écrire.
 * Un objet intermédiaire absent (sans sélecteur) est permis : `set` le crée.
 */
export function keyedTargetsExist(doc: Record<string, unknown> | null | undefined, path: string): boolean {
  let current: unknown = doc
  for (const { name, keys } of parseFieldPath(path)) {
    if (keys.length === 0) {
      if (current === undefined || current === null) return true
      if (typeof current !== 'object' || Array.isArray(current)) return false
      current = (current as Record<string, unknown>)[name]
      continue
    }
    if (current === undefined || current === null || typeof current !== 'object' || Array.isArray(current)) return false
    current = (current as Record<string, unknown>)[name]
    for (const key of keys) {
      if (!Array.isArray(current)) return false
      current = current.find((item) => !!item && typeof item === 'object' && (item as { _key?: unknown })._key === key)
      if (current === undefined) return false
    }
  }
  return true
}

/**
 * Valeur de `doc` au chemin validé (sélecteurs `_key` suivis), ou undefined si un maillon manque.
 * « features.items » → le tableau ; « sections[_key=="s1"].items » → le tableau de la section s1.
 */
export function getValueAtPath(doc: Record<string, unknown> | null | undefined, path: string): unknown {
  let current: unknown = doc
  for (const { name, keys } of parseFieldPath(path)) {
    if (current === undefined || current === null || typeof current !== 'object' || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[name]
    for (const key of keys) {
      if (!Array.isArray(current)) return undefined
      current = current.find((item) => !!item && typeof item === 'object' && (item as { _key?: unknown })._key === key)
    }
  }
  return current
}

/** Erreur des écritures de l'admin : code proche de EngineErrorCode, message en anglais pour l'interface. */
export class SanityWriteError extends Error {
  constructor(
    readonly code: 'bad_request' | 'not_found' | 'forbidden' | 'unavailable' | 'validation',
    message: string,
    readonly details?: Record<string, string>,
    /** Statut HTTP de Sanity quand l'erreur en vient (409 = écriture concurrente : révision changée, id déjà pris). */
    readonly httpStatus?: number,
  ) {
    super(message)
    this.name = 'SanityWriteError'
  }
}

/** Écriture refusée parce que le document a changé entre la lecture et l'écriture (Sanity 409). */
export function isWriteConflict(err: unknown): boolean {
  return err instanceof SanityWriteError && err.httpStatus === 409
}
