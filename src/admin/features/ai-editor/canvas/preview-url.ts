/**
 * URL de l'iframe d'aperçu (EditorState.preview) vérifiée avant usage. Pur.
 * - http(s) seulement (jamais javascript:, data:, blob:) ;
 * - URL relative acceptée (page d'essai servie par l'admin) : résolue sur l'adresse de l'admin ;
 * - si le moteur annonce une origine, elle doit être celle de l'URL : c'est l'origine que le parent exigera de
 *   chaque message du pont.
 */
export type PreviewTarget = { url: string; origin: string }

export function resolvePreview(url: string | null | undefined, declaredOrigin: string | null | undefined, base: string): PreviewTarget | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url, base)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null
  if (declaredOrigin) {
    let declared: string
    try {
      declared = new URL(declaredOrigin).origin
    } catch {
      return null
    }
    if (declared !== parsed.origin) return null
  }
  return { url: parsed.href, origin: parsed.origin }
}

/** Paramètre du jeton d'accès à l'aperçu (voir src/admin/core/engine/preview-token.ts, SEC-09). */
export const PREVIEW_TOKEN_PARAM = 'kz_preview'

/**
 * Adresse de l'aperçu SANS le jeton d'accès : deux URL de même clé montrent la même page. Le moteur émet un jeton
 * court neuf à chaque GET /editor/state ; seule une clé différente doit recharger l'iframe. Pur ; URL invalide → elle-même.
 */
export function previewKey(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete(PREVIEW_TOKEN_PARAM)
    return parsed.href
  } catch {
    return url
  }
}

/**
 * Échéance (secondes Unix) du jeton court porté par l'URL (`v1.<exp>.<uid>.<sig>`), ou null s'il n'y en a pas ou qu'il
 * n'a pas ce format (page d'essai, ancien secret) : null = pas d'échéance connue. Ne vérifie pas la signature (le proxy
 * de l'aperçu le fait) ; ne sert qu'à savoir s'il faut redemander une adresse au moteur avant de recharger.
 */
export function previewTokenExpiry(url: string): number | null {
  let token: string | null
  try {
    token = new URL(url).searchParams.get(PREVIEW_TOKEN_PARAM)
  } catch {
    return null
  }
  const match = token ? /^v1\.(\d{9,11})\.[\w-]+\.[\w-]+$/.exec(token) : null
  return match ? Number(match[1]) : null
}

/** Marge avant échéance : un jeton qui expire dans moins de 30 s est traité comme expiré. */
export const PREVIEW_TOKEN_MARGIN_SECONDS = 30

/** Jeton de l'URL expiré (ou sur le point de l'être) ? Sans jeton daté : jamais. */
export function previewTokenExpired(url: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const exp = previewTokenExpiry(url)
  return exp !== null && exp - PREVIEW_TOKEN_MARGIN_SECONDS <= nowSeconds
}
