import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaBrand } from 'next-sanity'

import { Tour } from '@/components/sections/Tour/Tour'
import { tour } from '@/sanity/seed/sections/tour'

// Aperçu de développement : la section seule, avec les textes du Figma (sans Sanity).
// Absent du build de production.
export const metadata: Metadata = { title: 'Aperçu — Visite guidée', robots: { index: false } }

export default function TourPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Tour data={stegaBrand(tour)} />
}
