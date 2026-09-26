import { TrendUpwardIcon } from '@sanity/icons/TrendUpward'
import { defineArrayMember, defineField, defineType } from 'sanity'

// Pictogrammes dont le site a le dessin : l'atout garde le sien quand on réordonne la liste.
const icons = [
  { title: 'Camembert (répartition)', value: 'chartPieSlice' },
  { title: 'Compteur (performance)', value: 'speedometer' },
  { title: 'Calendrier (rendez-vous)', value: 'calendarDots' },
]

// Performance (Figma 269:272) : sur-titre, titre, trois atouts sur la photo d'entrepôt.
// La photo et les flèches restent dans le code.
export const performanceSection = defineType({
  name: 'performanceSection',
  title: 'Performance',
  type: 'object',
  fields: [
    defineField({
      name: 'eyebrow',
      title: 'Sur-titre',
      type: 'string',
      description: 'Petit libellé blanc précédé d’une pastille, au-dessus du titre. Ex. « Performance ».',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Titre',
      type: 'string',
      description: 'Titre de la section (h2), sur une ligne sur grand écran.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'benefits',
      title: 'Atouts',
      type: 'array',
      description: 'Les trois colonnes en bas de la photo, de gauche à droite.',
      of: [
        defineArrayMember({
          name: 'benefit',
          title: 'Atout',
          type: 'object',
          icon: TrendUpwardIcon,
          fields: [
            defineField({
              name: 'icon',
              title: 'Pictogramme',
              type: 'string',
              description: 'Le petit dessin bleu au-dessus du titre.',
              options: { list: icons, layout: 'radio' },
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'title',
              title: 'Titre',
              type: 'text',
              rows: 2,
              description:
                'Deux lignes courtes : passer à la ligne (Entrée) là où le titre doit se couper, comme dans la maquette.',
              // Chaque retour à la ligne s'affiche tel quel : avertir au-delà de deux lignes.
              validation: (rule) => [
                rule.required(),
                rule
                  .custom<string>(
                    (value) =>
                      !value ||
                      value.trim().split('\n').length <= 2 ||
                      'Deux lignes au plus : chaque retour à la ligne s’affiche sur le site.',
                  )
                  .warning(),
              ],
            }),
            defineField({
              name: 'text',
              title: 'Texte',
              type: 'text',
              rows: 3,
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
