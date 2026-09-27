import { isSameOriginRequest } from '@/admin/core/auth/request'

import { actionErrorMessage, isUnexpectedError } from './errors'
import { UPLOAD_MAX_BODY, UPLOAD_TOO_LARGE } from './fields'
import type { GeneralImage } from './images'
import type { ActionResult } from './save'

/**
 * Logique de `POST /admin/settings/general/image` (B2 : favicons, image sociale), sans Next : dépendances injectées,
 * testée avec de vrais objets `Request`. La route (src/app/admin/(shell)/settings/general/image/route.ts) ne fait que
 * brancher les vraies dépendances.
 *
 * Route plutôt que server action (FOLLOWUPS #40, SEC-02) : `serverActions.bodySizeLimit` peut revenir au défaut de
 * Next (1 Mo) pour toutes les actions de l'admin ; seule cette route accepte un corps de ~5 Mo, et elle le borne.
 *
 * Ordre : droit `content.write` EN PREMIER → même origine (CSRF) → taille annoncée → lecture du corps BORNÉE (un corps
 * sans Content-Length ou plus long qu'annoncé est coupé à `maxBody`) → multipart → `uploadGeneralImage` (save.ts :
 * emplacement, 5 Mo, format réel par les octets, asset puis référence dans le brouillon).
 *
 * Réponses : 200 `{ ok: true, image }` ; refus métier `{ ok: false, error }` (400, 403, 503) ; refus de la garde,
 * de l'origine ou de la taille au format `{ error: { code, message } }` (jsonError de core/auth).
 */

export type GeneralUploadBody = ActionResult<{ image: GeneralImage }>

export type GeneralUploadRouteDeps = {
  /** `requireCapability('content.write', 'route')` ; renvoie la réponse d'erreur (401/403) ou null. */
  authorize: () => Promise<Response | null>
  /** Réponse d'erreur `{ error: { code, message } }` (jsonError de core/auth). */
  jsonError: (status: number, code: string, message: string) => Response
  /** Envoi et écriture (uploadGeneralImage avec les dépendances de la session). Peut lever SanityWriteError. */
  upload: (form: FormData) => Promise<GeneralUploadBody>
  /** Corps maximal (défaut UPLOAD_MAX_BODY). */
  maxBody?: number
}

const NO_STORE = { 'Cache-Control': 'no-store' }

/** Lit le corps et s'arrête dès que `max` octets sont dépassés (jamais plus de `max` octets en mémoire). */
export async function readBodyCapped(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | 'too-large'> {
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      return 'too-large'
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** Statut HTTP d'une erreur levée pendant l'envoi (SanityWriteError reconnue par son nom). */
function statusOf(err: unknown): number {
  if (isUnexpectedError(err)) return 500
  const code = (err as { code?: unknown }).code
  if (code === 'forbidden') return 403
  if (code === 'unavailable') return 503
  if (code === 'unauthorized') return 401
  return 400
}

export async function handleGeneralImageUpload(request: Request, deps: GeneralUploadRouteDeps): Promise<Response> {
  const denied = await deps.authorize()
  if (denied) return denied
  if (!isSameOriginRequest(request.headers)) return deps.jsonError(403, 'forbidden', 'Cross-site requests are not allowed.')

  const max = deps.maxBody ?? UPLOAD_MAX_BODY
  const announced = request.headers.get('content-length')
  if (announced !== null) {
    const length = Number(announced)
    if (!Number.isFinite(length) || length < 0) return deps.jsonError(400, 'bad_request', 'Invalid upload.')
    if (length > max) return deps.jsonError(413, 'bad_request', UPLOAD_TOO_LARGE)
  }

  const bytes = await readBodyCapped(request, max)
  if (bytes === 'too-large') return deps.jsonError(413, 'bad_request', UPLOAD_TOO_LARGE)

  let form: FormData
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) throw new Error('not multipart')
    form = await new Response(bytes, { headers: { 'content-type': contentType } }).formData()
  } catch {
    return deps.jsonError(400, 'bad_request', 'Invalid upload.')
  }

  try {
    const result = await deps.upload(form)
    return Response.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE })
  } catch (err) {
    if (isUnexpectedError(err)) console.error('[admin/general] image upload failed:', err instanceof Error ? err.message : err)
    const body: GeneralUploadBody = { ok: false, error: actionErrorMessage(err) }
    return Response.json(body, { status: statusOf(err), headers: NO_STORE })
  }
}
