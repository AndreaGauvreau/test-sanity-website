import type { FieldDef } from '@/admin/core/contracts/manifest'
import { isSafeHref } from '@/admin/core/sanity/validate'

/**
 * Texte riche (Portable Text) des fiches CMS (C4 « Body »). Pur, partagé client / serveur.
 *
 * - `RichTextConfig` : ce que l'éditeur propose et ce que le serveur accepte pour un champ (styles, listes,
 *   décorateurs, liens, objets bloc). Source : `FieldDef.richText` du manifeste (`richTextConfigFor`) ; un champ
 *   qui ne le déclare pas reçoit `DEFAULT_RICH_TEXT` (options du corps d'article).
 * - `sanitizePortableText` : validation serveur avant écriture (l'API Sanity n'applique pas le schéma) —
 *   styles et listes hors liste ramenés à « normal », marques inconnues retirées, liens dangereux refusés,
 *   `_key` garanties et uniques, objets inconnus refusés.
 * - `toPlainText` : aperçu en cellule et recherche.
 */

export type RichTextConfig = {
  styles: readonly string[]
  lists: readonly string[]
  decorators: readonly string[]
  annotations: readonly 'link'[]
  /** Objets bloc gardés tels quels (ex. `image` du corps d'article) : affichés, non modifiables ici. */
  blockObjects: readonly string[]
}

export const DEFAULT_RICH_TEXT: RichTextConfig = {
  styles: ['normal', 'h2', 'h3', 'blockquote'],
  lists: ['bullet', 'number'],
  decorators: ['strong', 'em'],
  annotations: ['link'],
  blockObjects: ['image'],
}

/** Annotations que l'éditeur sait gérer (les autres noms du manifeste sont ignorés). */
const SUPPORTED_ANNOTATIONS: readonly 'link'[] = ['link']

/**
 * Options du texte riche d'un champ, lues dans `field.richText` (manifeste) : EXACTEMENT ce qu'il déclare — une
 * clé absente = rien de ce genre (liste vide), « normal » toujours permis, annotations limitées à `link`,
 * `blocks` → objets bloc. Champ sans `richText` : `DEFAULT_RICH_TEXT` (à éviter : déclarer `richText`).
 */
export function richTextConfigFor(field: Pick<FieldDef, 'richText'>): RichTextConfig {
  const declared = field.richText
  if (!declared) return DEFAULT_RICH_TEXT
  return {
    styles: ['normal', ...(declared.styles ?? []).filter((s) => s !== 'normal')],
    lists: [...(declared.lists ?? [])],
    decorators: [...(declared.decorators ?? [])],
    annotations: SUPPORTED_ANNOTATIONS.filter((a) => (declared.annotations ?? []).includes(a)),
    blockObjects: [...(declared.blocks ?? [])],
  }
}

export type PtSpan = { _type: 'span'; _key: string; text: string; marks: string[] }
export type PtMarkDef = { _type: string; _key: string; [field: string]: unknown }
export type PtTextBlock = {
  _type: 'block'
  _key: string
  style: string
  children: PtSpan[]
  markDefs: PtMarkDef[]
  listItem?: string
  level?: number
}
export type PtObject = { _type: string; _key: string; [field: string]: unknown }
export type PtBlock = PtTextBlock | PtObject

export class RichTextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RichTextError'
  }
}

const KEY = /^[\w-]{1,64}$/
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const MAX_BLOCKS = 2000
const MAX_TEXT = 100_000

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Générateur de clés par défaut (12 caractères hexadécimaux). */
export function randomKey(): string {
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Valide et normalise une valeur Portable Text pour `config`. Lève `RichTextError` (message anglais) si la
 * valeur n'est pas du texte riche, contient un objet non permis ou un lien dangereux.
 */
export function sanitizePortableText(value: unknown, config: RichTextConfig, genKey: () => string = randomKey): PtBlock[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) throw new RichTextError('Rich text must be a list of blocks.')
  if (value.length > MAX_BLOCKS) throw new RichTextError('This text is too long.')

  const used = new Set<string>()
  const keyFor = (raw: unknown): string => {
    let key = typeof raw === 'string' && KEY.test(raw) && !used.has(raw) ? raw : genKey()
    while (used.has(key)) key = genKey()
    used.add(key)
    return key
  }
  let textLength = 0
  const out: PtBlock[] = []

  for (const raw of value) {
    if (!isObject(raw) || typeof raw._type !== 'string') throw new RichTextError('Rich text contains an invalid block.')
    if (raw._type !== 'block') {
      if (!config.blockObjects.includes(raw._type)) throw new RichTextError('Rich text contains content that is not allowed here.')
      out.push({ ...raw, _type: raw._type, _key: keyFor(raw._key) })
      continue
    }

    // Définitions de marques : liens seulement, avec une adresse sûre.
    const markDefs: PtMarkDef[] = []
    const defKeys = new Set<string>()
    const rawDefs = Array.isArray(raw.markDefs) ? raw.markDefs : []
    for (const def of rawDefs) {
      if (!isObject(def) || def._type !== 'link' || !config.annotations.includes('link')) continue
      const href = typeof def.href === 'string' ? def.href.trim() : ''
      if (!href || !isSafeHref(href)) throw new RichTextError('A link in the text is not valid (use https://…, /page, mailto:…).')
      const key = typeof def._key === 'string' && KEY.test(def._key) ? def._key : genKey()
      if (defKeys.has(key)) continue
      defKeys.add(key)
      markDefs.push({ _type: 'link', _key: key, href })
    }

    const spanKeys = new Set<string>()
    const children: PtSpan[] = []
    const rawChildren = Array.isArray(raw.children) ? raw.children : []
    for (const child of rawChildren) {
      if (!isObject(child)) continue
      if (child._type !== 'span') throw new RichTextError('Rich text contains content that is not allowed here.')
      const text = typeof child.text === 'string' ? child.text.replace(CONTROL_CHARS, '') : ''
      textLength += text.length
      const marks = (Array.isArray(child.marks) ? child.marks : []).filter(
        (m): m is string => typeof m === 'string' && (config.decorators.includes(m) || defKeys.has(m)),
      )
      let key = typeof child._key === 'string' && KEY.test(child._key) && !spanKeys.has(child._key) ? child._key : genKey()
      while (spanKeys.has(key)) key = genKey()
      spanKeys.add(key)
      children.push({ _type: 'span', _key: key, text, marks: [...new Set(marks)] })
    }
    if (children.length === 0) children.push({ _type: 'span', _key: genKey(), text: '', marks: [] })

    // Seules les définitions réellement utilisées sont gardées.
    const usedDefs = new Set(children.flatMap((c) => c.marks))
    const block: PtTextBlock = {
      _type: 'block',
      _key: keyFor(raw._key),
      style: typeof raw.style === 'string' && config.styles.includes(raw.style) ? raw.style : 'normal',
      children,
      markDefs: markDefs.filter((d) => usedDefs.has(d._key)),
    }
    if (typeof raw.listItem === 'string' && config.lists.includes(raw.listItem)) {
      block.listItem = raw.listItem
      const level = typeof raw.level === 'number' && Number.isInteger(raw.level) ? raw.level : 1
      block.level = Math.min(6, Math.max(1, level))
    }
    out.push(block)
  }
  if (textLength > MAX_TEXT) throw new RichTextError('This text is too long.')
  return out
}

/** Texte brut (blocs séparés par un retour à la ligne) : aperçu en cellule, recherche, compteur. */
export function toPlainText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .filter((b): b is PtTextBlock => isObject(b) && b._type === 'block' && Array.isArray(b.children))
    .map((b) => b.children.map((c) => (isObject(c) && typeof c.text === 'string' ? c.text : '')).join(''))
    .join('\n')
}

/** Texte riche vide (aucun caractère visible et aucun objet) : utile pour l'obligation du champ. */
export function isEmptyRichText(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return true
  return value.every((b) => isObject(b) && b._type === 'block' && toPlainText([b]).trim() === '')
}
