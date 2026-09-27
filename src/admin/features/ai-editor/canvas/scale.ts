import { EDITOR_VIEWPORTS, VIEWPORT_NAMES, type Viewport, type ViewportName } from '@/admin/core/contracts/engine'

/**
 * Mise à l'échelle de l'aperçu (D1 « Aperçu … avec 20 px de marge ; Desktop / Tablet / Mobile »). Largeurs des formats :
 * contrat `EDITOR_VIEWPORTS` (1280 / 810 / 375 ; Tablet = point de rupture tablette du site, pas le 768 du Figma : voir
 * CLAUDE.md, « Décisions »). L'iframe garde la largeur CSS du format choisi (le site voit 1280, 810 ou 375 px et
 * applique ses points de rupture) ; si elle ne tient pas dans la place disponible, elle est réduite (jamais agrandie)
 * et centrée. La hauteur de l'iframe est allongée d'autant pour remplir toute la hauteur visible une fois réduite.
 */

export const PREVIEW_MARGIN = 20

export type FrameLayout = {
  /** Facteur appliqué à l'iframe (0 < scale ≤ 1). */
  scale: number
  /** Taille du cadre à l'écran (px de l'admin). */
  width: number
  height: number
  /** Taille CSS de l'iframe avant réduction (px du site). */
  iframeWidth: number
  iframeHeight: number
}

export function computeFrame(available: { width: number; height: number }, viewport: Viewport): FrameLayout {
  const width = Math.max(0, Number.isFinite(available.width) ? available.width : 0)
  const height = Math.max(0, Number.isFinite(available.height) ? available.height : 0)
  // Place nulle (premier rendu, onglet caché) : échelle 1, rien à réduire.
  const scale = width > 0 ? Math.min(1, width / viewport) : 1
  return {
    scale,
    width: viewport * scale,
    height,
    iframeWidth: viewport,
    iframeHeight: scale > 0 ? height / scale : height,
  }
}

/** Libellé et icône de chaque format (Figma Editor toolbar : écran, tablette, mobile). */
const TOOLBAR_ITEMS: Readonly<Record<ViewportName, { label: string; icon: 'desktop' | 'tablet' | 'mobile' }>> = {
  desktop: { label: 'Desktop', icon: 'desktop' },
  tablet: { label: 'Tablet', icon: 'tablet' },
  mobile: { label: 'Mobile', icon: 'mobile' },
}

/** Formats de la barre d'outils, dans l'ordre et aux largeurs du contrat (`VIEWPORT_NAMES`, `EDITOR_VIEWPORTS`). */
export const VIEWPORTS: readonly { value: Viewport; label: string; icon: 'desktop' | 'tablet' | 'mobile' }[] = VIEWPORT_NAMES.map(
  (name) => ({ value: EDITOR_VIEWPORTS[name], ...TOOLBAR_ITEMS[name] }),
)

/** Retrait minimal des barres flottantes (barre de validation) par rapport aux bords du cadre d'aperçu. */
export const FLOATING_INSET = 12

/**
 * Largeur maximale d'une barre flottante posée sur l'aperçu (QA-5) : celle du cadre moins `FLOATING_INSET` de chaque
 * côté. En Mobile (cadre de 375 px), la barre « to validate » du Figma (388 px) passe sur deux lignes au lieu de déborder.
 */
export function floatingMaxWidth(frameWidth: number): number {
  return Number.isFinite(frameWidth) ? Math.max(0, frameWidth - 2 * FLOATING_INSET) : 0
}
