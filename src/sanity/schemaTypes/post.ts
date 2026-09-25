import { DocumentTextIcon } from '@sanity/icons/DocumentText'
import { ImageIcon } from '@sanity/icons/Image'
import { LinkIcon } from '@sanity/icons/Link'
import { defineArrayMember, defineField, defineType } from 'sanity'

// Texte alternatif obligatoire dès qu'une image est choisie.
const altField = defineField({
  name: 'alt',
  title: 'Texte alternatif',
  type: 'string',
  validation: (rule) =>
    rule.custom((alt, context) => {
      const image = context.parent as { asset?: { _ref?: string } } | undefined
      return image?.asset?._ref && !alt ? 'Décris l’image pour les lecteurs d’écran' : true
    }),
})

// Même champs que la collection `posts` du test Payload. L'équivalent de la
// collection `media` est intégré : chaque image est un asset du CDN Sanity,
// réutilisable d'un article à l'autre (onglet « Médias » de l'admin).
export const post = defineType({
  name: 'post',
  title: 'Article',
  type: 'document',
  icon: DocumentTextIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Titre',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'subtitle',
      title: 'Sous-titre',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    // Payload trie sur createdAt. Ici une vraie date éditoriale, modifiable (antidater,
    // réordonner), sert au tri du blog. Ce n'est pas une programmation : un article publié
    // avec une date future s'affiche tout de suite.
    defineField({
      name: 'publishedAt',
      title: 'Date de publication',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      description: 'Le site l’affiche en 1200×630 : le point focal (hotspot) décide de la partie gardée.',
      options: { hotspot: true },
      fields: [altField],
      // assetRequired : sans lui, un objet image vide (juste un alt) passe la validation.
      validation: (rule) => rule.required().assetRequired(),
    }),
    defineField({
      name: 'content',
      title: 'Contenu',
      type: 'array',
      validation: (rule) => rule.required(),
      of: [
        defineArrayMember({
          type: 'block',
          styles: [
            { title: 'Paragraphe', value: 'normal' },
            { title: 'Titre 2', value: 'h2' },
            { title: 'Titre 3', value: 'h3' },
            { title: 'Citation', value: 'blockquote' },
          ],
          lists: [
            { title: 'Puces', value: 'bullet' },
            { title: 'Numérotée', value: 'number' },
          ],
          marks: {
            decorators: [
              { title: 'Gras', value: 'strong' },
              { title: 'Italique', value: 'em' },
            ],
            annotations: [
              defineArrayMember({
                name: 'link',
                title: 'Lien',
                type: 'object',
                icon: LinkIcon,
                fields: [
                  defineField({
                    name: 'href',
                    title: 'URL',
                    type: 'url',
                    validation: (rule) =>
                      rule.uri({ scheme: ['http', 'https', 'mailto', 'tel'], allowRelative: true }),
                  }),
                ],
              }),
            ],
          },
        }),
        defineArrayMember({
          type: 'image',
          icon: ImageIcon,
          options: { hotspot: true },
          fields: [
            altField,
            defineField({ name: 'caption', title: 'Légende', type: 'string' }),
          ],
        }),
      ],
    }),
  ],
  orderings: [
    { title: 'Plus récents', name: 'publishedAtDesc', by: [{ field: 'publishedAt', direction: 'desc' }] },
  ],
  preview: {
    select: { title: 'title', subtitle: 'subtitle', media: 'image' },
  },
})
