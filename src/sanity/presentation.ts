import { defineDocuments, defineLocations, type PresentationPluginOptions } from 'sanity/presentation'

// Onglet « Aperçu live » de l'admin : relie chaque URL du site au document qu'elle
// affiche, et chaque document aux pages où il apparaît.
export const resolve: PresentationPluginOptions['resolve'] = {
  mainDocuments: defineDocuments([
    { route: '/', filter: `_type == "home" && _id == "home"` },
    { route: '/blog/:slug', filter: `_type == "post" && slug.current == $slug` },
  ]),
  locations: {
    home: defineLocations({
      message: 'Ce document est affiché sur :',
      locations: [{ title: 'Accueil', href: '/' }],
    }),
    post: defineLocations({
      select: { title: 'title', slug: 'slug.current' },
      resolve: (doc) => ({
        locations: [
          { title: doc?.title || 'Sans titre', href: `/blog/${doc?.slug}` },
          { title: 'Blog', href: '/blog' },
        ],
      }),
    }),
  },
}
