import 'server-only'

import { z } from 'zod'

import type { FieldDef, Session } from '@/admin/core/contracts'
import { createDraft, getDocumentState, saveDraftField } from '@/admin/core/sanity/drafts'
import { SanityWriteError } from '@/admin/core/sanity/paths'
import type { DraftStore } from '@/admin/core/sanity/store'

import { IMAGE_ASSET_ID, imageAssetId, toImage } from '../lib/form'
import {
  ARTICLE_SEO_FIELDS,
  articleOf,
  findPage,
  resolveFieldAtPath,
  SEO_FIELDS,
  seoPathOf,
  unknownVariables,
  type ArticleSeoKey,
  type Config,
  type SeoKey,
} from '../lib/manifest'

/**
 * Cœur des écritures de C1, C2 et C6, SANS la garde de session (faite par actions.ts / la route d'envoi) :
 * testable avec un faux magasin Sanity (`deps.store`). Toute entrée est traitée comme non fiable : zod pour la forme,
 * manifeste pour les chemins (liste blanche), FieldDef pour la valeur (validateFieldValue dans core/sanity).
 */

export type SaveResult = { ok: true } | { ok: false; error: string }

export type SaveDeps = { store?: DraftStore; config?: Config }

/** Plafond de la valeur sérialisée (un champ ou un tableau de la page). */
const MAX_VALUE_BYTES = 32_000

const pageId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
const jsonValue = z.unknown().refine((value) => {
  try {
    return JSON.stringify(value ?? null).length <= MAX_VALUE_BYTES
  } catch {
    return false
  }
}, 'Value too large.')

export const pageFieldInput = z.object({ pageId, path: z.string().min(1).max(256), value: jsonValue }).strict()
export const pageSeoInput = z
  .object({ pageId, key: z.enum(['metaTitle', 'metaDescription', 'ogImage', 'allowIndexing']), value: jsonValue })
  .strict()
export const articleSeoInput = z
  .object({ pageId, key: z.enum(['metaTitle', 'metaDescription', 'ogImageField', 'ogImage', 'allowIndexing']), value: jsonValue })
  .strict()

const INVALID = "This change couldn't be saved. Reload the page and try again."

export function errorMessage(err: unknown): string {
  if (err instanceof SanityWriteError) {
    const detail = err.details ? Object.values(err.details)[0] : undefined
    return detail ?? err.message
  }
  console.error('[pages] save failed', err)
  return "Sanity isn't responding. Please try again in a moment."
}

/** Valeur vide d'un texte → unset ; le reste tel quel (validé ensuite d'après le FieldDef). */
function normalize(field: FieldDef, value: unknown): unknown {
  if (typeof value === 'string' && value === '' && field.kind !== 'boolean') return null
  return value
}

/** Valeur d'image envoyée par le navigateur : id d'asset (`image-…`), objet image, ou null → objet image Sanity. */
function imageFromInput(value: unknown): { ok: true; value: unknown } | { ok: false } {
  if (value === null || value === undefined || value === '') return { ok: true, value: null }
  if (typeof value === 'string' && IMAGE_ASSET_ID.test(value)) return { ok: true, value: toImage(value) }
  // Objet image du formulaire : seul l'id d'asset est gardé (objet reconstruit, rien d'autre n'est écrit).
  const ref = imageAssetId(value)
  if (ref && IMAGE_ASSET_ID.test(ref)) return { ok: true, value: toImage(ref) }
  return { ok: false }
}

// ─── C1 : un champ du document de la page ───────────────────────────────────

export async function savePageField(session: Session, raw: unknown, deps: SaveDeps = {}): Promise<SaveResult> {
  const parsed = pageFieldInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: INVALID }
  const { pageId: id, path } = parsed.data
  const page = findPage(id, deps.config)
  if (!page?.document) return { ok: false, error: 'This page has no editable content.' }
  const field = resolveFieldAtPath(page, path)
  if (!field || field.kind === 'portableText') return { ok: false, error: "This field can't be edited here." }
  let value = normalize(field, parsed.data.value)
  if (field.kind === 'image') {
    const image = imageFromInput(value)
    if (!image.ok) return { ok: false, error: `${field.label} must be an image from the media library.` }
    value = image.value
  }
  try {
    await saveDraftField(session, page.document.id, path, value, { field, store: deps.store })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

// ─── C2 : SEO de la page ────────────────────────────────────────────────────

export async function savePageSeo(session: Session, raw: unknown, deps: SaveDeps = {}): Promise<SaveResult> {
  const parsed = pageSeoInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: INVALID }
  const { pageId: id, key } = parsed.data
  const page = findPage(id, deps.config)
  const path = page ? seoPathOf(page, key as SeoKey) : null
  if (!page?.document || !path) return { ok: false, error: 'This page has no SEO settings.' }
  const field: FieldDef = { ...SEO_FIELDS[key as SeoKey] }
  let value = normalize(field, parsed.data.value)
  if (key === 'ogImage') {
    const image = imageFromInput(value)
    if (!image.ok) return { ok: false, error: 'OG image must be an image from the media library.' }
    value = image.value
  }
  try {
    await saveDraftField(session, page.document.id, path, value, { field, store: deps.store })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

// ─── C6 : modèle SEO des pages article ──────────────────────────────────────

export async function saveArticleSeo(session: Session, raw: unknown, deps: SaveDeps = {}): Promise<SaveResult> {
  const parsed = articleSeoInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: INVALID }
  const { pageId: id, key } = parsed.data
  const page = findPage(id, deps.config)
  const article = page ? articleOf(page, deps.config) : null
  if (!page || !article) return { ok: false, error: 'This page has no article page.' }
  const field: FieldDef = { ...ARTICLE_SEO_FIELDS[key as ArticleSeoKey] }
  let value = normalize(field, parsed.data.value)
  if (key === 'ogImage') {
    const image = imageFromInput(value)
    if (!image.ok) return { ok: false, error: 'OG image must be an image from the media library.' }
    value = image.value
  }
  if ((key === 'metaTitle' || key === 'metaDescription') && typeof value === 'string') {
    const unknown = unknownVariables(value, article.variables)
    if (unknown.length) return { ok: false, error: `Unknown field {{${unknown[0]}}}. Insert a field from the list.` }
  }
  try {
    await ensureTemplateDocument(session, page.article!.seoTemplate, page.article!.collection, deps)
    await saveDraftField(session, article.documentId, key, value, { field, store: deps.store })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

/**
 * Le modèle SEO d'article est un document unique à id fixe, créé par la migration. S'il manque (dataset neuf), on
 * crée son brouillon avec les valeurs par défaut du site (celles qu'il applique sans document).
 */
async function ensureTemplateDocument(
  session: Session,
  ref: { type: string; id: string },
  collection: string,
  deps: SaveDeps,
): Promise<void> {
  const state = await getDocumentState(ref.id, { store: deps.store })
  if (state.value) return
  await createDraft(
    session,
    ref.type,
    { collection, metaTitle: '{{title}}', metaDescription: '{{excerpt}}', ogImageField: 'cover', allowIndexing: true },
    { id: ref.id, store: deps.store },
  )
}
