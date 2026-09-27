import { z } from 'zod'
import type { EditRequest, ElementTarget } from '../../../src/admin/core/contracts'
import type { DesignSystem } from '../guards/design-system'
import { badRequest } from '../server/errors'

/**
 * Validation de la demande venue du navigateur (via le relais de l'admin) — `parseEditRequest` du POC, au contrat
 * `EditRequest`. Rien de ce qui entre dans le prompt ne vient tel quel du navigateur : le libellé d'un élément est
 * remplacé par celui de zones.json, les zones doivent exister (Object.hasOwn), `doc` et `key` ont un jeu de caractères
 * fermé. Messages en anglais (affichés dans l'admin).
 */

export const NOTE_MAX = 600
export const MAX_TARGETS = 8
export const VIEWPORTS = [1280, 768, 375] as const

const DOC_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const KEY = /^[A-Za-z0-9_-]{1,64}$/
const ZONE_ID = /^[A-Za-z0-9_.-]{1,100}$/
/** Identifiant d'une demande ou d'une modification (segment d'URL sûr pour le relais). */
export const ID_PATTERN = /^[a-z]{2,4}_[a-z0-9]{8,40}$/

/** Chemin public d'une page : absolu, sans origine, requête, fragment ni échappement. */
export function isPagePath(page: unknown): page is string {
  return (
    typeof page === 'string' &&
    page.length >= 1 &&
    page.length <= 200 &&
    page.startsWith('/') &&
    !page.startsWith('//') &&
    /^\/[A-Za-z0-9\-._~/%[\]]*$/.test(page) &&
    !page.split('/').some((segment) => segment === '..' || segment === '.')
  )
}

const TARGET = z.object({
  zone: z.string().regex(ZONE_ID),
  index: z.number().int().min(0).max(99),
  doc: z.string().regex(DOC_ID).optional(),
  key: z.string().regex(KEY).optional(),
  label: z.string().max(200).optional(),
})

const REQUEST = z.object({
  page: z.string().refine(isPagePath),
  targets: z.array(TARGET).min(1).max(MAX_TARGETS),
  scope: z.array(z.enum(['style', 'text'])).min(1).max(2),
  note: z.string(),
  viewport: z.union([z.literal(1280), z.literal(768), z.literal(375)]),
  changeId: z.string().regex(ID_PATTERN).optional(),
})

const FIELD_MESSAGES: Record<string, string> = {
  page: 'Invalid page.',
  targets: `Select 1 to ${MAX_TARGETS} elements.`,
  scope: 'Choose “Style”, “Text” or both.',
  note: `Describe the change (${NOTE_MAX} characters at most).`,
  viewport: 'Invalid screen size.',
  changeId: 'Invalid change.',
}

/** Forme de la demande (sans le design system) ; lève EngineError 400. */
export function parseRequestShape(body: unknown): EditRequest {
  const parsed = REQUEST.safeParse(body)
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? '')
    throw badRequest(FIELD_MESSAGES[field] ?? 'Invalid request.')
  }
  const data = parsed.data
  const note = data.note.replace(/[\p{Cc}\p{Cf}]+/gu, (match) => (/\n/.test(match) ? '\n' : ' ')).trim()
  if (!note || note.length > NOTE_MAX) throw badRequest(FIELD_MESSAGES.note)
  const scope = [...new Set(data.scope)]
  return {
    page: data.page,
    targets: data.targets.map((target) => ({
      zone: target.zone,
      index: target.index,
      ...(target.doc ? { doc: target.doc } : {}),
      ...(target.key ? { key: target.key } : {}),
      label: target.label ?? target.zone,
    })),
    scope,
    note,
    viewport: data.viewport,
    ...(data.changeId ? { changeId: data.changeId } : {}),
  }
}

/** Libellé d'une zone tiré de zones.json (« Hero · Title »), jamais du navigateur. */
export const zoneLabel = (ds: Pick<DesignSystem, 'zones'>, zone: string) =>
  Object.hasOwn(ds.zones, zone) ? `${ds.zones[zone].section} · ${ds.zones[zone].label}` : zone

/**
 * Demande confrontée au design system : zones déclarées, périmètre possible pour les éléments visés, libellés
 * remplacés. Lève EngineError 400.
 */
export function checkRequestAgainst(ds: Pick<DesignSystem, 'zones'>, request: EditRequest): EditRequest {
  const targets: ElementTarget[] = []
  for (const target of request.targets) {
    if (!Object.hasOwn(ds.zones, target.zone)) throw badRequest('This element can no longer be edited: reload the preview.')
    targets.push({ ...target, label: zoneLabel(ds, target.zone) })
  }
  const zones = targets.map((target) => ds.zones[target.zone])
  if (request.scope.includes('text') && !zones.some((zone) => zone.text)) {
    throw badRequest('These elements have no editable text: turn off “Text”.')
  }
  if (request.scope.includes('style') && !zones.some((zone) => zone.files.some((file) => file.endsWith('.css')))) {
    throw badRequest('The style of these elements cannot be changed: turn off “Style”.')
  }
  return { ...request, targets }
}
