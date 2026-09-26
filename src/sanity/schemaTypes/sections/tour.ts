import { defineField, defineType } from 'sanity'

// Visite guidée (Figma 269:420) : carte bleue avec titre, phrase d'accroche et bouton.
// Le graphisme de lignes blanches, à droite, est décoratif : il reste dans le code.
export const tourSection = defineType({
  name: 'tourSection',
  title: 'Visite guidée',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Titre',
      type: 'string',
      description: 'Une ligne courte. Ex. « Tour Dock Scheduling ».',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'lede',
      title: 'Texte',
      type: 'text',
      rows: 2,
      description: 'Une phrase sous le titre, qui dit ce que la visite montre.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'cta',
      title: 'Bouton',
      type: 'cta',
      description: 'Mène à la visite en libre-service. Ex. « Take a tour ».',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'cta.label' },
  },
})
