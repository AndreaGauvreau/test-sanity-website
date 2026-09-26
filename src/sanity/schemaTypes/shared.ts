import { LinkIcon } from '@sanity/icons/Link'
import { defineArrayMember, defineField } from 'sanity'

// Texte alternatif obligatoire dès qu'une image est choisie.
export const altField = defineField({
  name: 'alt',
  title: 'Texte alternatif',
  type: 'string',
  validation: (rule) =>
    rule.custom((alt, context) => {
      const image = context.parent as { asset?: { _ref?: string } } | undefined
      return image?.asset?._ref && !alt ? 'Décris l’image pour les lecteurs d’écran' : true
    }),
})

// Lien dans un texte riche : URL absolue, relative, mailto ou tel.
export const linkAnnotation = defineArrayMember({
  name: 'link',
  title: 'Lien',
  type: 'object',
  icon: LinkIcon,
  fields: [
    defineField({
      name: 'href',
      title: 'URL',
      type: 'url',
      validation: (rule) => rule.uri({ scheme: ['http', 'https', 'mailto', 'tel'], allowRelative: true }),
    }),
  ],
})
