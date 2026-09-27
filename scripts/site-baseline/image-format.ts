/**
 * Format d'image figé pour les captures de référence.
 *
 * cdn.sanity.io (`auto=format`) et l'optimiseur de Next négocient le format sur l'en-tête Accept : avec celui
 * de Chrome (`image/avif,image/webp,…`), la même URL revient tantôt en AVIF, tantôt en WebP (selon le nœud
 * du CDN et son cache), et le décodage diffère de quelques niveaux : la référence ne se rejoue pas à 0 pixel.
 * On retire l'AVIF de l'en-tête de toutes les requêtes d'images : le CDN sert alors toujours du WebP.
 */
import type { BrowserContext, Request, Route } from 'playwright-core'

export const STABLE_IMAGE_ACCEPT = 'image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.5'

/** En-têtes d'une requête d'image avec l'Accept figé (les autres en-têtes sont gardés). */
export function withStableImageAccept(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() !== 'accept') out[k] = v
  out.accept = STABLE_IMAGE_ACCEPT
  return out
}

type RouteLike = Pick<Route, 'continue'> & { request(): Pick<Request, 'resourceType' | 'headers'> }

/** Gestionnaire de route : réécrit l'Accept des images, laisse passer le reste tel quel. */
export async function pinImageRoute(route: RouteLike): Promise<void> {
  const req = route.request()
  if (req.resourceType() !== 'image') return route.continue()
  return route.continue({ headers: withStableImageAccept(req.headers()) })
}

export async function pinImageFormat(context: BrowserContext): Promise<void> {
  await context.route('**/*', pinImageRoute)
}
