import { LinkIcon } from '@sanity/icons/Link'
import { defineField, defineType } from 'sanity'

// Bouton ou lien d'action (calques « cta » du Figma) : un libellé, une destination.
// Sans destination, le site pointe vers `#` en attendant l'URL.
export const cta = defineType({
  name: 'cta',
  title: 'Bouton',
  type: 'object',
  icon: LinkIcon,
  fields: [
    defineField({
      name: 'label',
      title: 'Libellé',
      type: 'string',
      description: 'En casse normale : les capitales viennent du style.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'href',
      title: 'Destination',
      type: 'url',
      description: 'URL complète, ou chemin du site (/blog). Vide : lien inactif (#).',
      validation: (rule) => rule.uri({ scheme: ['http', 'https', 'mailto', 'tel'], allowRelative: true }),
    }),
  ],
  preview: {
    select: { title: 'label', subtitle: 'href' },
  },
})
