import { CodeIcon } from '@sanity/icons/Code'
import { CogIcon } from '@sanity/icons/Cog'
import { defineArrayMember, defineField, defineType } from 'sanity'

import { maxLength } from './shared'

/** Emplacement d'un script (B3). L'ordre du tableau = ordre d'injection pour un même emplacement. */
export const SCRIPT_PLACEMENTS = [
  { title: 'Fin du <head>', value: 'headEnd' },
  { title: 'Début du <body>', value: 'bodyStart' },
  { title: 'Fin du <body>', value: 'bodyEnd' },
]

/** Exécution d'un script (G6). */
export const SCRIPT_RUNS = [
  { title: 'Une fois (premier chargement)', value: 'once' },
  { title: 'À chaque page vue', value: 'everyPageVisit' },
]

/**
 * Pages ciblées (G6) : « all », l'id d'une page du manifeste (src/admin.config.ts), ou
 * « <page>/slug » pour la page article d'une page listing (blog/slug = /blog/:slug).
 */
export const SCRIPT_PAGES = [
  { title: 'Toutes les pages', value: 'all' },
  { title: 'Home (/)', value: 'home' },
  { title: 'Blog (/blog)', value: 'blog' },
  { title: 'Article du blog (/blog/:slug)', value: 'blog/slug' },
]

// Réglages du site (B2 General, B3 Code) : document unique, id fixe « siteSettings ».
// Lu par le layout du site : titre et description par défaut, favicons, image de partage,
// indexation, scripts.
export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Réglages du site',
  type: 'document',
  icon: CogIcon,
  groups: [
    { name: 'general', title: 'General', default: true },
    { name: 'code', title: 'Code' },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Titre du site',
      type: 'string',
      group: 'general',
      description: 'Titre par défaut (page sans meta title) et suffixe « — <titre> » de chaque page.',
      validation: (rule) => [rule.required(), maxLength(rule, 60)],
    }),
    defineField({
      name: 'description',
      title: 'Description du site',
      type: 'text',
      rows: 3,
      group: 'general',
      description: 'Description par défaut (page sans meta description).',
      validation: (rule) => maxLength(rule, 160),
    }),
    defineField({
      name: 'faviconLight',
      title: 'Favicon (thème clair)',
      type: 'image',
      group: 'general',
      description: '64 × 64 pixels. PNG, JPG, SVG ou ICO. Sert partout si le favicon sombre manque.',
    }),
    defineField({
      name: 'faviconDark',
      title: 'Favicon (thème sombre)',
      type: 'image',
      group: 'general',
      description: '64 × 64 pixels. Affiché quand le navigateur est en thème sombre.',
    }),
    defineField({
      name: 'socialImage',
      title: 'Image de partage',
      type: 'image',
      group: 'general',
      description: '1200 × 630 pixels. Image par défaut des réseaux sociaux (og:image).',
    }),
    defineField({
      name: 'allowIndexing',
      title: 'Indexation par les moteurs',
      type: 'boolean',
      group: 'general',
      description: 'Désactivé : noindex sur tout le site, prioritaire sur le réglage de chaque page.',
      initialValue: true,
    }),
    defineField({
      name: 'scripts',
      title: 'Scripts',
      type: 'array',
      group: 'code',
      description:
        'Code ajouté au site publié (réservé à Kuartz). Jamais chargé dans le Studio, l’admin, le Draft Mode ni l’aperçu de l’éditeur IA.',
      of: [
        defineArrayMember({
          name: 'siteScript',
          title: 'Script',
          type: 'object',
          icon: CodeIcon,
          fields: [
            defineField({
              name: 'name',
              title: 'Nom',
              type: 'string',
              validation: (rule) => [rule.required(), maxLength(rule, 60)],
            }),
            defineField({
              name: 'placement',
              title: 'Emplacement',
              type: 'string',
              options: { list: SCRIPT_PLACEMENTS, layout: 'radio' },
              initialValue: 'bodyEnd',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'page',
              title: 'Page',
              type: 'string',
              description:
                'Page article (/blog/:slug) : {{title}}, {{slug}}, {{date}}, {{excerpt}}, {{cover}}, {{author}}, {{category}} sont remplacés par les valeurs de l’article.',
              options: { list: SCRIPT_PAGES },
              initialValue: 'all',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'run',
              title: 'Exécution',
              type: 'string',
              options: { list: SCRIPT_RUNS, layout: 'radio' },
              initialValue: 'once',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'code',
              title: 'Code',
              type: 'text',
              rows: 10,
              description: 'Balises <script> ou <style> complètes. Pas de validation du JavaScript.',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'enabled',
              title: 'Actif',
              type: 'boolean',
              initialValue: true,
            }),
          ],
          preview: {
            select: { title: 'name', page: 'page', enabled: 'enabled' },
            prepare: ({ title, page, enabled }) => ({
              title,
              subtitle: `${page ?? 'all'}${enabled === false ? ' · désactivé' : ''}`,
            }),
          },
        }),
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Réglages du site' }),
  },
})
