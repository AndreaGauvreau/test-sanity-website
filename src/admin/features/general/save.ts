import { z } from 'zod'

import type { FieldDef } from '@/admin/core/contracts'

import {
  GENERAL_BOOLEAN_FIELDS,
  GENERAL_IMAGE_FIELDS,
  GENERAL_IMAGE_SLOTS,
  GENERAL_TEXT_FIELDS,
  IMAGE_MIME,
  UPLOAD_MAX_BYTES,
  type GeneralImageSlot,
} from './fields'
import { imageFieldValue, isAllowedKind, safeFileName, sniffImageKind, toGeneralImage, type GeneralImage } from './images'

/**
 * Cœur des server actions de B2, sans Next ni Sanity : les dépendances (écriture du brouillon, envoi d'asset)
 * sont injectées par `actions.ts` (vrais clients) ou par les tests (faux). Chaque entrée est validée par zod
 * AVANT toute écriture ; les valeurs sont revalidées par `saveDraftField` d'après leur FieldDef.
 */

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export type GeneralDeps = {
  /** Écrit un champ du brouillon `drafts.siteSettings` (null → unset), validé d'après `field`. */
  saveField(path: string, value: unknown, field: FieldDef): Promise<unknown>
  /** Envoie un fichier dans les assets Sanity ; renvoie l'id de l'asset (« image-…-64x64-png »). */
  uploadImage(bytes: Uint8Array, options: { filename: string; contentType: string }): Promise<{ _id: string }>
  projectId: string
  dataset: string
}

const TEXT_MAX_INPUT = 5_000

export const saveValueSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('title'), value: z.string().max(TEXT_MAX_INPUT) }),
  z.object({ field: z.literal('description'), value: z.string().max(TEXT_MAX_INPUT) }),
  z.object({ field: z.literal('allowIndexing'), value: z.boolean() }),
])

export type SaveValueInput = z.infer<typeof saveValueSchema>

export const slotSchema = z.enum(GENERAL_IMAGE_SLOTS as [GeneralImageSlot, ...GeneralImageSlot[]])

export const removeImageSchema = z.object({ slot: slotSchema })

const INVALID = 'This change is not valid. Reload the page and try again.'

/** Titre, description ou indexation → brouillon. Texte vide → champ retiré (le schéma dit alors « requis » pour Title). */
export async function saveGeneralValue(deps: GeneralDeps, input: unknown): Promise<ActionResult> {
  const parsed = saveValueSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: INVALID }
  const { field, value } = parsed.data
  if (field === 'allowIndexing') {
    await deps.saveField(field, value, GENERAL_BOOLEAN_FIELDS.allowIndexing)
    return { ok: true }
  }
  // Pas de retours à la ligne dans ces deux valeurs (une ligne dans les balises <title> / <meta>).
  const text = value.replace(/\r?\n/g, ' ')
  await deps.saveField(field, text === '' ? null : text, GENERAL_TEXT_FIELDS[field])
  return { ok: true }
}

/** Retire l'image d'un emplacement (pastille ×). L'asset reste dans la médiathèque. */
export async function removeGeneralImage(deps: GeneralDeps, input: unknown): Promise<ActionResult> {
  const parsed = removeImageSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: INVALID }
  await deps.saveField(parsed.data.slot, null, GENERAL_IMAGE_FIELDS[parsed.data.slot])
  return { ok: true }
}

/**
 * Envoi d'une image (FormData : `slot`, `file`). Contrôles : emplacement connu, fichier non vide, 1 Mo au plus,
 * format RÉEL (octets) permis pour l'emplacement. Puis asset Sanity, puis référence écrite dans le brouillon.
 */
export async function uploadGeneralImage(deps: GeneralDeps, form: FormData): Promise<ActionResult<{ image: GeneralImage }>> {
  const slot = slotSchema.safeParse(form.get('slot'))
  const file = form.get('file')
  if (!slot.success || !(file instanceof Blob)) return { ok: false, error: INVALID }
  if (file.size === 0) return { ok: false, error: 'This file is empty.' }
  if (file.size > UPLOAD_MAX_BYTES) return { ok: false, error: 'This image is larger than 1 MB. Use a smaller file.' }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImageKind(bytes)
  if (!isAllowedKind(slot.data, kind)) {
    return {
      ok: false,
      error: slot.data === 'socialImage' ? 'Use a PNG, JPG or WebP image.' : 'Use a PNG, JPG, SVG or ICO image.',
    }
  }
  const name = typeof (file as File).name === 'string' ? (file as File).name : 'image'
  const asset = await deps.uploadImage(bytes, { filename: safeFileName(name, kind), contentType: IMAGE_MIME[kind] })
  const value = imageFieldValue(asset._id)
  const image = toGeneralImage(value, deps.projectId, deps.dataset)
  if (!image) return { ok: false, error: "Sanity couldn't read this image. Try another file." }
  await deps.saveField(slot.data, value, GENERAL_IMAGE_FIELDS[slot.data])
  return { ok: true, image }
}
