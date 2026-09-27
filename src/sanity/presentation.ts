import { defineDocuments, defineLocations, type PresentationPluginOptions } from 'sanity/presentation'

// Onglet « Aperçu live » du Studio (/studio) : relie chaque URL du site au document qu'elle
// affiche, et chaque document aux pages où il apparaît.
const home = { title: 'Home — Dock Scheduling', href: '/' }
const blog = { title: 'Blog', href: '/blog' }
const testimonials = { title: 'Testimonials', href: '/testimonials' }
const faqs = { title: 'FAQ', href: '/faq' }

export const resolve: PresentationPluginOptions['resolve'] = {
  mainDocuments: defineDocuments([
    { route: '/', filter: `_type == "dockSchedulingPage" && _id == "dockSchedulingPage"` },
    { route: '/blog', filter: `_type == "blogPage" && _id == "blogPage"` },
    { route: '/blog/:slug', filter: `_type == "post" && slug.current == $slug` },
    { route: '/testimonials', filter: `_type == "testimonialsPage" && _id == "testimonialsPage"` },
    { route: '/testimonials/:slug', filter: `_type == "testimonial" && slug.current == $slug` },
    { route: '/faq', filter: `_type == "faqPage" && _id == "faqPage"` },
    { route: '/faq/:slug', filter: `_type == "faq" && slug.current == $slug` },
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
    testimonialsPage: defineLocations({ locations: [testimonials] }),
    faqPage: defineLocations({ locations: [faqs] }),
    testimonial: defineLocations({
      select: { name: 'name', slug: 'slug.current' },
      resolve: (doc) => ({
        locations: [
          ...(doc?.slug ? [{ title: doc.name || 'Sans nom', href: `/testimonials/${doc.slug}` }] : []),
          testimonials,
          home,
        ],
      }),
    }),
    faq: defineLocations({
      select: { question: 'question', slug: 'slug.current' },
      resolve: (doc) => ({
        locations: [
          ...(doc?.slug ? [{ title: doc.question || 'Sans titre', href: `/faq/${doc.slug}` }] : []),
          faqs,
          home,
        ],
      }),
    }),
    siteSettings: defineLocations({
      message: 'Réglages communs à toutes les pages.',
      locations: [home, blog, testimonials, faqs],
    }),
  },
}
