import { BlockquoteIcon } from '@sanity/icons/Blockquote'
import { HelpCircleIcon } from '@sanity/icons/HelpCircle'
import { defineField, defineType } from 'sanity'

import { FAQ_PAGE_DEFAULTS, TESTIMONIALS_PAGE_DEFAULTS, type ListingDefaults as Defaults } from '../../lib/page-defaults'
import { maxLength } from './shared'

/**
 * Page listing d'une collection (/testimonials, /faq) : document unique à id fixe, comme blogPage. Les textes
 * de l'en-tête (sur-titre, titre h1, chapeau), le message sans élément, et le SEO (C2). La liste vient de la
 * collection. Chaque texte vide retombe sur le texte par défaut du site (`defaults`, repris par la page Next).
 */
function listingPage({
  name,
  title,
  path,
  icon,
  defaults,
}: {
  name: string
  title: string
  path: string
  icon: typeof BlockquoteIcon
  defaults: Defaults
}) {
  return defineType({
    name,
    title,
    type: 'document',
    icon,
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
            name: 'eyebrow',
            title: 'Sur-titre',
            type: 'string',
            description: `Petit libellé au-dessus du titre. Vide : « ${defaults.eyebrow} ».`,
            validation: (rule) => maxLength(rule, 30),
          }),
          defineField({
            name: 'title',
            title: 'Titre',
            type: 'string',
            description: `Titre de la page (h1). Vide : « ${defaults.title} ».`,
            validation: (rule) => maxLength(rule, 60),
          }),
          defineField({
            name: 'lede',
            title: 'Chapeau',
            type: 'text',
            rows: 3,
            description: `Phrase sous le titre. Vide : « ${defaults.lede} ».`,
            validation: (rule) => maxLength(rule, 200),
          }),
          defineField({
            name: 'emptyText',
            title: 'Message sans élément',
            type: 'string',
            description: `Affiché tant que la collection est vide. Vide : « ${defaults.emptyText} ».`,
            validation: (rule) => maxLength(rule, 80),
          }),
        ],
      }),
      defineField({ name: 'seo', title: 'SEO', type: 'seo', group: 'seo' }),
    ],
    preview: {
      prepare: () => ({ title, subtitle: path }),
    },
  })
}

// Page /testimonials : id fixe « testimonialsPage ».
export const testimonialsPage = listingPage({
  name: 'testimonialsPage',
  title: 'Page Témoignages',
  path: '/testimonials',
  icon: BlockquoteIcon,
  defaults: TESTIMONIALS_PAGE_DEFAULTS,
})

// Page /faq : id fixe « faqPage ».
export const faqPage = listingPage({
  name: 'faqPage',
  title: 'Page FAQ',
  path: '/faq',
  icon: HelpCircleIcon,
  defaults: FAQ_PAGE_DEFAULTS,
})
