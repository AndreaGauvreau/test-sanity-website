import { HomeIcon } from '@sanity/icons/Home'
import { defineField, defineType } from 'sanity'

// Même contenu que la collection `pages` du test Payload.
// Singleton : un seul document, d'id "home" (voir structure.ts et sanity.config.ts).
export const home = defineType({
  name: 'home',
  title: "Page d'accueil",
  type: 'document',
  icon: HomeIcon,
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
      type: 'text',
      rows: 3,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'buttonLabel',
      title: 'Texte du bouton',
      type: 'string',
      initialValue: 'Voir le blog',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: { title: 'title' },
    prepare: ({ title }) => ({ title: "Page d'accueil", subtitle: title }),
  },
})
