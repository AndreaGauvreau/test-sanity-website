import { z } from 'zod'

import type { AdminConfig, CollectionDef, FieldDef } from '@/admin/core/contracts/manifest'
import type { Capability } from '@/admin/core/contracts/roles'
import type { Session } from '@/admin/core/contracts/session'
import type { DocumentState, DraftPatch } from '@/admin/core/sanity/draft-core'
import { SanityWriteError } from '@/admin/core/sanity/paths'
import type { SanityDoc } from '@/admin/core/sanity/store'
import { validateFieldValue } from '@/admin/core/sanity/validate'

import { planMove, rankAfterLast, sortByRank, targetIndexFromNeighbours } from '../lib/order'
import { isEmptyRichText, richTextConfigFor, RichTextError, sanitizePortableText } from '../lib/portable-text'
import { buildRow, type CmsRow } from '../lib/rows'
import { slugify, uniqueSlug } from '../lib/slug'
import { computeStatus, type CmsStatus } from '../lib/status'
import type { ImageCdnEnv } from '../lib/image-url'

/**
 * Logique des server actions du CMS (C3, C4, G5), sans Next : dépendances injectées, testée avec un faux
 * magasin Sanity. Chaque action : droit `content.write` EN PREMIER, entrées validées (zod), champ retrouvé
 * dans le manifeste (jamais un chemin libre venant du navigateur), document vérifié du bon type, puis
 * écriture dans le BROUILLON par les aides de core/sanity (FieldDef du manifeste → validation serveur).
 * Jamais de publication ici : elle passe par Publish (E1).
 */

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string }

export type CmsDeps = {
  requireCapability: (capability: Capability, context: 'action') => Promise<Session>
  config: AdminConfig
  env: ImageCdnEnv
  drafts: {
    getDocumentState: (id: string) => Promise<DocumentState>
    setDraftFields: (session: Session, id: string, patch: DraftPatch, options: { fields?: Record<string, FieldDef> }) => Promise<{ draftId: string }>
    createDraft: (session: Session, type: string, initial: Record<string, unknown>, options: { fields?: Record<string, FieldDef> }) => Promise<{ id: string; draftId: string }>
    deleteDraft: (session: Session, id: string) => Promise<{ draftId: string }>
  }
  reader: {
    /** Tous les documents du type, publiés et brouillons (jeton de lecture, perspective raw). */
    collectionDocs: (type: string) => Promise<SanityDoc[]>
    /** L'asset image existe-t-il ? */
    imageAssetExists: (id: string) => Promise<boolean>
  }
  log?: (message: string) => void
  now?: () => Date
}

// ─── Entrées (non fiables) ───────────────────────────────────────────────────

const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][\w-]*(?:\.[\w-]+)*$/).refine((v) => !v.startsWith('drafts.') && !v.startsWith('versions.'))
const collectionSchema = z.string().min(1).max(64).regex(/^[a-z0-9-]+$/i)
const fieldNameSchema = z.string().min(1).max(64).regex(/^[A-Za-z][\w]*$/)

const saveFieldInput = z.object({ collectionId: collectionSchema, id: idSchema, field: fieldNameSchema, value: z.unknown() })
const createInput = z.object({ collectionId: collectionSchema })
const reorderInput = z.object({
  collectionId: collectionSchema,
  id: idSchema,
  beforeId: idSchema.nullable(),
  afterId: idSchema.nullable(),
})
const statusInput = z.object({ collectionId: collectionSchema, id: idSchema, action: z.enum(['discard', 'delete-draft']) })
const deleteManyInput = z.object({ collectionId: collectionSchema, ids: z.array(idSchema).min(1).max(200) })

const ORDER_RANK_FIELD: FieldDef = { name: 'orderRank', label: 'Order', kind: 'string', required: true, maxLength: 64 }

// ─── Aides ───────────────────────────────────────────────────────────────────

function fail(error: string, field?: string): { ok: false; error: string; field?: string } {
  return field ? { ok: false, error, field } : { ok: false, error }
}

function errorResult(err: unknown, deps: CmsDeps, field?: string): { ok: false; error: string; field?: string } {
  if (err instanceof SanityWriteError) return fail(err.message, err.code === 'validation' ? field : undefined)
  if (err instanceof RichTextError) return fail(err.message, field)
  const status = (err as { status?: unknown })?.status
  if (status === 401) return fail('Your session has expired. Sign in again.')
  if (status === 403) return fail("You don't have access to this.")
  deps.log?.(`[cms] ${err instanceof Error ? err.message : String(err)}`)
  return fail('Something went wrong. Please try again.')
}

export function findCollection(config: AdminConfig, id: string): CollectionDef | null {
  return config.collections.find((c) => c.id === id) ?? null
}

/** Lit l'élément et vérifie qu'il appartient bien à la collection (un id d'une autre collection ou d'une page est refusé). */
async function readItem(deps: CmsDeps, collection: CollectionDef, id: string): Promise<DocumentState | null> {
  const state = await deps.drafts.getDocumentState(id)
  if (!state.value || state.value._type !== collection.type) return null
  return state
}

function statusOf(state: DocumentState): CmsStatus {
  return computeStatus(state.published, state.draft) ?? 'draft'
}

function slugValue(doc: SanityDoc, field: string | undefined): string | null {
  if (!field) return null
  const v = doc[field] as { current?: unknown } | undefined
  return typeof v?.current === 'string' ? v.current : null
}

/** Slugs pris par les AUTRES éléments de la collection (publiés et brouillons). */
function takenSlugs(docs: readonly SanityDoc[], slugField: string, exceptId?: string): Set<string> {
  const taken = new Set<string>()
  for (const doc of docs) {
    const id = doc._id.replace(/^drafts\./, '')
    if (id === exceptId) continue
    const s = slugValue(doc, slugField)
    if (s) taken.add(s)
  }
  return taken
}

/** Date « AAAA-MM-JJ » (champ date de l'interface) → ISO, en gardant l'heure déjà enregistrée. */
export function toStoredDate(input: string, previous: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim())
  if (!m) return Number.isNaN(Date.parse(input)) ? null : new Date(input).toISOString()
  const prev = typeof previous === 'string' ? new Date(previous) : null
  const time = prev && !Number.isNaN(prev.getTime()) ? prev.toISOString().slice(10) : 'T00:00:00.000Z'
  const iso = `${m[1]}-${m[2]}-${m[3]}${time}`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

/**
 * Normalise la valeur envoyée par l'interface pour un champ du manifeste. Retourne la valeur à écrire
 * (null = effacer) ou lève une erreur de validation lisible.
 */
export async function normalizeFieldValue(
  deps: CmsDeps,
  collection: CollectionDef,
  field: FieldDef,
  value: unknown,
  current: SanityDoc,
): Promise<unknown> {
  if (value === null || value === undefined || value === '') return null
  switch (field.kind) {
    case 'slug': {
      const raw = typeof value === 'string' ? value : (value as { current?: unknown })?.current
      if (typeof raw !== 'string') throw new SanityWriteError('validation', `${field.label} is invalid.`)
      const slug = raw.trim()
      const docs = await deps.reader.collectionDocs(collection.type)
      if (takenSlugs(docs, field.name, current._id.replace(/^drafts\./, '')).has(slug)) {
        throw new SanityWriteError('validation', `Another ${collection.singular.toLowerCase()} already uses this slug.`)
      }
      return { _type: 'slug', current: slug }
    }
    case 'date': {
      if (typeof value !== 'string') throw new SanityWriteError('validation', `${field.label} must be a valid date.`)
      const iso = toStoredDate(value, current[field.name])
      if (!iso) throw new SanityWriteError('validation', `${field.label} must be a valid date.`)
      return iso
    }
    case 'portableText': {
      const blocks = sanitizePortableText(value, richTextConfigFor(collection.type, field.name))
      return isEmptyRichText(blocks) ? null : blocks
    }
    case 'image': {
      const ref = typeof value === 'string' ? value : (value as { asset?: { _ref?: unknown } })?.asset?._ref
      if (typeof ref !== 'string' || !/^image-[a-f0-9]+-\d+x\d+-[a-z0-9]+$/i.test(ref)) {
        throw new SanityWriteError('validation', `${field.label} must be an image from the media library.`)
      }
      if (!(await deps.reader.imageAssetExists(ref))) throw new SanityWriteError('validation', 'This image no longer exists in Media.')
      // Nouvelle image : le recadrage et l'ancien texte alternatif local ne valent plus (le texte alternatif vit sur l'asset).
      return { _type: 'image', asset: { _type: 'reference', _ref: ref } }
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(n) ? n : value
    }
    default:
      return value
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type SaveFieldResult = ActionResult<{ status: CmsStatus; row: CmsRow | null }>

/** Écrit UN champ d'un élément dans son brouillon (sauvegarde automatique du panneau et des cellules). */
export async function saveFieldCore(deps: CmsDeps, input: unknown): Promise<SaveFieldResult> {
  let session: Session
  try {
    session = await deps.requireCapability('content.write', 'action')
  } catch (err) {
    return errorResult(err, deps)
  }
  const parsed = saveFieldInput.safeParse(input)
  if (!parsed.success) return fail('Invalid request.')
  const { collectionId, id, field: fieldName, value } = parsed.data
  const collection = findCollection(deps.config, collectionId)
  if (!collection) return fail('This collection does not exist.')
  const field = collection.fields.find((f) => f.name === fieldName)
  if (!field) return fail('This field cannot be edited here.')

  try {
    const state = await readItem(deps, collection, id)
    if (!state?.value) return fail('This item no longer exists.')
    const normalized = await normalizeFieldValue(deps, collection, field, value, state.value)
    const message = validateFieldValue(field, normalized)
    if (message) return fail(message, field.name)
    const patch: DraftPatch = normalized === null ? { unset: [field.name] } : { set: { [field.name]: normalized } }
    await deps.drafts.setDraftFields(session, id, patch, { fields: { [field.name]: field } })
    const next = await deps.drafts.getDocumentState(id)
    return { ok: true, status: statusOf(next), row: buildRow(collection, next.published, next.draft, deps.env) }
  } catch (err) {
    return errorResult(err, deps, field.name)
  }
}

/** « + » (G5) : nouvel élément en brouillon, puis sa fiche s'ouvre (C4). */
export async function createItemCore(deps: CmsDeps, input: unknown): Promise<ActionResult<{ id: string }>> {
  let session: Session
  try {
    session = await deps.requireCapability('content.write', 'action')
  } catch (err) {
    return errorResult(err, deps)
  }
  const parsed = createInput.safeParse(input)
  if (!parsed.success) return fail('Invalid request.')
  const collection = findCollection(deps.config, parsed.data.collectionId)
  if (!collection) return fail('This collection does not exist.')

  try {
    const docs = await deps.reader.collectionDocs(collection.type)
    const initial: Record<string, unknown> = {}
    const fields: Record<string, FieldDef> = {}
    const titleDef = collection.fields.find((f) => f.name === collection.titleField)
    const title = `Untitled ${collection.singular.toLowerCase()}`
    initial[collection.titleField] = title
    if (titleDef) fields[collection.titleField] = titleDef
    if (collection.slugField) {
      initial[collection.slugField] = { _type: 'slug', current: uniqueSlug(slugify(title), takenSlugs(docs, collection.slugField)) }
    }
    // Dates obligatoires : aujourd'hui (le client la change dans la fiche).
    const today = (deps.now?.() ?? new Date()).toISOString().slice(0, 10)
    for (const f of collection.fields) {
      if (f.kind === 'date' && f.required) initial[f.name] = `${today}T00:00:00.000Z`
    }
    if (collection.orderable) {
      const ranked = docs.map((d) => ({ id: d._id, rank: typeof d.orderRank === 'string' ? d.orderRank : null }))
      initial.orderRank = rankAfterLast(ranked)
    }
    const { id } = await deps.drafts.createDraft(session, collection.type, initial, { fields })
    return { ok: true, id }
  } catch (err) {
    return errorResult(err, deps)
  }
}

export type ReorderResult = ActionResult<{ updates: { id: string; rank: string; status: CmsStatus }[] }>

/**
 * ⇅ Ordre manuel : l'interface envoie les voisins de l'élément déplacé ; le serveur relit les clés actuelles
 * et calcule la nouvelle clé (fractional-indexing) — une seule écriture dans le cas normal.
 */
export async function reorderCore(deps: CmsDeps, input: unknown): Promise<ReorderResult> {
  let session: Session
  try {
    session = await deps.requireCapability('content.write', 'action')
  } catch (err) {
    return errorResult(err, deps)
  }
  const parsed = reorderInput.safeParse(input)
  if (!parsed.success) return fail('Invalid request.')
  const { collectionId, id, beforeId, afterId } = parsed.data
  const collection = findCollection(deps.config, collectionId)
  if (!collection) return fail('This collection does not exist.')
  if (!collection.orderable) return fail('This collection has no manual order.')

  try {
    const docs = await deps.reader.collectionDocs(collection.type)
    // Version affichée de chaque élément : le brouillon s'il existe.
    const byId = new Map<string, SanityDoc>()
    for (const doc of docs) {
      const pid = doc._id.replace(/^drafts\./, '')
      if (!byId.has(pid) || doc._id.startsWith('drafts.')) byId.set(pid, doc)
    }
    if (!byId.has(id)) return fail('This item no longer exists.')
    const ordered = sortByRank([...byId].map(([pid, doc]) => ({ id: pid, rank: typeof doc.orderRank === 'string' ? doc.orderRank : null })))
    const updates = planMove(ordered, id, targetIndexFromNeighbours(ordered, id, beforeId, afterId))
    const out: { id: string; rank: string; status: CmsStatus }[] = []
    for (const update of updates) {
      await deps.drafts.setDraftFields(session, update.id, { set: { orderRank: update.rank } }, { fields: { orderRank: ORDER_RANK_FIELD } })
      const state = await deps.drafts.getDocumentState(update.id)
      out.push({ ...update, status: statusOf(state) })
    }
    return { ok: true, updates: out }
  } catch (err) {
    return errorResult(err, deps)
  }
}

/**
 * Menu du statut et ⋯ du panneau :
 * - `discard` (Changed → « Discard changes ») : supprime le brouillon, retour à la version en ligne ;
 * - `delete-draft` (Draft → « Delete draft ») : supprime un élément jamais publié.
 * Dépublier ou supprimer un élément en ligne n'est pas fait ici (voir CLAUDE.md : au prochain Publish, à venir).
 */
export async function statusActionCore(deps: CmsDeps, input: unknown): Promise<ActionResult<{ status: CmsStatus | null; row: CmsRow | null }>> {
  let session: Session
  try {
    session = await deps.requireCapability('content.write', 'action')
  } catch (err) {
    return errorResult(err, deps)
  }
  const parsed = statusInput.safeParse(input)
  if (!parsed.success) return fail('Invalid request.')
  const { collectionId, id, action } = parsed.data
  const collection = findCollection(deps.config, collectionId)
  if (!collection) return fail('This collection does not exist.')

  try {
    const state = await readItem(deps, collection, id)
    if (!state) return fail('This item no longer exists.')
    if (action === 'discard') {
      if (!state.published) return fail('This item has never been published: delete the draft instead.')
      if (!state.draft) return { ok: true, status: 'live', row: buildRow(collection, state.published, null, deps.env) }
      await deps.drafts.deleteDraft(session, id)
      return { ok: true, status: 'live', row: buildRow(collection, state.published, null, deps.env) }
    }
    if (state.published) return fail('This item is live: it can only be removed at the next Publish.')
    await deps.drafts.deleteDraft(session, id)
    return { ok: true, status: null, row: null }
  } catch (err) {
    return errorResult(err, deps)
  }
}

/** Barre de sélection : supprime les éléments jamais publiés ; les éléments en ligne sont ignorés (comptés). */
export async function deleteItemsCore(deps: CmsDeps, input: unknown): Promise<ActionResult<{ deleted: string[]; skipped: string[] }>> {
  let session: Session
  try {
    session = await deps.requireCapability('content.write', 'action')
  } catch (err) {
    return errorResult(err, deps)
  }
  const parsed = deleteManyInput.safeParse(input)
  if (!parsed.success) return fail('Invalid request.')
  const collection = findCollection(deps.config, parsed.data.collectionId)
  if (!collection) return fail('This collection does not exist.')

  const deleted: string[] = []
  const skipped: string[] = []
  try {
    for (const id of new Set(parsed.data.ids)) {
      const state = await readItem(deps, collection, id)
      if (!state || state.published) {
        skipped.push(id)
        continue
      }
      await deps.drafts.deleteDraft(session, id)
      deleted.push(id)
    }
    return { ok: true, deleted, skipped }
  } catch (err) {
    const result = errorResult(err, deps)
    return deleted.length ? { ...result, error: `${result.error} (${deleted.length} deleted before the error.)` } : result
  }
}
