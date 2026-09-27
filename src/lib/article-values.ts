import type { TemplateValues } from './template-variables'

/**
 * Valeurs des {{variables}} des pages article /testimonials/:slug et /faq/:slug (modèle SEO C6, scripts G6).
 * Pur : aucun import hors types, valeurs déjà nettoyées du stega par l'appelant. Mêmes noms que
 * TESTIMONIAL_TEMPLATE_VARIABLES et FAQ_TEMPLATE_VARIABLES (src/sanity/schemaTypes/articleSeoTemplate.ts) et que
 * `articleSeoTemplates` de src/admin.config.ts. L'aperçu C6 de l'admin peut les reprendre telles quelles.
 */

/** Longueur maximale de {{answer}} : celle d'une meta description. */
export const ANSWER_EXCERPT_MAX = 160

type Block = { _type?: string; children?: readonly { text?: string | null }[] | null }

/** Texte brut d'un Portable Text : paragraphes séparés par un espace, espaces successifs réduits à un seul. */
export function portableTextToPlain(blocks: readonly Block[] | null | undefined): string {
  return (blocks ?? [])
    .filter((block) => block._type === 'block' || block._type === undefined)
    .map((block) => (block.children ?? []).map((child) => child.text ?? '').join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Coupe un texte à `max` caractères au plus, sur une fin de mot, avec « … » s'il a été coupé. */
export function excerpt(text: string, max = ANSWER_EXCERPT_MAX): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`
}

/** {{name}}, {{slug}}, {{company}}, {{role}}, {{quote}} d'un témoignage. */
export function testimonialTemplateValues(testimonial: {
  name?: string | null
  slug?: string | null
  company?: string | null
  role?: string | null
  quote?: string | null
}): TemplateValues {
  return {
    name: testimonial.name,
    slug: testimonial.slug,
    company: testimonial.company,
    role: testimonial.role,
    quote: testimonial.quote,
  }
}

/** {{question}}, {{slug}}, {{answer}} (texte brut, 160 caractères au plus) d'une question de la FAQ. */
export function faqTemplateValues(faq: {
  question?: string | null
  slug?: string | null
  answer?: readonly Block[] | null
}): TemplateValues {
  const answer = portableTextToPlain(faq.answer)
  return {
    question: faq.question,
    slug: faq.slug,
    answer: answer ? excerpt(answer) : null,
  }
}
