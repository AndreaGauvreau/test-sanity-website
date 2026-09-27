import type { GeneralUploadBody } from './upload-route'

/**
 * Envoi d'une image de B2 depuis le navigateur : `POST /admin/settings/general/image` (route handler, FOLLOWUPS #40).
 * Même forme de résultat que les server actions (`{ ok, image } | { ok: false, error }`, messages en anglais), quelle
 * que soit la réponse : refus de la garde / de l'origine / de la taille (`{ error: { code, message } }`), redirection
 * vers la connexion, réponse illisible, réseau coupé.
 */

export const GENERAL_IMAGE_ROUTE = '/admin/settings/general/image'

const GENERIC = "Couldn't save this change. Please try again."
const OFFLINE = "Couldn't reach the server. Check your connection and try again."
const EXPIRED = 'Your session has expired. Sign in again.'

export async function uploadGeneralImageRequest(form: FormData, fetchImpl: typeof fetch = fetch): Promise<GeneralUploadBody> {
  let response: Response
  try {
    response = await fetchImpl(GENERAL_IMAGE_ROUTE, { method: 'POST', body: form, credentials: 'same-origin' })
  } catch {
    return { ok: false, error: OFFLINE }
  }
  // Le proxy renvoie une session absente vers A1 (307 suivie par fetch) : on reçoit la page de connexion.
  if (response.redirected) return { ok: false, error: EXPIRED }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, error: GENERIC }
  }
  if (body && typeof body === 'object') {
    const b = body as { ok?: unknown; image?: unknown; error?: unknown }
    if (b.ok === true && b.image && typeof b.image === 'object' && response.ok) return body as GeneralUploadBody
    if (typeof b.error === 'string' && b.error) return { ok: false, error: b.error }
    const nested = (b.error as { message?: unknown } | null | undefined)?.message
    if (typeof nested === 'string' && nested) return { ok: false, error: nested }
  }
  return { ok: false, error: GENERIC }
}
