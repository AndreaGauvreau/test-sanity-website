import { defineField, defineType } from 'sanity'

// Articles (Figma 269:511) : sur-titre et titre « Learn and grow ». Les cartes ne sont pas
// ici : ce sont les quatre articles les plus récents de la collection « Blog ».
export const insightsSection = defineType({
  name: 'insightsSection',
  title: 'Articles',
  type: 'object',
  description: 'Les cartes affichent automatiquement les quatre derniers articles publiés du Blog.',
  fields: [
    defineField({
      name: 'eyebrow',
      title: 'Sur-titre',
      type: 'string',
      description: 'Petit libellé orange au-dessus du titre.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Titre',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'eyebrow' },
  },
})
