import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaBrand } from 'next-sanity'

import { Testimonial } from '@/components/sections/Testimonial/Testimonial'
import { testimonialDoc } from '@/sanity/seed/collections'
import { testimonial } from '@/sanity/seed/sections/testimonial'

// Aperçu de développement : la section seule, avec les textes du Figma (sans Sanity).
// Le témoignage prend la forme que lui donne la requête de la page (item déréférencé).
// Absent du build de production.
export const metadata: Metadata = { title: 'Aperçu — Témoignage', robots: { index: false } }

export default function TestimonialPreview() {
  if (process.env.NODE_ENV === 'production') notFound()

  const { _id, quote, name, role, company } = testimonialDoc
  return (
    <Testimonial
      data={stegaBrand({ ...testimonial, item: { _id, quote, name, role, company, caseStudyUrl: null } })}
    />
  )
}
