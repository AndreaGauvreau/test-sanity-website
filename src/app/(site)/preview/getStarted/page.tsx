import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaBrand } from 'next-sanity'

import { GetStarted } from '@/components/sections/GetStarted/GetStarted'
import { getStarted } from '@/sanity/seed/sections/getStarted'

// Aperçu de développement : la section seule, avec les textes du Figma (sans Sanity).
// Absent du build de production.
export const metadata: Metadata = { title: 'Aperçu — Appel final', robots: { index: false } }

export default function GetStartedPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <GetStarted data={stegaBrand(getStarted)} />
}
