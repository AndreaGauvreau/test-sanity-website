import type { DocumentSnapshot, TextSnapshot } from '../store/store'
import { getAtPath, parsePath } from './path'
import { draftIdOf, type SanityDoc, type SanityPort } from './sanity'

/**
 * Magasin des textes de l'éditeur IA dans Sanity (remplace `content.ts` du POC, écrit pour Payload).
 *
 * - Lecture : valeur du BROUILLON s'il existe, sinon du publié (ce que montre l'aperçu, perspective drafts).
 * - Instantané (textsBefore) : valeur de chaque champ avant la demande et existence du brouillon, pris AVANT toute
 *   écriture et enregistré par l'appelant dans le magasin du moteur (piège 7 du POC).
 * - Écriture : dans `drafts.<id>` seulement — créé depuis le publié s'il manque (sans champs système), puis `set`.
 *   Jamais dans le document publié : rien n'est en ligne avant Publish.
 * - Restauration EXACTE : valeurs d'avant remises (champ absent → retiré) ; si le brouillon n'existait pas et qu'il est
 *   redevenu identique au publié, il est supprimé.
 *
 * L'API Sanity n'applique pas le schéma : la validation des textes est faite avant (validateText d'engine-claude).
 */

export class TextStoreError extends Error {
  constructor(
    message: string,
    readonly code: 'unavailable' | 'not_found' | 'conflict' | 'bad_request',
  ) {
    super(message)
    this.name = 'TextStoreError'
  }
}

export type TextRequest = { document: string; type: string; paths: string[] }

export type SnapshotResult = {
  snapshot: TextSnapshot
  /** Valeur actuelle par id de champ `<document>:<chemin>` ('' si absente). */
  current: Record<string, string>
  /** Autres textes des documents (chemin → valeur), pour la cohérence : des données, jamais des consignes. */
  others: Record<string, string>
}

export type TextStore = {
  /** Jeton d'écriture présent : sinon, la portée Text (Sanity) est refusée proprement (unavailable). */
  readonly available: boolean
  snapshot(requests: TextRequest[]): Promise<SnapshotResult>
  write(input: { document: string; type: string; path: string; value: string }): Promise<void>
  /** Valeurs actuelles (brouillon, sinon publié) de chemins d'un document ; null = champ absent. */
  read(document: string, paths: string[]): Promise<Record<string, string | null>>
  /** Remet les champs `paths` (tous ceux de l'instantané par défaut) comme avant. */
  restore(snapshot: TextSnapshot, paths?: Record<string, string[]>): Promise<void>
}

const SYSTEM_FIELDS = new Set(['_id', '_rev', '_createdAt', '_updatedAt', '_system'])

/** Document sans champs système (création d'un brouillon, comparaison au publié). */
export function withoutSystemFields(doc: SanityDoc): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !SYSTEM_FIELDS.has(key)))
}

/** JSON canonique (clés triées) : comparaison de contenu, jamais de dates (piège 10 du POC). */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const asText = (value: unknown): string | null => (typeof value === 'string' ? value : value === undefined || value === null ? null : null)

/** Préfixes « objet » d'un chemin (a, a.b pour a.b.c ; jamais un élément de tableau) : créés s'ils manquent. */
function objectPrefixes(path: string): string[] {
  const segments = parsePath(path)
  const prefixes: string[] = []
  let current = ''
  for (let i = 0; i < segments.length - 1; i++) {
    const { field, key } = segments[i]
    current = current ? `${current}.${field}` : field
    if (key !== undefined) current += `[_key=="${key}"]`
    else prefixes.push(current)
  }
  return prefixes
}

// Autres textes cités à Claude : chaînes du document, hors champs techniques ; bornés.
const MAX_OTHERS = 40
const TECHNICAL_KEYS = new Set(['_key', '_type', '_ref', '_id', '_rev', 'current', 'href', 'url', 'slug', 'style', 'listItem'])

function collectTexts(node: unknown, prefix: string, out: Record<string, string>) {
  if (Object.keys(out).length >= MAX_OTHERS) return
  if (typeof node === 'string') {
    if (prefix && node.trim()) out[prefix] = node
    return
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const key = item && typeof item === 'object' && typeof (item as { _key?: unknown })._key === 'string' ? (item as { _key: string })._key : null
      if (key) collectTexts(item, `${prefix}[_key=="${key}"]`, out)
    }
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key.startsWith('_') || TECHNICAL_KEYS.has(key)) continue
      collectTexts(value, prefix ? `${prefix}.${key}` : key, out)
    }
  }
}

function unavailable(): never {
  throw new TextStoreError('Text changes need the Sanity write token (SANITY_API_WRITE_TOKEN) on the engine.', 'unavailable')
}

/** Magasin des textes. `port` null = pas de jeton d'écriture (available: false). */
export function createTextStore(port: SanityPort | null): TextStore {
  const pair = async (id: string) => {
    const [draft, published] = await port!.getDocuments([draftIdOf(id), id])
    return { draft, published }
  }
  const checkType = (doc: SanityDoc | null, type: string) => {
    if (doc && doc._type !== type) throw new TextStoreError('This element’s content cannot be edited here (unexpected document type).', 'bad_request')
  }

  return {
    available: port !== null,

    async snapshot(requests) {
      if (!port) unavailable()
      const snapshot: TextSnapshot = {}
      const current: Record<string, string> = {}
      const others: Record<string, string> = {}
      for (const request of requests) {
        const { draft, published } = await pair(request.document)
        const doc = draft ?? published
        if (!doc) throw new TextStoreError('The content of this element was not found in Sanity.', 'not_found')
        checkType(draft, request.type)
        checkType(published, request.type)
        const entry: DocumentSnapshot = snapshot[request.document] ?? {
          id: request.document,
          type: request.type,
          draftExisted: draft !== null,
          fields: {},
        }
        for (const path of request.paths) {
          const value = getAtPath(doc, path)
          if (value !== undefined && value !== null && typeof value !== 'string') {
            throw new TextStoreError(`This field is not plain text: ${path}.`, 'bad_request')
          }
          entry.fields[path] = asText(value)
          current[`${request.document}:${path}`] = asText(value) ?? ''
        }
        snapshot[request.document] = entry
        const texts: Record<string, string> = {}
        collectTexts(withoutSystemFields(doc), '', texts)
        for (const [path, value] of Object.entries(texts)) {
          if (!request.paths.includes(path)) others[path] = value
        }
      }
      return { snapshot, current, others }
    },

    async write({ document, type, path, value }) {
      if (!port) unavailable()
      const draftId = draftIdOf(document)
      const { draft, published } = await pair(document)
      checkType(draft, type)
      checkType(published, type)
      if (!draft) {
        if (!published) throw new TextStoreError('The content of this element was not found in Sanity.', 'not_found')
        // Brouillon créé depuis le publié, sans champs système : ce que ferait le Studio à la première frappe.
        await port.createIfNotExists({ ...(withoutSystemFields(published) as SanityDoc), _id: draftId, _type: published._type })
      }
      const setIfMissing = Object.fromEntries(objectPrefixes(path).map((prefix) => [prefix, {}]))
      await port.patch(draftId, { setIfMissing, set: { [path]: value } })
    },

    async read(document, paths) {
      if (!port) unavailable()
      const { draft, published } = await pair(document)
      const doc = draft ?? published
      return Object.fromEntries(paths.map((path) => [path, doc ? asText(getAtPath(doc, path)) : null]))
    },

    async restore(snapshot, only) {
      if (!port) unavailable()
      for (const entry of Object.values(snapshot)) {
        const paths = only ? (Object.hasOwn(only, entry.id) ? only[entry.id] : []) : Object.keys(entry.fields)
        const known = paths.filter((path) => Object.hasOwn(entry.fields, path))
        if (!known.length) continue
        const draftId = draftIdOf(entry.id)
        const { draft, published } = await pair(entry.id)
        if (!draft) continue // aucun brouillon : rien n'a été écrit, ou il a été publié / abandonné depuis
        const set: Record<string, unknown> = {}
        const unset: string[] = []
        for (const path of known) {
          const before = entry.fields[path]
          const now = getAtPath(draft, path)
          if (before === null) {
            if (now !== undefined) unset.push(path)
          } else if (now !== before) {
            set[path] = before
          }
        }
        if (Object.keys(set).length || unset.length) {
          const setIfMissing = Object.fromEntries(Object.keys(set).flatMap(objectPrefixes).map((prefix) => [prefix, {}]))
          await port.patch(draftId, { setIfMissing, set, unset })
        }
        // Brouillon créé par la demande : supprimé s'il est redevenu identique au publié (rien d'autre dedans).
        if (!entry.draftExisted && published) {
          const [restored] = await port.getDocuments([draftId])
          if (restored && canonical(withoutSystemFields(restored)) === canonical(withoutSystemFields(published))) {
            await port.delete(draftId)
          }
        }
      }
    },
  }
}
