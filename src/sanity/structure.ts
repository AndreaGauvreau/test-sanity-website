import { HelpCircleIcon } from '@sanity/icons/HelpCircle'
import { HomeIcon } from '@sanity/icons/Home'
import type { StructureResolver } from 'sanity/structure'

// Colonne de gauche de l'admin : la page (document unique), puis les trois collections.
export const structure: StructureResolver = (S) =>
  S.list()
    .title('Contenu')
    .items([
      S.listItem()
        .title('Page Dock Scheduling')
        .id('dockSchedulingPage')
        .icon(HomeIcon)
        .child(
          S.document()
            .schemaType('dockSchedulingPage')
            .documentId('dockSchedulingPage')
            .title('Page Dock Scheduling'),
        ),
      S.divider(),
      S.documentTypeListItem('post').title('Blog'),
      S.documentTypeListItem('testimonial').title('Témoignages'),
      // Triée par ordre d'affichage, comme sur le site.
      S.listItem()
        .title('FAQ')
        .id('faq')
        .icon(HelpCircleIcon)
        .schemaType('faq')
        .child(S.documentTypeList('faq').title('FAQ').defaultOrdering([{ field: 'order', direction: 'asc' }])),
    ])
