import { DocumentTextIcon } from '@sanity/icons/DocumentText'
import { ImageIcon } from '@sanity/icons/Image'
import { defineArrayMember, defineField, defineType } from 'sanity'

import { altField, linkAnnotation } from './shared'

// Catégories des cartes « Learn and grow » du Figma. Liste fermée : les libellés restent
// identiques d'un article à l'autre. Le libellé est stocké tel quel et affiché par le site.
const categories = ['Operations', "Buyer's guide", 'Analysis']

// Blog. Une carte affiche : image, catégorie, titre, date et temps de lecture (calculé
// depuis le contenu, voir queries.ts). Chaque image est un asset du CDN Sanity,
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
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Catégorie',
      type: 'string',
      options: { list: categories, layout: 'radio', direction: 'horizontal' },
      validation: (rule) => rule.required(),
    }),
    // Une vraie date éditoriale, modifiable (antidater, réordonner), qui sert au tri. Ce n'est
    // pas une programmation : un article publié avec une date future s'affiche tout de suite.
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
      description: 'Le point focal (hotspot) décide de la partie gardée quand le site recadre l’image.',
      options: { hotspot: true },
      fields: [altField],
      // assetRequired : sans lui, un objet image vide (juste un alt) passe la validation.
      validation: (rule) => rule.required().assetRequired(),
    }),
    defineField({
      name: 'excerpt',
      title: 'Résumé',
      type: 'text',
      rows: 3,
      description: 'Affiché en tête d’article, et repris comme description pour les moteurs de recherche.',
      validation: (rule) => [
        rule.required(),
        rule.max(160).warning('Au-delà de 160 caractères, Google tronque la description.'),
      ],
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
            annotations: [linkAnnotation],
          },
        }),
        defineArrayMember({
          type: 'image',
          icon: ImageIcon,
          options: { hotspot: true },
          fields: [altField, defineField({ name: 'caption', title: 'Légende', type: 'string' })],
        }),
      ],
    }),
  ],
  orderings: [
    { title: 'Plus récents', name: 'publishedAtDesc', by: [{ field: 'publishedAt', direction: 'desc' }] },
  ],
  preview: {
    select: { title: 'title', subtitle: 'category', media: 'image' },
  },
})
