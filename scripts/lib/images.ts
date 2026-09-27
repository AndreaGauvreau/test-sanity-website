import path from 'node:path'

import sharp from 'sharp'

/**
 * Images de démonstration tirées des photos déjà présentes dans le site (src/components/sections) :
 * même provenance que le site (maquette Figma du client). Réservées au dataset de développement ;
 * licence à confirmer avant tout usage hors démo (voir src/sanity/CLAUDE.md).
 */

const root = path.resolve(import.meta.dirname, '../..')
const photo = (file: string) => path.join(root, 'src/components/sections', file)

export const PHOTOS = {
  night: photo('GetStarted/distribution-center-night.jpg'), // 1672 × 941
  worker: photo('Performance/warehouse.jpg'), // 1440 × 809
  aisle: photo('Testimonial/warehouse.jpg'), // 1952 × 806
} as const

/** Image de partage du site (1200 × 630) : la photo de l'appel final, recadrée. */
export async function socialImageBuffer(): Promise<Buffer> {
  return sharp(PHOTOS.night).resize(1200, 630, { fit: 'cover', position: 'centre' }).jpeg({ quality: 82 }).toBuffer()
}

export type CoverSpec = {
  photo: keyof typeof PHOTOS
  /** Zone gardée (pixels de la photo d'origine) ; absente : toute la photo. */
  crop?: { left: number; top: number; width: number; height: number }
  flop?: boolean
  grayscale?: boolean
  /** Teinte (multiplication) : ex. bleu Conduit. */
  tint?: { r: number; g: number; b: number }
}

/** Couverture d'article (JPEG), 1600 px de large au plus. */
export async function coverBuffer(spec: CoverSpec): Promise<Buffer> {
  let image = sharp(PHOTOS[spec.photo])
  if (spec.crop) image = image.extract(spec.crop)
  if (spec.flop) image = image.flop()
  if (spec.grayscale) image = image.grayscale()
  if (spec.tint) image = image.tint(spec.tint)
  return image.resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
}
