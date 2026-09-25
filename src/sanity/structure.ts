import { HomeIcon } from '@sanity/icons/Home'
import type { StructureResolver } from 'sanity/structure'

// Colonne de gauche de l'admin : la page d'accueil (document unique) puis les articles.
export const structure: StructureResolver = (S) =>
  S.list()
    .title('Contenu')
    .items([
      S.listItem()
        .title("Page d'accueil")
        .id('home')
        .icon(HomeIcon)
        .child(
          S.document()
            .schemaType('home')
            .documentId('home')
            .initialValueTemplate('home')
            .title("Page d'accueil"),
        ),
      S.divider(),
      S.documentTypeListItem('post').title('Articles'),
    ])
