/**
 * Logo du site en haut de la sidebar (Figma « Sidebar » : cadre `logo` 28 × 28, icône globe par défaut) = le FAVICON du
 * site (siteSettings, B2 · General). Fonctions pures, serveur et navigateur (pas de 'use client' : la coque serveur les
 * appelle aussi).
 *
 * Contrat de l'orchestrateur, partagé par shell/ (lecture serveur, affichage) et features/general (mise à jour sans
 * rechargement, voir `site-logo.ts`).
 */

/** Côté en pixels de l'image demandée au CDN : 28 px affichés, écran 2×. */
export const SITE_LOGO_PX = 56

/**
 * Favicon à montrer dans l'admin, qui est sombre : le favicon « dark » (prévu pour les fonds sombres) s'il existe,
 * sinon le « light » (celui du site partout quand il n'y a pas de dark, comme le dit B2).
 */
export function pickSiteFavicon(favicons: { dark?: string | null; light?: string | null }): string | null {
  return favicons.dark || favicons.light || null
}

/**
 * URL du CDN Sanity du favicon → adresse du logo (56 × 56, format automatique). Refuse toute autre adresse (le logo
 * ne vient que de siteSettings) : undefined → icône globe. Un SVG est laissé tel quel (le CDN ne le redimensionne pas).
 */
export function siteLogoSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'cdn.sanity.io' || !parsed.pathname.startsWith('/images/')) return undefined
  parsed.search = ''
  parsed.hash = ''
  if (!/\.svg$/i.test(parsed.pathname)) {
    parsed.searchParams.set('w', String(SITE_LOGO_PX))
    parsed.searchParams.set('h', String(SITE_LOGO_PX))
    parsed.searchParams.set('fit', 'max')
    parsed.searchParams.set('auto', 'format')
  }
  return parsed.toString()
}
