import { SearchIcon } from '@sanity/icons/Search'
import { defineField, defineType } from 'sanity'

import { maxLength } from '../shared'

// SEO d'une page (C2 de l'admin). Champ vide : valeur par défaut du site (siteSettings, B2).
// Le site ajoute « — <titre du site> » au meta title (modèle de titre du layout).
export const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  icon: SearchIcon,
  options: { collapsible: false },
  fields: [
    defineField({
      name: 'metaTitle',
      title: 'Meta title',
      type: 'string',
      description: 'Onglet du navigateur et résultat Google. « — Conduit » est ajouté par le site. Vide : titre du site.',
      validation: (rule) => maxLength(rule, 60),
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta description',
      type: 'text',
      rows: 3,
      description: 'Vide : description du site.',
      validation: (rule) => maxLength(rule, 160),
    }),
    defineField({
      name: 'ogImage',
      title: 'Image de partage (OG)',
      type: 'image',
      description: '1200 × 630 pixels. Vide : image de partage du site.',
    }),
    defineField({
      name: 'allowIndexing',
      title: 'Indexation',
      type: 'boolean',
      description: 'Désactivé : noindex pour cette page. Si l’indexation du site est coupée, elle l’emporte.',
      initialValue: true,
    }),
  ],
})
