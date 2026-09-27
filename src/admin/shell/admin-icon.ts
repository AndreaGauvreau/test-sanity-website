/**
 * Icône d'onglet de tout /admin (propriété de shell) : l'icône « admin » du Design System
 * (docs/admin/figma/design-system/icons/admin.svg), copiée telle quelle, servie en URL `data:` par
 * `metadata.icons` de `src/app/admin/layout.tsx`.
 * Pourquoi pas `src/app/admin/icon.svg` : sous /admin le proxy (auth-core) redirige toute requête sans cookie vers A1,
 * donc l'icône serait cassée sur l'écran de connexion. Sans icône déclarée, le navigateur demande /favicon.ico → 404.
 * Le favicon du site public n'est pas touché. Dérive contre le fichier du DS vérifiée par admin-icon.test.ts.
 */
export const ADMIN_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
<path opacity="0.3" d="M11.126 10.7701L17.066 12.94C17.316 13.0301 17.309 13.39 17.055 13.4699L14.336 14.3399L13.466 17.0601C13.385 17.3101 13.028 17.32 12.937 17.07L10.767 11.13C10.685 10.9 10.902 10.69 11.126 10.7701Z" fill="#888888"/>
<path opacity="0.3" d="M1.75 4.75C1.75 3.64543 2.64543 2.75 3.75 2.75H14.25C15.3546 2.75 16.25 3.64543 16.25 4.75V7.75H1.75V4.75Z" fill="#888888"/>
<path d="M4.25 6C4.664 6 5 5.66 5 5.25C5 4.84 4.664 4.5 4.25 4.5C3.836 4.5 3.5 4.84 3.5 5.25C3.5 5.66 3.836 6 4.25 6Z" fill="#888888"/>
<path d="M6.75 6C7.164 6 7.5 5.66 7.5 5.25C7.5 4.84 7.164 4.5 6.75 4.5C6.336 4.5 6 4.84 6 5.25C6 5.66 6.336 6 6.75 6Z" fill="#888888"/>
<path d="M1.75 7.75H16.25" stroke="#888888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M16.25 9.44788V4.75C16.25 3.65 15.355 2.75 14.25 2.75H3.75C2.645 2.75 1.75 3.65 1.75 4.75V13.25C1.75 14.35 2.645 15.25 3.75 15.25H9.0779" stroke="#888888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M11.126 10.7701L17.066 12.94C17.316 13.0301 17.309 13.39 17.055 13.4699L14.336 14.3399L13.466 17.0601C13.385 17.3101 13.028 17.32 12.937 17.07L10.767 11.13C10.685 10.9 10.902 10.69 11.126 10.7701Z" stroke="#888888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`

/** URL `data:` de l'icône (aucune requête réseau, donc ni proxy ni 404). */
export const ADMIN_ICON_URL = `data:image/svg+xml,${encodeURIComponent(ADMIN_ICON_SVG)}`
