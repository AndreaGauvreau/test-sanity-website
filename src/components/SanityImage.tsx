import { stegaClean } from 'next-sanity'
import { Image } from 'next-sanity/image'
import type { ComponentProps } from 'react'

import { croppedDimensions, urlFor } from '@/sanity/lib/image'

export type SanityImageValue = {
  alt?: string | null
  crop?: { top?: number; bottom?: number; left?: number; right?: number } | null
  hotspot?: { x?: number; y?: number; width?: number; height?: number } | null
  asset?: {
    _id: string
    metadata?: {
      lqip?: string | null
      dimensions?: { width?: number | null; height?: number | null } | null
    } | null
  } | null
}

type Props = {
  image: SanityImageValue
  /** Largeur et hauteur imposées (ex. 1200×630). Sinon, proportions de l'image recadrée. */
  width?: number
  height?: number
  sizes: string
} & Pick<ComponentProps<typeof Image>, 'preload' | 'loading' | 'fetchPriority'>

// Image servie directement par le CDN Sanity (redimensionnement + AVIF/WebP à la
// volée), sans passer par l'optimiseur d'images de Next. Le flou de chargement
// (LQIP) est calculé par Sanity à l'upload.
export function SanityImage({ image, width, height, sizes, ...rest }: Props) {
  if (!image.asset?._id) return null

  const size = width && height ? { width, height } : croppedDimensions(image)
  const src = urlFor({
    asset: image.asset,
    crop: image.crop ?? undefined,
    hotspot: image.hotspot ?? undefined,
  })
    .width(size.width)
    .height(size.height)
    .url()
  const lqip = stegaClean(image.asset.metadata?.lqip)

  return (
    <Image
      src={src}
      width={size.width}
      height={size.height}
      alt={stegaClean(image.alt) ?? ''}
      sizes={sizes}
      placeholder={lqip ? 'blur' : 'empty'}
      blurDataURL={lqip ?? undefined}
      {...rest}
    />
  )
}
