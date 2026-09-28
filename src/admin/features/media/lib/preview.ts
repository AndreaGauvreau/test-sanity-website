import { formatBytes } from '@/admin/ui/ImageUpload/format'

import type { MediaAsset } from './assets'
import type { Box, Size } from './usage-preview'

/**
 * Aperçu de la fiche à droite et grand aperçu (C5). PUR.
 * - Fiche : l'aperçu garde le ratio de l'asset (CSS `aspect-ratio`, hauteur plafonnée dans le module CSS).
 * - Grand aperçu (Modal du kit) : l'image dans son ratio, au plus ~90vw × 85vh, sans déborder de la fenêtre.
 */

/** Ratio CSS de l'aperçu (« 2400 / 1600 ») ; null sans dimensions (vidéo, PDF, asset sans métadonnées). */
export function previewRatio(asset: Pick<MediaAsset, 'width' | 'height'>): string | null {
  const { width, height } = asset
  return width && height && width > 0 && height > 0 ? `${width} / ${height}` : null
}

/** Mise en page du grand aperçu (px CSS) : Modal du kit (calque 32 / 16, corps 20, en-tête, légende). */
export const LIGHTBOX = {
  /** Part de la fenêtre du navigateur que l'image peut occuper. */
  viewportWidth: 0.9,
  viewportHeight: 0.85,
  /** Marges du calque de la Modal (32 en haut et en bas, 16 à gauche et à droite). */
  layer: { width: 32, height: 64 },
  /** Autour de l'image dans la fenêtre : corps (20 + 20) et bordures ; en-tête, légende et marges verticales. */
  chrome: { width: 42, height: 112 },
  /** Image plus petite (favicon 64 × 64…) : agrandie jusqu'à ce côté pour être vue « en grand ». */
  minLongSide: 320,
  /** Fenêtre au moins aussi large (titre et ✕ lisibles pour une image étroite). */
  minModalWidth: 360,
  /** Vidéo (dimensions inconnues avant lecture) : largeur du lecteur, au plus. */
  videoWidth: 960,
} as const

/** Place maximale de l'image dans la fenêtre du navigateur. */
export function lightboxBounds(viewport: Size): Size {
  return {
    width: Math.max(1, Math.floor(Math.min(viewport.width * LIGHTBOX.viewportWidth, viewport.width - LIGHTBOX.layer.width - LIGHTBOX.chrome.width))),
    height: Math.max(1, Math.floor(Math.min(viewport.height * LIGHTBOX.viewportHeight, viewport.height - LIGHTBOX.layer.height - LIGHTBOX.chrome.height))),
  }
}

/**
 * Taille affichée d'une image dans le grand aperçu : son ratio, sa taille réelle (jamais agrandie au-delà, sauf une
 * petite image portée à `minLongSide`), réduite pour tenir dans `lightboxBounds`.
 */
export function lightboxImageSize(natural: Size | null | undefined, viewport: Size): Size {
  const bounds = lightboxBounds(viewport)
  const base = natural && natural.width > 0 && natural.height > 0 ? natural : { width: bounds.width, height: (bounds.width * 9) / 16 }
  const long = Math.max(base.width, base.height)
  const grow = long < LIGHTBOX.minLongSide ? LIGHTBOX.minLongSide / long : 1
  const shrink = Math.min(1, bounds.width / (base.width * grow), bounds.height / (base.height * grow))
  const scale = grow * shrink
  return { width: Math.max(1, Math.round(base.width * scale)), height: Math.max(1, Math.round(base.height * scale)) }
}

/** Largeur du lecteur vidéo (la hauteur suit la vidéo, plafonnée en CSS). */
export function lightboxVideoWidth(viewport: Size): number {
  return Math.min(LIGHTBOX.videoWidth, lightboxBounds(viewport).width)
}

/** Largeur de la fenêtre modale pour un contenu large de `contentWidth`. */
export function lightboxModalWidth(contentWidth: number): number {
  return Math.max(LIGHTBOX.minModalWidth, contentWidth + LIGHTBOX.chrome.width)
}

/**
 * `transform-origin` de la fenêtre : le centre de la miniature cliquée, dans le repère de la fenêtre (position de mise
 * en page, hors transformation). L'échelle d'entrée de la Modal part ainsi de la miniature.
 */
export function originFrom(trigger: Box, dialog: { x: number; y: number }): string {
  return `${Math.round(trigger.x + trigger.width / 2 - dialog.x)}px ${Math.round(trigger.y + trigger.height / 2 - dialog.y)}px`
}

/** Légende du grand aperçu : « 2400 × 1600 · JPG · 1.2 MB » (vidéo : « MP4 · 14.3 MB »). */
export function lightboxCaption(asset: Pick<MediaAsset, 'width' | 'height' | 'extension' | 'size'>): string {
  const parts: string[] = []
  if (asset.width && asset.height) parts.push(`${asset.width} × ${asset.height}`)
  if (asset.extension) parts.push(asset.extension.toUpperCase())
  if (asset.size) parts.push(formatBytes(asset.size))
  return parts.join(' · ')
}
