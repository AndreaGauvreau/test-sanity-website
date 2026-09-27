import { SearchIcon } from '@sanity/icons/Search'
import { defineField, defineType } from 'sanity'

import { maxLength } from './shared'

/**
 * Variables {{…}} d'un modèle SEO de page article (C6) et des scripts de page article (G6), pour la
 * collection post. Liste reprise dans src/admin.config.ts (articleSeoTemplates) et lue par
 * src/lib/seo-template.ts. {{cover}} = URL de l'image (1200 × 630).
 */
export const POST_TEMPLATE_VARIABLES = ['title', 'slug', 'date', 'excerpt', 'cover', 'author', 'category'] as const

// Champs image d'un article utilisables comme image OG (« From field »).
const IMAGE_FIELDS = [{ title: 'Cover (image de l’article)', value: 'cover' }]

// Modèle SEO de la page article d'une collection (C6) : un document par collection, id fixe SANS point
// (« articleSeo-post ») : un id avec un point serait privé et le site ne pourrait pas le lire.
export const articleSeoTemplate = defineType({
  name: 'articleSeoTemplate',
  title: 'SEO des pages article',
  type: 'document',
  icon: SearchIcon,
  fields: [
    defineField({
      name: 'collection',
      title: 'Collection',
      type: 'string',
      description: 'Type Sanity des articles (post = /blog/:slug).',
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'metaTitle',
      title: 'Meta title',
      type: 'string',
      description: `Avec des variables : {{title}} | Conduit Blog. Variables : ${POST_TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(', ')}. « — Conduit » est ajouté par le site.`,
      validation: (rule) => maxLength(rule, 60),
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta description',
      type: 'text',
      rows: 3,
      description: 'Avec des variables : {{excerpt}}. Variable vide : description du site.',
      validation: (rule) => maxLength(rule, 160),
    }),
    defineField({
      name: 'ogImageField',
      title: 'Image OG : champ de l’article',
      type: 'string',
      description: 'Choisi : l’image de ce champ (From field). Vide : l’image fixe ci-dessous.',
      options: { list: IMAGE_FIELDS },
    }),
    defineField({
      name: 'ogImage',
      title: 'Image OG fixe',
      type: 'image',
      description: '1200 × 630 pixels. Utilisée quand aucun champ n’est choisi. Vide : image de partage du site.',
    }),
    defineField({
      name: 'allowIndexing',
      title: 'Indexation',
      type: 'boolean',
      description: 'Désactivé : noindex sur toutes les pages article de la collection.',
      initialValue: true,
    }),
  ],
  preview: {
    select: { collection: 'collection' },
    prepare: ({ collection }) => ({ title: 'SEO des pages article', subtitle: collection }),
  },
})
