import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaBrand } from 'next-sanity'

import { Features } from '@/components/sections/Features/Features'
import { features } from '@/sanity/seed/sections/features'

// Aperçu de développement : la section seule, avec les textes du Figma (sans Sanity).
// Absent du build de production.
export const metadata: Metadata = { title: 'Aperçu — Fonctionnalités', robots: { index: false } }

export default function FeaturesPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Features data={stegaBrand(features)} />
}
