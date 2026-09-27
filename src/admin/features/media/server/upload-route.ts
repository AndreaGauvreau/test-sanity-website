import { isSameOriginRequest } from '@/admin/core/auth/request'

import { UPLOAD_MAX_BODY } from '../lib/upload-limits'
import type { ActionResult, UploadInput } from './actions-core'
import type { MediaAsset } from '../lib/assets'

/**
 * Logique de `POST /admin/media/upload` (C5 « + », Replace ; C4 image d'une fiche), sans Next : dépendances
 * injectées, testée avec de vrais objets `Request`. La route (src/app/admin/(shell)/media/upload/route.ts) ne
 * fait que brancher les vraies dépendances.
 *
 * Ordre : droit `content.write` EN PREMIER → même origine (CSRF) → taille annoncée → lecture du corps BORNÉE
 * (un corps sans Content-Length ou plus long qu'annoncé est coupé à `maxBody`) → multipart → uploadCore
 * (type en liste blanche, taille par genre, nom nettoyé).
 *
 * La route est hors du matcher du proxy (auth-core) : c'est donc ELLE qui borne le corps. Avant, le proxy
 * mettait le corps en mémoire tampon jusqu'à `proxyClientMaxBodySize` (10 Mo par défaut) et le tronquait
 * au-delà (constat QA-1 : tout envoi > 10 Mo finissait en « Invalid upload. »).
 */

export type UploadResponseBody = ActionResult<{ asset: MediaAsset; updated: number }>

export type UploadRouteDeps = {
  /** `requireCapability('content.write', 'route')` ; renvoie la réponse d'erreur (401/403) ou null. */
  authorize: () => Promise<Response | null>
  /** Réponse d'erreur au format `{ error: { code, message } }` (jsonError de core/auth). */
  jsonError: (status: number, code: string, message: string) => Response
  upload: (file: UploadInput, replace: string | null) => Promise<UploadResponseBody>
  /** Corps maximal (défaut UPLOAD_MAX_BODY). */
  maxBody?: number
}

const TOO_LARGE = 'This file is too large.'

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

export async function handleUploadRequest(request: Request, deps: UploadRouteDeps): Promise<Response> {
  const denied = await deps.authorize()
  if (denied) return denied
  if (!isSameOriginRequest(request.headers)) return deps.jsonError(403, 'forbidden', 'Cross-site requests are not allowed.')

  const max = deps.maxBody ?? UPLOAD_MAX_BODY
  const announced = request.headers.get('content-length')
  if (announced !== null) {
    const length = Number(announced)
    if (!Number.isFinite(length) || length < 0) return deps.jsonError(400, 'bad_request', 'Invalid upload.')
    if (length > max) return deps.jsonError(413, 'bad_request', TOO_LARGE)
  }

  const bytes = await readBodyCapped(request, max)
  if (bytes === 'too-large') return deps.jsonError(413, 'bad_request', TOO_LARGE)

  let form: FormData
  try {
    const contentType = request.headers.get('content-type') ?? ''
    form = await new Response(bytes, { headers: { 'content-type': contentType } }).formData()
  } catch {
    return deps.jsonError(400, 'bad_request', 'Invalid upload.')
  }
  const file = form.get('file')
  if (!(file instanceof File)) return Response.json({ ok: false, error: 'Choose a file to upload.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  const replace = form.get('replace')

  const data = new Uint8Array(await file.arrayBuffer())
  const result = await deps.upload({ name: file.name, type: file.type, size: data.byteLength, data }, typeof replace === 'string' ? replace : null)
  return Response.json(result, { status: result.ok ? 200 : 400, headers: { 'Cache-Control': 'no-store' } })
}
