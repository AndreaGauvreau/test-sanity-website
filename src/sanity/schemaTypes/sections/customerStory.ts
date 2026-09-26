import { CheckmarkIcon } from '@sanity/icons/Checkmark'
import { TrendUpwardIcon } from '@sanity/icons/TrendUpward'
import { defineArrayMember, defineField, defineType } from 'sanity'

// Étude de cas (Figma 269:305) : sur-titre, titre, lien vers l'étude, résumé, chiffres clés
// et liste des résultats. L'illustration (encore un emplacement vide dans le Figma) reste
// dans le code.
export const customerStorySection = defineType({
  name: 'customerStorySection',
  title: 'Étude de cas',
  type: 'object',
  fields: [
    defineField({
      name: 'eyebrow',
      title: 'Sur-titre',
      type: 'string',
      description: 'Le petit libellé orange au-dessus du titre. Ex. « Customer story ».',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Titre',
      type: 'string',
      description: 'Titre de la section (h2). Le retour à la ligne est automatique.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'cta',
      title: 'Lien vers l’étude de cas',
      type: 'cta',
      description: 'Lien souligné sous le titre. Ex. « Read the case study ».',
    }),
    defineField({
      name: 'summary',
      title: 'Résumé',
      type: 'text',
      rows: 3,
      description: 'Deux ou trois lignes, affichées au-dessus de la liste des résultats.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'stats',
      title: 'Chiffres clés',
      type: 'array',
      description:
        'Un ou deux chiffres, côte à côte, dans cet ordre (deux dans la maquette). Au-delà, ils ne tiennent plus sur mobile.',
      of: [
        defineArrayMember({
          name: 'stat',
          title: 'Chiffre',
          type: 'object',
          icon: TrendUpwardIcon,
          fields: [
            defineField({
              name: 'value',
              title: 'Valeur',
              type: 'string',
              description: 'Le grand chiffre orange. Ex. « 80% ».',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'label',
              title: 'Légende',
              type: 'string',
              description: 'Ce que mesure le chiffre. Ex. « Fewer scheduling emails ».',
              validation: (rule) => rule.required(),
            }),
          ],
          preview: { select: { title: 'value', subtitle: 'label' } },
        }),
      ],
      validation: (rule) => rule.required().min(1).max(2),
    }),
    defineField({
      name: 'results',
      title: 'Résultats',
      type: 'array',
      description: 'Liste courte, une ligne par résultat, marquée d’un trait orange.',
      of: [
        defineArrayMember({
          name: 'result',
          title: 'Résultat',
          type: 'object',
          icon: CheckmarkIcon,
          fields: [
            defineField({
              name: 'label',
              title: 'Texte',
              type: 'string',
              description: 'Ex. « Automated scheduling with custom rules ».',
              validation: (rule) => rule.required(),
            }),
          ],
          preview: { select: { title: 'label' } },
        }),
      ],
      validation: (rule) => rule.required().min(1).max(5),
    }),
  ],
})
