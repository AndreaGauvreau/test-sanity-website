import { BlockquoteIcon } from '@sanity/icons/Blockquote'
import { CogIcon } from '@sanity/icons/Cog'
import { DocumentsIcon } from '@sanity/icons/Documents'
import { DocumentTextIcon } from '@sanity/icons/DocumentText'
import { HelpCircleIcon } from '@sanity/icons/HelpCircle'
import { HomeIcon } from '@sanity/icons/Home'
import { SearchIcon } from '@sanity/icons/Search'
import type { StructureBuilder, StructureResolver } from 'sanity/structure'

import { ARTICLE_SEO_IDS, SINGLETON_IDS } from './schemaTypes'

// Colonne de gauche du Studio (/studio, Kuartz), rangée comme la sidebar de l'admin :
// réglages, pages (documents uniques à id fixe), puis les collections dans leur ordre manuel.
// Le journal de consommation IA (aiUsage) n'y figure pas : il est écrit par le moteur.
const singleton = (S: StructureBuilder, type: keyof typeof SINGLETON_IDS, title: string, icon: typeof HomeIcon) =>
  S.listItem()
    .title(title)
    .id(SINGLETON_IDS[type])
    .icon(icon)
    .child(S.document().schemaType(type).documentId(SINGLETON_IDS[type]).title(title))

// Modèle SEO des pages article d'une collection (document articleSeoTemplate à id fixe).
const articleSeo = (S: StructureBuilder, collection: keyof typeof ARTICLE_SEO_IDS, title: string) =>
  S.listItem()
    .title(title)
    .id(ARTICLE_SEO_IDS[collection])
    .icon(SearchIcon)
    .child(S.document().schemaType('articleSeoTemplate').documentId(ARTICLE_SEO_IDS[collection]).title(title))

const collection = (S: StructureBuilder, type: string, title: string, icon: typeof HomeIcon) =>
  S.listItem()
    .title(title)
    .id(type)
    .icon(icon)
    .schemaType(type)
    .child(S.documentTypeList(type).title(title).defaultOrdering([{ field: 'orderRank', direction: 'asc' }]))

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Contenu')
    .items([
      singleton(S, 'siteSettings', 'Réglages du site', CogIcon),
      S.divider().title('Pages'),
      singleton(S, 'dockSchedulingPage', 'Home — Dock Scheduling (/)', HomeIcon),
      singleton(S, 'blogPage', 'Blog (/blog)', DocumentsIcon),
      articleSeo(S, 'post', 'Article du blog — SEO (/blog/:slug)'),
      singleton(S, 'testimonialsPage', 'Témoignages (/testimonials)', BlockquoteIcon),
      articleSeo(S, 'testimonial', 'Page d’un témoignage — SEO (/testimonials/:slug)'),
      singleton(S, 'faqPage', 'FAQ (/faq)', HelpCircleIcon),
      articleSeo(S, 'faq', 'Page d’une question — SEO (/faq/:slug)'),
      S.divider().title('Collections'),
      // Blog : même ordre que le site (du plus récent au plus ancien) ; ordre manuel via le menu de tri.
      S.listItem()
        .title('Blog')
        .id('post')
        .icon(DocumentTextIcon)
        .schemaType('post')
        .child(S.documentTypeList('post').title('Blog').defaultOrdering([{ field: 'publishedAt', direction: 'desc' }])),
      collection(S, 'testimonial', 'Témoignages', BlockquoteIcon),
      // Triée par ordre manuel, comme sur le site.
      collection(S, 'faq', 'FAQ', HelpCircleIcon),
    ])
