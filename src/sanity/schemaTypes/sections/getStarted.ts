import { defineField, defineType } from 'sanity'

// Appel final (Figma 269:543) : sur-titre, titre en deux tons, texte, deux boutons, posés
// sur la photo du centre de distribution. La photo et son dégradé bleu restent dans le code.
export const getStartedSection = defineType({
  name: 'getStartedSection',
  title: 'Appel final',
  type: 'object',
  fields: [
    defineField({
      name: 'eyebrow',
      title: 'Sur-titre',
      type: 'string',
      description: 'Petit libellé précédé d’une pastille, au-dessus ou à gauche du titre. Ex. « Get started ».',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Titre',
      type: 'string',
      description: 'Début du titre, en blanc. Ex. « Put your dock schedule on rules, ».',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'titleMuted',
      title: 'Suite du titre (atténuée)',
      type: 'string',
      description:
        'Enchaîne sur le titre, dans la même phrase, en blanc à demi transparent. Ex. « not phone calls ». Facultatif.',
    }),
    defineField({
      name: 'text',
      title: 'Texte',
      type: 'text',
      rows: 3,
      description: 'Deux lignes environ sous le titre.',
      validation: (rule) => rule.required(),
    }),
    defineField({ name: 'primaryCta', title: 'Bouton principal', type: 'cta' }),
    defineField({ name: 'secondaryCta', title: 'Bouton secondaire', type: 'cta' }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'eyebrow' },
  },
})
