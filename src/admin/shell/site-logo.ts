import 'server-only'

import { getReadClient } from '@/admin/core/sanity/clients'
import { pickSiteFavicon, siteLogoSrc } from '@/admin/core/site-logo-src'

/**
 * Logo de la sidebar au chargement de la coque : le favicon de siteSettings (brouillon compris, perspective `drafts`,
 * comme l'écran B2 qui l'édite), dark d'abord (l'admin est sombre), sinon light. SERVEUR SEULEMENT.
 * Échec ou délai dépassé : undefined → icône globe ; la coque ne tombe jamais pour un logo.
 * Mise à jour sans rechargement : `core/site-logo.ts`.
 */

export type SiteLogoClient = {
  fetch: (query: string, params: Record<string, string>, options: { signal?: AbortSignal; cache?: RequestCache }) => Promise<unknown>
}

export const SITE_LOGO_TIMEOUT_MS = 2500

export const SITE_LOGO_QUERY = '*[_id == "siteSettings"][0]{ "dark": faviconDark.asset->url, "light": faviconLight.asset->url }'

export async function fetchSiteLogo(client: SiteLogoClient, timeoutMs = SITE_LOGO_TIMEOUT_MS): Promise<string | undefined> {
  try {
    const result = (await client.fetch(SITE_LOGO_QUERY, {}, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })) as {
      dark?: unknown
      light?: unknown
    } | null
    const url = pickSiteFavicon({
      dark: typeof result?.dark === 'string' ? result.dark : null,
      light: typeof result?.light === 'string' ? result.light : null,
    })
    return siteLogoSrc(url)
  } catch {
    return undefined
  }
}

export function getSiteLogo(): Promise<string | undefined> {
  return fetchSiteLogo(getReadClient({ perspective: 'drafts' }))
}
