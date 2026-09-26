import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaBrand } from 'next-sanity'

import { Integrations } from '@/components/sections/Integrations/Integrations'
import { integrations } from '@/sanity/seed/sections/integrations'

// Aperçu de développement : la section seule, avec les textes du Figma (sans Sanity).
// Absent du build de production.
export const metadata: Metadata = { title: 'Aperçu — Intégrations', robots: { index: false } }

export default function IntegrationsPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Integrations data={stegaBrand(integrations)} />
}
