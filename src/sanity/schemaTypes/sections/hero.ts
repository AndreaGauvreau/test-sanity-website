import { StarIcon } from '@sanity/icons/Star'
import { defineArrayMember, defineField, defineType } from 'sanity'

// Plateformes d'avis dont le site connaît le logo.
const platforms = [
  { title: 'G2', value: 'g2' },
  { title: 'Capterra', value: 'capterra' },
]

// Hero (Figma 269:177) : titre, chapô, deux boutons, notes G2 / Capterra.
// Le visuel (fenêtre de navigateur) reste dans le code.
export const heroSection = defineType({
  name: 'heroSection',
  title: 'Hero',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Titre',
      type: 'string',
      description: 'Le titre principal de la page (h1).',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'lede',
      title: 'Chapô',
      type: 'text',
      rows: 4,
      validation: (rule) => rule.required(),
    }),
    defineField({ name: 'primaryCta', title: 'Bouton principal', type: 'cta' }),
    defineField({ name: 'secondaryCta', title: 'Bouton secondaire', type: 'cta' }),
    defineField({
      name: 'ratings',
      title: 'Notes',
      type: 'array',
      of: [
        defineArrayMember({
          name: 'rating',
          title: 'Note',
          type: 'object',
          icon: StarIcon,
          fields: [
            defineField({
              name: 'platform',
              title: 'Plateforme',
              type: 'string',
              description: 'Choisit le logo affiché devant le texte.',
              options: { list: platforms, layout: 'radio', direction: 'horizontal' },
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'label',
              title: 'Texte',
              type: 'string',
              description: 'Ex. « 4.7 stars on G2 ».',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'href',
              title: 'Page d’avis',
              type: 'url',
              validation: (rule) => rule.uri({ scheme: ['http', 'https'] }),
            }),
          ],
          preview: { select: { title: 'label', subtitle: 'platform' } },
        }),
      ],
      validation: (rule) => rule.max(2),
    }),
  ],
})
