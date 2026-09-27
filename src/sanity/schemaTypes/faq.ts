import { HelpCircleIcon } from '@sanity/icons/HelpCircle'
import { defineArrayMember, defineField, defineType } from 'sanity'

import { linkAnnotation, maxLength, orderRankField } from './shared'

// Une question de la FAQ. Ordre d'affichage : ordre manuel (orderRank, glissé dans l'admin) ; la
// première question s'affiche ouverte sur le site. Liste sur /faq, page à elle sur /faq/:slug.
// L'ancien champ `order` (entier) n'est plus au schéma : la migration a converti son ordre en
// orderRank, et la requête du site s'en sert encore en repli pour un dataset pas encore migré
// (voir src/sanity/CLAUDE.md).
export const faq = defineType({
  name: 'faq',
  title: 'Question',
  type: 'document',
  icon: HelpCircleIcon,
  fields: [
    defineField({
      name: 'question',
      title: 'Question',
      type: 'string',
      validation: (rule) => [rule.required(), maxLength(rule, 100)],
    }),
    // Page de la question (/faq/:slug), générée depuis la question. La migration en a donné un aux
    // questions existantes.
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Adresse de la page de la question (/faq/…). La changer change l’URL publique.',
      options: { source: 'question', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'answer',
      title: 'Réponse',
      type: 'array',
      validation: (rule) => rule.required(),
      of: [
        defineArrayMember({
          type: 'block',
          styles: [{ title: 'Paragraphe', value: 'normal' }],
          lists: [],
          marks: {
            decorators: [
              { title: 'Gras', value: 'strong' },
              { title: 'Italique', value: 'em' },
            ],
            annotations: [linkAnnotation],
          },
        }),
      ],
    }),
    orderRankField('faq'),
  ],
  orderings: [{ title: 'Ordre manuel', name: 'orderRankAsc', by: [{ field: 'orderRank', direction: 'asc' }] }],
  preview: {
    select: { title: 'question' },
  },
})
