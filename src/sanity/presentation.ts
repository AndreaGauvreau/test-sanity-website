import { defineDocuments, defineLocations, type PresentationPluginOptions } from 'sanity/presentation'

// Onglet « Aperçu live » du Studio (/studio) : relie chaque URL du site au document qu'elle
// affiche, et chaque document aux pages où il apparaît.
const home = { title: 'Home — Dock Scheduling', href: '/' }
const blog = { title: 'Blog', href: '/blog' }

export const resolve: PresentationPluginOptions['resolve'] = {
  mainDocuments: defineDocuments([
    { route: '/', filter: `_type == "dockSchedulingPage" && _id == "dockSchedulingPage"` },
    { route: '/blog', filter: `_type == "blogPage" && _id == "blogPage"` },
    { route: '/blog/:slug', filter: `_type == "post" && slug.current == $slug` },
  ]),
  locations: {
    dockSchedulingPage: defineLocations({
      message: 'Les textes de la page d’accueil.',
      locations: [home],
    }),
    blogPage: defineLocations({ locations: [blog] }),
    post: defineLocations({
      select: { title: 'title', slug: 'slug.current' },
      resolve: (doc) => ({
        locations: [{ title: doc?.title || 'Sans titre', href: `/blog/${doc?.slug}` }, blog, home],
      }),
    }),
    testimonial: defineLocations({ locations: [home] }),
    faq: defineLocations({ locations: [home] }),
    siteSettings: defineLocations({ message: 'Réglages communs à toutes les pages.', locations: [home, blog] }),
  },
}
