import { authErrorResponse, jsonError, requireCapability } from '@/admin/core/auth/session'
import type { Session } from '@/admin/core/contracts'
import { generalDeps } from '@/admin/features/general/deps'
import { uploadGeneralImage } from '@/admin/features/general/save'
import { handleGeneralImageUpload } from '@/admin/features/general/upload-route'

/**
 * POST /admin/settings/general/image — envoi d'un favicon ou de l'image sociale (B2).
 * Route plutôt que server action (FOLLOWUPS #40, SEC-02) : `serverActions.bodySizeLimit` revient au défaut de Next.
 * Droit `content.write` EN PREMIER, même origine, corps borné : logique et tests dans features/general/upload-route.ts.
 * Corps : multipart/form-data { slot: 'faviconLight' | 'faviconDark' | 'socialImage', file }.
 * Réponse : { ok: true, image } | { ok: false, error } | { error: { code, message } }.
 */

export async function POST(request: Request): Promise<Response> {
  let session: Session | null = null
  return handleGeneralImageUpload(request, {
    authorize: async () => {
      try {
        session = await requireCapability('content.write', 'route')
        return null
      } catch (err) {
        return authErrorResponse(err)
      }
    },
    jsonError,
    upload: (form) => {
      // Jamais atteint sans session : handleGeneralImageUpload appelle authorize() en premier.
      if (!session) throw new Error('upload called before authorize')
      return uploadGeneralImage(generalDeps(session), form)
    },
  })
}
