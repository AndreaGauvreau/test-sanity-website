import { defineDocuments, defineLocations, type PresentationPluginOptions } from 'sanity/presentation'

// Onglet « Aperçu live » de l'admin : relie chaque URL du site au document qu'elle
// affiche, et chaque document aux pages où il apparaît.
const home = { title: 'Page Dock Scheduling', href: '/' }

export const resolve: PresentationPluginOptions['resolve'] = {
  mainDocuments: defineDocuments([
    { route: '/', filter: `_type == "dockSchedulingPage" && _id == "dockSchedulingPage"` },
    { route: '/blog/:slug', filter: `_type == "post" && slug.current == $slug` },
  ]),
  locations: {
    dockSchedulingPage: defineLocations({
      message: 'Les textes de la page d’accueil.',
      locations: [home],
    }),
    post: defineLocations({
      select: { title: 'title', slug: 'slug.current' },
      resolve: (doc) => ({
        locations: [
          { title: doc?.title || 'Sans titre', href: `/blog/${doc?.slug}` },
          { title: 'Blog', href: '/blog' },
          home,
        ],
      }),
    }),
    testimonial: defineLocations({ locations: [home] }),
    faq: defineLocations({ locations: [home] }),
  },
}
