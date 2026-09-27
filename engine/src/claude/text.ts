import type { SanityTextBinding } from '../../../src/admin/core/contracts'

/**
 * Textes Sanity de l'éditeur IA : champs d'une zone résolus pour un élément choisi, validation d'un texte proposé par
 * Claude (`validateText`, porté de job.ts du POC) et outil `set_text` à gestionnaire injecté (l'écriture dans le
 * brouillon Sanity appartient à engine-core).
 *
 * L'API Sanity n'applique PAS les règles du schéma : `validateText` est la seule barrière (longueur, lignes, balises…).
 */

/** Champ Sanity modifiable par set_text pour UN élément choisi. */
export type TextField = {
  /** Identifiant donné à Claude et attendu par set_text : `<document>:<chemin>` (unique même sur plusieurs documents). */
  id: string
  /** Id PUBLIÉ du document (sans « drafts. »). */
  document: string
  /** Type Sanity du document (à vérifier par l'appelant avant d'écrire). */
  type: string
  /** Chemin Sanity résolu (`features.items[_key=="k1"].title`). */
  path: string
  /** Chemin déclaré dans zones.json (`features.items[_key=="$key"].title`). */
  declared: string
  /** Nom court du champ (« title », « text ») pour les libellés. */
  name: string
  /** Longueur visible maximale. */
  max: number
  /** Retours à la ligne significatifs (white-space: pre-line) : nombre de lignes maximal. */
  lines?: number
  /** Mise en avant *…* permise (désactivée par défaut : Conduit met en avant par un champ séparé). */
  accent?: true
}

/** Champs d'un élément : modifiables, et fermés (valeur prise dans une liste, jamais réécrite comme du texte). */
export type TextTarget = { fields: TextField[]; closed: string[] }

/** Élément choisi dans l'aperçu (sous-ensemble d'ElementTarget du contrat). */
export type TextElement = { doc?: string; key?: string }

export type ResolveOptions = {
  /** Chemins DÉCLARÉS où la convention *…* de mise en avant est active. Vide par défaut (Conduit : aucun). */
  emphasis?: readonly string[]
}

// Clé de tableau Sanity et id publié : jeu de caractères fermé (ils entrent dans un chemin GROQ et dans le prompt).
const KEY = /^[A-Za-z0-9_-]{1,64}$/
const DOC_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
// Chemin déclaré : identifiants, points et filtres `[_key=="$key"]` seulement.
const DECLARED_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\[_key=="\$key"\])?(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[_key=="\$key"\])?)*$/

const nameOf = (declared: string) => declared.replace(/\[[^\]]*\]/g, '').split('.').pop() ?? declared

/**
 * Champs d'une zone pour un élément choisi (`$key` remplacé par la `_key` lue sur data-edit-key, document lu sur
 * data-edit-doc pour un élément de collection). Erreur (en anglais) si l'élément ne permet pas de résoudre les chemins.
 */
export function resolveTextFields(
  binding: SanityTextBinding,
  element: TextElement,
  options: ResolveOptions = {},
): { ok: true; target: TextTarget } | { ok: false; error: string } {
  const document = 'id' in binding.document ? binding.document.id : element.doc
  if (!document || !DOC_ID.test(document)) return { ok: false, error: 'This element has no editable Sanity document.' }
  const needsKey = [...Object.keys(binding.fields), ...(binding.closed ?? [])].some((p) => p.includes('$key'))
  if (needsKey && (!element.key || !KEY.test(element.key))) {
    return { ok: false, error: 'This element has no valid array key: its text cannot be targeted.' }
  }
  const resolve = (declared: string) => (element.key ? declared.replaceAll('$key', element.key) : declared)
  const closed = new Set(binding.closed ?? [])
  const emphasis = new Set(options.emphasis ?? [])
  const fields: TextField[] = []
  for (const [declared, max] of Object.entries(binding.fields)) {
    if (!DECLARED_PATH.test(declared)) return { ok: false, error: `Invalid field path in zones.json: ${declared}` }
    if (closed.has(declared)) continue
    if (!Number.isInteger(max) || max <= 0) return { ok: false, error: `Invalid maximum length for ${declared}.` }
    const lines = binding.lines && Object.hasOwn(binding.lines, declared) ? binding.lines[declared] : undefined
    const path = resolve(declared)
    fields.push({
      id: `${document}:${path}`,
      document,
      type: binding.document.type,
      path,
      declared,
      name: nameOf(declared),
      max,
      ...(lines && Number.isInteger(lines) && lines > 0 ? { lines } : {}),
      ...(emphasis.has(declared) ? { accent: true as const } : {}),
    })
  }
  return { ok: true, target: { fields, closed: [...closed].map((declared) => `${document}:${resolve(declared)}`) } }
}

/**
 * Champs que set_text peut toucher pour ce périmètre : tous avec T Texte ; en 🖌 seul, seulement les champs à mise en
 * avant (on ne change que les astérisques) ; aucun sinon.
 */
export function editableFields(target: TextTarget, scope: { style: boolean; text: boolean }): TextField[] {
  if (scope.text) return target.fields
  if (scope.style) return target.fields.filter((field) => field.accent)
  return []
}

// ─── Validation ──────────────────────────────────────────────────────────────

const ACCENT = /\*([^*]+)\*/g
const MAX_ACCENTS = 2

/** Texte affiché, sans les astérisques de mise en avant. */
export const plainText = (value: string) => value.replace(/\*/g, '')

/** Groupes de mots mis en avant (*…*). */
export const accentsOf = (value: string) => Array.from(value.matchAll(ACCENT), ([, words]) => words.trim())

/** Blancs réduits ; avec `lines`, les retours à la ligne sont gardés (lignes vides retirées). */
function normalize(value: string, keepLines: boolean): string {
  if (!keepLines) return value.replace(/\s+/g, ' ').trim()
  return value
    .replace(/\r\n?|[\u0085\u2028\u2029]/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

// Caractères invisibles ou de contrôle (bidi, largeur nulle, BOM…) : jamais dans un texte du site.
const INVISIBLE = /[\p{Cc}\p{Cf}]/u

export type TextRules = { scope: { style: boolean; text: boolean }; before: string }

/**
 * Valide un texte proposé par Claude pour un champ ; renvoie le texte nettoyé ou une erreur POUR CLAUDE (en anglais).
 * Avec `rules` : sans T, seuls les astérisques de mise en avant peuvent changer ; sans 🖌, aucune mise en avant nouvelle.
 */
export function validateText(
  target: TextTarget,
  fieldId: string,
  raw: string,
  rules?: TextRules,
): { value: string } | { error: string } {
  if (target.closed.includes(fieldId)) {
    return { error: `${fieldId} takes a value from a fixed list: it is never rewritten as text. Leave it unchanged.` }
  }
  const spec = target.fields.find((candidate) => candidate.id === fieldId)
  if (!spec) {
    const ids = target.fields.map((field) => field.id).join(', ')
    return { error: `Field not editable: ${fieldId}. Editable fields: ${ids || 'none'}.` }
  }
  if (typeof raw !== 'string') return { error: 'The text must be a string.' }
  const value = normalize(raw, spec.lines !== undefined)
  if (!value) return { error: 'The text is empty.' }
  if (INVISIBLE.test(value.replace(/\n/g, ''))) return { error: 'Invisible or control characters are not allowed.' }
  if (/[<>]/.test(value)) return { error: 'No HTML tags: plain text only.' }
  const shown = plainText(value)
  const length = shown.replace(/\n/g, '').length
  if (length > spec.max) return { error: `Too long: ${length} characters for ${spec.max} at most. Shorten it.` }
  if (spec.lines !== undefined) {
    const count = value.split('\n').length
    if (count > spec.lines) return { error: `Too many lines: ${count} for ${spec.lines} at most.` }
  }
  if (value.includes('*')) {
    if (!spec.accent) return { error: 'No asterisks in this field: emphasis is not available here.' }
    if (value.replace(ACCENT, '').includes('*')) {
      return { error: 'Malformed emphasis: wrap each group of words in one asterisk at the start and one at the end.' }
    }
    if (accentsOf(value).length > MAX_ACCENTS) return { error: 'Two emphasized groups of words at most.' }
  }
  if (rules && !rules.scope.text && shown !== plainText(normalize(rules.before, spec.lines !== undefined))) {
    return { error: 'Without “T Text”, you cannot change the words: only emphasize them with *…*.' }
  }
  if (rules && !rules.scope.style) {
    const kept = accentsOf(rules.before)
    if (accentsOf(value).some((words) => !kept.includes(words))) {
      return { error: 'Without “Style”, you cannot add emphasis.' }
    }
  }
  return { value }
}

// ─── Outil set_text à gestionnaire injecté ───────────────────────────────────

/** Ce que l'outil set_text appelle : renvoie un message d'erreur pour Claude, ou null si le texte est accepté. */
export type TextTool = { onSet: (fieldId: string, value: string) => Promise<string | null> }

export type TextWrite = { field: TextField; value: string }

export type TextToolOptions = {
  target: TextTarget
  /** Champs modifiables pour ce périmètre (`editableFields`). */
  fields: TextField[]
  scope: { style: boolean; text: boolean }
  /** Valeurs AVANT la demande, par id de champ (enregistrées par engine-core avant toute écriture : textsBefore). */
  before: Readonly<Record<string, string>>
  /** Écriture dans le brouillon Sanity (engine-core). Une exception devient une erreur renvoyée à Claude. */
  write: (change: TextWrite) => Promise<void>
  onEvent?: (event: { kind: 'text' | 'warn'; text: string }) => void
}

export type TextToolState = TextTool & {
  /** Dernier texte accepté par champ (id → valeur). */
  readonly proposed: Readonly<Record<string, string>>
  /** Dernière valeur réellement écrite dans le brouillon par champ. */
  readonly written: Readonly<Record<string, string>>
}

/**
 * Outil set_text : `validateText` puis écriture IMMÉDIATE dans le brouillon (pour que measure et les contrôles voient le
 * texte), sans réécrire une valeur identique. Le refus revient à Claude, qui peut rappeler l'outil.
 */
export function createTextTool(options: TextToolOptions): TextToolState {
  const { scope, before, write, onEvent } = options
  const target: TextTarget = { fields: options.fields, closed: options.target.closed }
  const proposed: Record<string, string> = {}
  const written: Record<string, string> = {}
  return {
    proposed,
    written,
    onSet: async (fieldId, raw) => {
      const checked = validateText(target, fieldId, raw, { scope, before: before[fieldId] ?? '' })
      if ('error' in checked) {
        onEvent?.({ kind: 'warn', text: `Text refused for ${fieldId}: ${checked.error}` })
        return checked.error
      }
      const field = target.fields.find((candidate) => candidate.id === fieldId)!
      proposed[fieldId] = checked.value
      if (written[fieldId] !== checked.value) {
        try {
          await write({ field, value: checked.value })
        } catch {
          delete proposed[fieldId]
          return 'The draft could not be saved. Try again once; if it fails again, stop and explain it to the client.'
        }
        written[fieldId] = checked.value
        onEvent?.({ kind: 'text', text: `Draft text saved: ${field.name}` })
      }
      return null
    },
  }
}

/** Message de Claude au client, en texte simple : sans gras ni puces Markdown, retours à la ligne gardés. */
export const clientMessage = (text: string) =>
  text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[ \t]*[-*•][ \t]+/gm, '')
    .trim()
