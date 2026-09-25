import { createImageUrlBuilder, type SanityImageSource } from '@sanity/image-url'

import { dataset, projectId } from '../env'

const builder = createImageUrlBuilder({ projectId, dataset })

// Construit une URL du CDN d'images Sanity. Le recadrage et le point focal
// (hotspot) choisis dans l'admin sont appliqués automatiquement.
export const urlFor = (source: SanityImageSource) => builder.image(source)

type CroppableImage = {
  crop?: { top?: number; bottom?: number; left?: number; right?: number } | null
  asset?: {
    metadata?: { dimensions?: { width?: number | null; height?: number | null } | null } | null
  } | null
}

// Dimensions de l'image une fois le recadrage de l'éditeur appliqué,
// pour réserver la bonne place avant le chargement (pas de saut de mise en page).
export function croppedDimensions(image: CroppableImage) {
  const width = image.asset?.metadata?.dimensions?.width ?? 1200
  const height = image.asset?.metadata?.dimensions?.height ?? 800
  const crop = image.crop

  return {
    width: Math.round(width * (1 - (crop?.left ?? 0) - (crop?.right ?? 0))),
    height: Math.round(height * (1 - (crop?.top ?? 0) - (crop?.bottom ?? 0))),
  }
}
