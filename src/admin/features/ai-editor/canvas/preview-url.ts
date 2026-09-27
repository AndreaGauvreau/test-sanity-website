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
