import { DocumentsIcon } from '@sanity/icons/Documents'
import { defineField, defineType } from 'sanity'

import { maxLength } from './shared'

// Page /blog : document unique, id fixe « blogPage ». Les textes que la page affichait en dur
// (titre h1, message sans article) et son SEO (C2). La liste des articles vient de la collection.
export const blogPage = defineType({
  name: 'blogPage',
  title: 'Page Blog',
  type: 'document',
  icon: DocumentsIcon,
  groups: [
    { name: 'content', title: 'Contenu', default: true },
    { name: 'seo', title: 'SEO' },
  ],
  fields: [
    // Un objet par section (contrat de l'admin : une section = un champ du document).
    defineField({
      name: 'content',
      title: 'Page',
      type: 'object',
      group: 'content',
      options: { collapsible: false },
      fields: [
        defineField({
          name: 'title',
          title: 'Titre',
          type: 'string',
          description: 'Titre de la page (h1). Vide : « Blog ».',
          validation: (rule) => maxLength(rule, 40),
        }),
        defineField({
          name: 'emptyText',
          title: 'Message sans article',
          type: 'string',
          description: 'Affiché tant qu’aucun article n’est publié. Vide : « No articles published yet. ».',
          validation: (rule) => maxLength(rule, 80),
        }),
      ],
    }),
    defineField({ name: 'seo', title: 'SEO', type: 'seo', group: 'seo' }),
  ],
  preview: {
    prepare: () => ({ title: 'Page Blog', subtitle: '/blog' }),
  },
})
