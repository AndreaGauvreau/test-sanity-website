import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaBrand } from 'next-sanity'

import { Performance } from '@/components/sections/Performance/Performance'
import { performance } from '@/sanity/seed/sections/performance'

// Aperçu de développement : la section seule, avec les textes du Figma (sans Sanity).
// Absent du build de production.
export const metadata: Metadata = { title: 'Aperçu — Performance', robots: { index: false } }

export default function PerformancePreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Performance data={stegaBrand(performance)} />
}
