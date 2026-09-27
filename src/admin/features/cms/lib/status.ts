/**
 * Statut calculé d'un élément de collection (C3 « Live / Draft / Changed »). Pur.
 *
 * - Live    : publié, sans brouillon (ou brouillon identique au publié) ;
 * - Draft   : jamais publié (brouillon seul) ;
 * - Changed : publié, avec un brouillon différent.
 *
 * Les champs système (_id, _rev, dates, _originalId, _system) sont ignorés dans la comparaison :
 * un brouillon recopié du publié sans modification reste « Live ».
 */

export type CmsStatus = 'live' | 'draft' | 'changed'

const SYSTEM_FIELDS = new Set(['_id', '_rev', '_createdAt', '_updatedAt', '_originalId', '_system'])

type Doc = Record<string, unknown> | null | undefined

/** Égalité profonde de deux valeurs JSON (ordre des clés indifférent, `undefined` = absent). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return (a ?? undefined) === (b ?? undefined)
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false
    return true
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)])
  for (const key of keys) {
    if (!deepEqual(ao[key], bo[key])) return false
  }
  return true
}

/** Contenu d'un document sans ses champs système. */
export function contentOf(doc: Doc): Record<string, unknown> {
  if (!doc) return {}
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !SYSTEM_FIELDS.has(key)))
}

/** Statut d'un élément d'après ses versions publiée et brouillon ; null si aucune n'existe. */
export function computeStatus(published: Doc, draft: Doc): CmsStatus | null {
  if (!published && !draft) return null
  if (!published) return 'draft'
  if (!draft) return 'live'
  return deepEqual(contentOf(published), contentOf(draft)) ? 'live' : 'changed'
}

export const STATUS_LABELS: Readonly<Record<CmsStatus, string>> = { live: 'Live', draft: 'Draft', changed: 'Changed' }
