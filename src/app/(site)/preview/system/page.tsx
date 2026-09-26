import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaBrand } from 'next-sanity'

import { ConduitSystem } from '@/components/sections/ConduitSystem/ConduitSystem'
import { system } from '@/sanity/seed/sections/system'

// Aperçu de développement : la section seule, avec les textes du Figma (sans Sanity).
// Absent du build de production.
export const metadata: Metadata = { title: 'Aperçu — Conduit System', robots: { index: false } }

export default function SystemPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <ConduitSystem data={stegaBrand(system)} />
}
