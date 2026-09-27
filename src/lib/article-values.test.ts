import { describe, expect, it } from 'vitest'

import { FAQ_TEMPLATE_VARIABLES, TESTIMONIAL_TEMPLATE_VARIABLES } from '@/sanity/schemaTypes/articleSeoTemplate'

import { excerpt, faqTemplateValues, portableTextToPlain, testimonialTemplateValues } from './article-values'

const block = (text: string) => ({ _type: 'block', children: [{ text }] })

describe('valeurs des pages article /testimonials/:slug et /faq/:slug', () => {
  it('les noms des variables sont ceux du schéma (et du manifeste)', () => {
    expect(Object.keys(testimonialTemplateValues({}))).toEqual([...TESTIMONIAL_TEMPLATE_VARIABLES])
    expect(Object.keys(faqTemplateValues({}))).toEqual([...FAQ_TEMPLATE_VARIABLES])
  })

  it('témoignage : champs repris tels quels', () => {
    expect(testimonialTemplateValues({ name: 'Ada', slug: 'ada-acme', company: 'Acme', role: null, quote: 'Great.' })).toEqual({
      name: 'Ada',
      slug: 'ada-acme',
      company: 'Acme',
      role: null,
      quote: 'Great.',
    })
  })

  it('texte brut d’un Portable Text : paragraphes joints, espaces réduits, blocs non texte ignorés', () => {
    expect(portableTextToPlain([block('One  line.'), { _type: 'image' }, block(' Two.\n')])).toBe('One line. Two.')
    expect(portableTextToPlain(null)).toBe('')
  })

  it('{{answer}} : 160 caractères au plus, coupé sur un mot, avec une ellipse ; null si vide', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    const value = faqTemplateValues({ question: 'Q?', slug: 'q', answer: [block(long)] }).answer!
    expect(value.length).toBeLessThanOrEqual(160)
    expect(value.endsWith('…')).toBe(true)
    expect(long.startsWith(value.slice(0, -1))).toBe(true)
    expect(faqTemplateValues({ question: 'Q?', answer: [block('  ')] }).answer).toBeNull()
    expect(excerpt('Short answer.')).toBe('Short answer.')
  })
})
