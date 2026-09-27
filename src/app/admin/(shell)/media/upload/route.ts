import { authErrorResponse, jsonError, requireCapability } from '@/admin/core/auth/session'
import { uploadCore } from '@/admin/features/media/server/actions-core'
import { mediaDeps } from '@/admin/features/media/server/deps'
import { handleUploadRequest } from '@/admin/features/media/server/upload-route'

/**
 * POST /admin/media/upload — envoi d'un fichier dans la médiathèque (C5 « + », Replace ; C4 image d'une fiche).
 * Route plutôt que server action : fichiers jusqu'à 100 Mo, bien au-delà de la limite des actions (6 Mo,
 * next.config.ts). Hors du matcher du proxy : droit, même origine et borne du corps sont faits ICI
 * (logique et tests : features/media/server/upload-route.ts).
 * Corps : multipart/form-data { file, replace? }. Réponse : { ok, asset, updated } | { ok: false, error }.
 */

export async function POST(request: Request): Promise<Response> {
  return handleUploadRequest(request, {
    authorize: async () => {
      try {
        await requireCapability('content.write', 'route')
        return null
      } catch (err) {
        return authErrorResponse(err)
      }
    },
    jsonError,
    upload: (file, replace) => uploadCore(mediaDeps(), file, replace),
  })
}
