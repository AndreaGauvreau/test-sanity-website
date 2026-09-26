import { defineField, defineType } from 'sanity'

// FAQ (Figma 269:456) : sur-titre, titre, carte d'aide bleue. Les questions et leurs
// réponses ne sont pas ici : elles viennent de la collection « FAQ », dans l'ordre choisi.
export const faqSection = defineType({
  name: 'faqSection',
  title: 'FAQ',
  type: 'object',
  fieldsets: [
    {
      name: 'support',
      title: 'Carte d’aide',
      description: 'Le pavé bleu sous le titre, avec son bouton.',
    },
  ],
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
    defineField({
      name: 'supportText',
      title: 'Texte',
      type: 'text',
      rows: 2,
      fieldset: 'support',
      description:
        'Le retour à la ligne est respecté quand la carte est assez large (grand écran) ; sur petit écran, le texte se répartit automatiquement.',
      validation: (rule) => rule.required(),
    }),
    defineField({ name: 'supportCta', title: 'Bouton', type: 'cta', fieldset: 'support' }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'eyebrow' },
  },
})
