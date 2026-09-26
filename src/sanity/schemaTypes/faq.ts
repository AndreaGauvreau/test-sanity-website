import { HelpCircleIcon } from '@sanity/icons/HelpCircle'
import { defineArrayMember, defineField, defineType } from 'sanity'

import { linkAnnotation } from './shared'

// Une question de la FAQ. L'ordre d'affichage est un champ : la première question
// s'affiche ouverte sur le site.
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
    defineField({
      name: 'order',
      title: 'Ordre d’affichage',
      type: 'number',
      description: '1 en premier.',
      validation: (rule) => rule.required().integer().min(1),
    }),
  ],
  orderings: [{ title: 'Ordre d’affichage', name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] }],
  preview: {
    select: { title: 'question', order: 'order' },
    prepare: ({ title, order }) => ({ title, subtitle: order ? `n° ${order}` : undefined }),
  },
})
