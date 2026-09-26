import { CubeIcon } from '@sanity/icons/Cube'
import { defineArrayMember, defineField, defineType } from 'sanity'

// Conduit System (Figma 269:232) : sur-titre, titre, chapô, bouton, puis trois modules
// (titre, texte, lien « See more »). Le grand visuel reste dans le code.
export const systemSection = defineType({
  name: 'systemSection',
  title: 'Conduit System',
  type: 'object',
  fields: [
    defineField({
      name: 'eyebrow',
      title: 'Sur-titre',
      type: 'string',
      description: 'Le petit libellé orange devant le titre. Ex. « Conduit System ».',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Titre',
      type: 'string',
      description: 'Le titre de la section (h2).',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'lede',
      title: 'Chapô',
      type: 'text',
      rows: 3,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'cta',
      title: 'Bouton',
      type: 'cta',
      description: 'Aligné à droite du chapô sur ordinateur.',
    }),
    defineField({
      name: 'modules',
      title: 'Modules',
      type: 'array',
      description: 'Les trois colonnes sous le visuel, dans l’ordre de lecture.',
      of: [
        defineArrayMember({
          name: 'module',
          title: 'Module',
          type: 'object',
          icon: CubeIcon,
          fields: [
            defineField({
              name: 'title',
              title: 'Titre',
              type: 'string',
              description: 'Ex. « Driver Check-in ».',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'text',
              title: 'Texte',
              type: 'text',
              rows: 3,
              description: 'Une ou deux phrases courtes.',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'link',
              title: 'Lien',
              type: 'cta',
              description: 'Le lien orange sous le texte. Ex. « See more ».',
            }),
          ],
          preview: { select: { title: 'title', subtitle: 'text' } },
        }),
      ],
      // required() : sans lui, une liste vidée passerait la validation (length ne s'applique
      // qu'à une valeur présente).
      validation: (rule) => rule.required().length(3).error('Trois modules : un par colonne.'),
    }),
  ],
})
