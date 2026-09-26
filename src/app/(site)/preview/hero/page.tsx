import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaBrand } from 'next-sanity'

import { Hero } from '@/components/sections/Hero/Hero'
import { hero } from '@/sanity/seed/sections/hero'

// Aperçu de développement : la section seule, avec les textes du Figma (sans Sanity).
// Absent du build de production.
export const metadata: Metadata = { title: 'Aperçu — Hero', robots: { index: false } }

export default function HeroPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Hero data={stegaBrand(hero)} />
}
