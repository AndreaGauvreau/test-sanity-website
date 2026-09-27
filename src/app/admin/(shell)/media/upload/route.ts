import { authErrorResponse, jsonError, requireCapability } from '@/admin/core/auth/session'
import { isSameOriginRequest } from '@/admin/core/auth/request'
import { uploadCore } from '@/admin/features/media/server/actions-core'
import { mediaDeps } from '@/admin/features/media/server/deps'

/**
 * POST /admin/media/upload — envoi d'un fichier dans la médiathèque (C5 « + », Replace ; C4 image d'une fiche).
 * Route plutôt que server action : corps binaire sans la limite de 1 Mo des actions. Droit `content.write`
 * EN PREMIER, même origine (CSRF), taille bornée avant lecture, type et taille revérifiés dans uploadCore.
 * Corps : multipart/form-data { file, replace? }. Réponse : { ok, asset, updated } | { ok: false, error }.
 */

const MAX_BODY = 101 * 1024 * 1024

export async function POST(request: Request): Promise<Response> {
  try {
    await requireCapability('content.write', 'route')
  } catch (err) {
    return authErrorResponse(err)
  }
  if (!isSameOriginRequest(request.headers)) return jsonError(403, 'forbidden', 'Cross-site requests are not allowed.')
  const length = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(length) || length > MAX_BODY) return jsonError(413, 'bad_request', 'This file is too large.')

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError(400, 'bad_request', 'Invalid upload.')
  }
  const file = form.get('file')
  if (!(file instanceof File)) return Response.json({ ok: false, error: 'Choose a file to upload.' }, { status: 400 })
  const replace = form.get('replace')

  const data = new Uint8Array(await file.arrayBuffer())
  const result = await uploadCore(mediaDeps(), { name: file.name, type: file.type, size: data.byteLength, data }, typeof replace === 'string' ? replace : null)
  return Response.json(result, { status: result.ok ? 200 : 400, headers: { 'Cache-Control': 'no-store' } })
}
