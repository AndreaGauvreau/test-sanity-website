import { ThLargeIcon } from '@sanity/icons/ThLarge'
import { defineArrayMember, defineField, defineType } from 'sanity'

// Fonctionnalités (Figma 269:216) : trois cartes, chacune un titre et un texte.
// Les illustrations (encore des emplacements gris dans le Figma) restent dans le code.
export const featuresSection = defineType({
  name: 'featuresSection',
  title: 'Fonctionnalités',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Titre de la section (masqué)',
      type: 'string',
      description:
        'Invisible à l’écran : le design n’affiche pas de titre ici. Il est lu par les lecteurs d’écran et les moteurs de recherche (titre h2 de la section). Modifiable seulement ici, pas depuis l’aperçu (titre invisible).',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'items',
      title: 'Cartes',
      type: 'array',
      description: 'Trois cartes, affichées côte à côte sur ordinateur, dans cet ordre.',
      of: [
        defineArrayMember({
          name: 'feature',
          title: 'Carte',
          type: 'object',
          icon: ThLargeIcon,
          fields: [
            defineField({
              name: 'title',
              title: 'Titre',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'text',
              title: 'Texte',
              type: 'text',
              rows: 4,
              validation: (rule) => rule.required(),
            }),
          ],
          preview: { select: { title: 'title', subtitle: 'text' } },
        }),
      ],
      validation: (rule) => rule.required().length(3),
    }),
  ],
})
