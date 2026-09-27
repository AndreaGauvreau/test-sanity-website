import { BlockquoteIcon } from '@sanity/icons/Blockquote'
import { defineField, defineType } from 'sanity'

import { maxLength, orderRankField } from './shared'

// Témoignage client : la citation sur photo d'entrepôt, sous la section « Customer story ».
export const testimonial = defineType({
  name: 'testimonial',
  title: 'Témoignage',
  type: 'document',
  icon: BlockquoteIcon,
  fields: [
    defineField({
      name: 'quote',
      title: 'Citation',
      type: 'text',
      rows: 4,
      description: 'Sans guillemets : le site les ajoute.',
      validation: (rule) => [rule.required(), maxLength(rule, 320)],
    }),
    defineField({
      name: 'name',
      title: 'Nom',
      type: 'string',
      validation: (rule) => [rule.required(), maxLength(rule, 50)],
    }),
    defineField({
      name: 'role',
      title: 'Fonction',
      type: 'string',
      validation: (rule) => maxLength(rule, 60),
    }),
    defineField({
      name: 'company',
      title: 'Entreprise',
      type: 'string',
      validation: (rule) => [rule.required(), maxLength(rule, 60)],
    }),
    defineField({
      name: 'caseStudyUrl',
      title: 'Lien vers l’étude de cas',
      type: 'url',
      description:
        'Destination par défaut du bouton « Read the case study » (onglet Témoignage de la page, ' +
        'champ Bouton) : la destination saisie dans ce bouton passe avant. Les deux vides : # en attendant le lien.',
      validation: (rule) => rule.uri({ scheme: ['http', 'https'], allowRelative: true }),
    }),
    orderRankField('testimonial'),
  ],
  orderings: [{ title: 'Ordre manuel', name: 'orderRankAsc', by: [{ field: 'orderRank', direction: 'asc' }] }],
  preview: {
    select: { title: 'name', subtitle: 'company' },
  },
})
