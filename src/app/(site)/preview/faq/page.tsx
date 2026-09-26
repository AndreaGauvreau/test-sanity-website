import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stegaBrand } from 'next-sanity'

import { Faq } from '@/components/sections/Faq/Faq'
import { faqQuestions, firstFaqAnswer } from '@/sanity/seed/collections'
import { faq } from '@/sanity/seed/sections/faq'
import type { FAQS_QUERY_RESULT } from '@/sanity/types'

// Aperçu de développement : la section seule, avec les textes du Figma (sans Sanity).
// Seule la première question a sa réponse dans le Figma ; les autres, sans réponse,
// s'affichent quand même (fermées, sans panneau de réponse). Absent du build de production.
export const metadata: Metadata = { title: 'Aperçu — FAQ', robots: { index: false } }

const items = faqQuestions.map((question, index) => ({
  _id: `faq-${index + 1}`,
  question,
  answer: index === 0 ? firstFaqAnswer : [],
})) satisfies FAQS_QUERY_RESULT

export default function FaqPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Faq data={stegaBrand(faq)} items={stegaBrand(items)} />
}
