import { HomeIcon } from '@sanity/icons/Home'
import { defineField, defineType } from 'sanity'

// Les sections de la page, dans l'ordre d'affichage : [champ, type, onglet].
const sections = [
  ['hero', 'heroSection', 'Hero'],
  ['features', 'featuresSection', 'Fonctionnalités'],
  ['system', 'systemSection', 'Conduit System'],
  ['performance', 'performanceSection', 'Performance'],
  ['customerStory', 'customerStorySection', 'Étude de cas'],
  ['testimonial', 'testimonialSection', 'Témoignage'],
  ['integrations', 'integrationsSection', 'Intégrations'],
  ['tour', 'tourSection', 'Visite guidée'],
  ['faq', 'faqSection', 'FAQ'],
  ['insights', 'insightsSection', 'Articles'],
  ['getStarted', 'getStartedSection', 'Appel final'],
] as const

// Page « Dock Scheduling » (/) : document unique, un onglet par section. Les textes sont
// ici ; les listes (questions, témoignages, articles) restent dans leurs collections.
// Une section vide n'est pas affichée sur le site.
export const dockSchedulingPage = defineType({
  name: 'dockSchedulingPage',
  title: 'Page Dock Scheduling',
  type: 'document',
  icon: HomeIcon,
  groups: [
    ...sections.map(([name, , title], index) => ({ name, title, default: index === 0 })),
    { name: 'seo', title: 'SEO' },
  ],
  fields: [
    ...sections.map(([name, type, title]) =>
      defineField({ name, title, type, group: name, options: { collapsible: false } }),
    ),
    defineField({
      name: 'seoTitle',
      title: 'Titre pour les moteurs de recherche',
      type: 'string',
      group: 'seo',
      description: 'Onglet du navigateur et résultat Google. « — Conduit » est ajouté au partage.',
      validation: (rule) => [
        rule.required(),
        rule.max(60).warning('Au-delà de 60 caractères, Google tronque le titre.'),
      ],
    }),
    defineField({
      name: 'seoDescription',
      title: 'Description pour les moteurs de recherche',
      type: 'text',
      rows: 3,
      group: 'seo',
      validation: (rule) => [
        rule.required(),
        rule.max(160).warning('Au-delà de 160 caractères, Google tronque la description.'),
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Page Dock Scheduling', subtitle: '/' }),
  },
})
