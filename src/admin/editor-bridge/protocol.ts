/**
 * Protocole du pont de l'éditeur IA : messages postMessage entre l'admin (parent, écran /admin/editor) et
 * l'aperçu du brouillon (iframe, site en mode KZ_EDITOR_PREVIEW, pont monté par le layout du site).
 *
 * Module PUR (ni React, ni DOM, ni Next) : importé des deux côtés et testé seul.
 *
 * Règles de sécurité (leçon du POC, §5.3 de docs/admin/research/poc-editeur-ia.md) :
 * - chaque côté vérifie `event.origin` (parent : origine de l'aperçu ; pont : ADMIN_ORIGIN) ET `event.source`
 *   (la fenêtre attendue : l'iframe pour le parent, window.parent pour le pont) ;
 * - chaque message est validé champ par champ (`parseEditorMessage` / `parseBridgeMessage`) : un message mal formé,
 *   d'une autre source ou d'une autre version est ignoré sans bruit ;
 * - on ne poste jamais vers « * » : toujours vers l'origine attendue ;
 * - le pont ne transmet que des références de zone (id, rang, doc, clé), jamais du texte du site ; le parent
 *   recalcule lui-même les libellés depuis zones.json.
 */

export const PROTOCOL_VERSION = 1
/** Parent (admin) → pont. */
export const EDITOR_SOURCE = 'kz-editor'
/** Pont → parent (admin). */
export const BRIDGE_SOURCE = 'kz-bridge'

/** Mode de la barre d'outils : View = le site se comporte normalement ; Select = survol et clic sélectionnent. */
export type BridgeMode = 'view' | 'select'

/** Référence d'un élément de l'aperçu (sous-ensemble d'ElementTarget, sans libellé). */
export type TargetRef = {
  zone: string
  /** Rang de l'occurrence parmi les éléments `[data-edit="<zone>"]` du document (0 pour une zone unique). */
  index: number
  /** data-edit-doc de l'ancêtre le plus proche (id publié). */
  doc?: string
  /** data-edit-key de l'élément (clé d'un élément de tableau Sanity). */
  key?: string
}

/** État d'affichage envoyé au pont, idempotent : le pont redessine tout d'après le dernier reçu. */
export type BridgeView = {
  mode: BridgeMode
  /** Une demande est active : flèche partout, aucun contour au survol, aucun clic de sélection. */
  locked: boolean
  /** Échelle de l'iframe dans l'admin (≤ 1) : le pont compense traits et étiquettes pour qu'ils gardent leur taille. */
  scale: number
  selection: TargetRef[]
  /** Éléments sur lesquels Claude travaille (reflet animé). */
  working: TargetRef[]
  /** Modification à valider (cadre + « … — modified by Claude »). */
  review: TargetRef[]
}

export type EditorMessage =
  | { source: typeof EDITOR_SOURCE; v: typeof PROTOCOL_VERSION; type: 'sync'; view: BridgeView }
  | { source: typeof EDITOR_SOURCE; v: typeof PROTOCOL_VERSION; type: 'refresh' }

export type BridgeMessage =
  | { source: typeof BRIDGE_SOURCE; v: typeof PROTOCOL_VERSION; type: 'hello' }
  | { source: typeof BRIDGE_SOURCE; v: typeof PROTOCOL_VERSION; type: 'ready'; path: string }
  | { source: typeof BRIDGE_SOURCE; v: typeof PROTOCOL_VERSION; type: 'select'; target: TargetRef; additive: boolean }
  | { source: typeof BRIDGE_SOURCE; v: typeof PROTOCOL_VERSION; type: 'escape' }

type Distribute<T> = T extends unknown ? Omit<T, 'source' | 'v'> : never
export type EditorMessageBody = Distribute<EditorMessage>
export type BridgeMessageBody = Distribute<BridgeMessage>

export function editorMessage(body: EditorMessageBody): EditorMessage {
  return { source: EDITOR_SOURCE, v: PROTOCOL_VERSION, ...body } as EditorMessage
}

export function bridgeMessage(body: BridgeMessageBody): BridgeMessage {
  return { source: BRIDGE_SOURCE, v: PROTOCOL_VERSION, ...body } as BridgeMessage
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Nombre maximal d'éléments par liste (le contrat EditRequest en permet 8). */
export const MAX_TARGETS = 8
/** Identifiants de zone : ceux de zones.json (« hero.title », « features.card.title »…). */
const ZONE_ID = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*){0,5}$/
/** Ids Sanity publiés et clés de tableau : caractères sûrs, longueur bornée. */
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/
const MAX_PATH = 2048

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isZoneId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 120 && ZONE_ID.test(value)
}

export function parseTargetRef(value: unknown): TargetRef | null {
  if (!isRecord(value)) return null
  const { zone, index, doc, key } = value
  if (!isZoneId(zone)) return null
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 999) return null
  if (doc !== undefined && (typeof doc !== 'string' || !SAFE_ID.test(doc))) return null
  if (key !== undefined && (typeof key !== 'string' || !SAFE_ID.test(key))) return null
  const ref: TargetRef = { zone, index }
  if (doc !== undefined) ref.doc = doc
  if (key !== undefined) ref.key = key
  return ref
}

function parseTargetList(value: unknown): TargetRef[] | null {
  if (!Array.isArray(value) || value.length > MAX_TARGETS) return null
  const out: TargetRef[] = []
  for (const item of value) {
    const ref = parseTargetRef(item)
    if (!ref) return null
    out.push(ref)
  }
  return out
}

function parseView(value: unknown): BridgeView | null {
  if (!isRecord(value)) return null
  const { mode, locked, scale } = value
  if (mode !== 'view' && mode !== 'select') return null
  if (typeof locked !== 'boolean') return null
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0 || scale > 1) return null
  const selection = parseTargetList(value.selection)
  const working = parseTargetList(value.working)
  const review = parseTargetList(value.review)
  if (!selection || !working || !review) return null
  return { mode, locked, scale, selection, working, review }
}

function hasEnvelope(data: unknown, source: string): data is Record<string, unknown> {
  return isRecord(data) && data.source === source && data.v === PROTOCOL_VERSION && typeof data.type === 'string'
}

/** Message parent → pont, ou null s'il est mal formé (ignoré). */
export function parseEditorMessage(data: unknown): EditorMessage | null {
  if (!hasEnvelope(data, EDITOR_SOURCE)) return null
  switch (data.type) {
    case 'sync': {
      const view = parseView(data.view)
      return view ? editorMessage({ type: 'sync', view }) : null
    }
    case 'refresh':
      return editorMessage({ type: 'refresh' })
    default:
      return null
  }
}

/** Message pont → parent, ou null s'il est mal formé (ignoré). */
export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (!hasEnvelope(data, BRIDGE_SOURCE)) return null
  switch (data.type) {
    case 'hello':
      return bridgeMessage({ type: 'hello' })
    case 'escape':
      return bridgeMessage({ type: 'escape' })
    case 'ready': {
      const { path } = data
      if (typeof path !== 'string' || !path.startsWith('/') || path.length > MAX_PATH) return null
      return bridgeMessage({ type: 'ready', path })
    }
    case 'select': {
      const target = parseTargetRef(data.target)
      if (!target || typeof data.additive !== 'boolean') return null
      return bridgeMessage({ type: 'select', target, additive: data.additive })
    }
    default:
      return null
  }
}

// ─── Origines ────────────────────────────────────────────────────────────────

/**
 * Origine stricte (« http://127.0.0.1:4040 ») d'une valeur de configuration, ou null si elle n'en est pas une
 * (chemin, joker, protocole autre que http/https, URL avec chemin). Aucune valeur par défaut : pas de port en dur.
 */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/\/$/, '')
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.origin !== trimmed) return null
    return url.origin
  } catch {
    return null
  }
}

/** Même référence d'élément (zone + rang + doc + clé). */
export function sameTargetRef(a: TargetRef, b: TargetRef): boolean {
  return a.zone === b.zone && a.index === b.index && (a.doc ?? '') === (b.doc ?? '') && (a.key ?? '') === (b.key ?? '')
}
