import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaBrand } from 'next-sanity'

import { CustomerStory } from '@/components/sections/CustomerStory/CustomerStory'
import { customerStory } from '@/sanity/seed/sections/customerStory'

// Aperçu de développement : la section seule, avec les textes du Figma (sans Sanity).
// Absent du build de production.
export const metadata: Metadata = { title: 'Aperçu — Étude de cas', robots: { index: false } }

export default function CustomerStoryPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <CustomerStory data={stegaBrand(customerStory)} />
}
