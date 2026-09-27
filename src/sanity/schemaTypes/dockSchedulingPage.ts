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
    // SEO (C2) : migré de seoTitle / seoDescription par scripts/migrate-admin.ts.
    defineField({ name: 'seo', title: 'SEO', type: 'seo', group: 'seo' }),
  ],
  preview: {
    prepare: () => ({ title: 'Page Dock Scheduling', subtitle: '/' }),
  },
})
