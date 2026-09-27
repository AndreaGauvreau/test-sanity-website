/**
 * Textes par défaut des pages listing /testimonials et /faq (pur, aucun import) : ce que le site affiche quand
 * un champ du document de la page (testimonialsPage, faqPage) est vide. Repris par le schéma (descriptions des
 * champs), les pages Next et la migration (valeurs initiales des documents).
 */
export type ListingDefaults = { eyebrow: string; title: string; lede: string; emptyText: string }

export const TESTIMONIALS_PAGE_DEFAULTS: ListingDefaults = {
  eyebrow: 'Testimonials',
  title: 'What our customers say',
  lede: 'Operations teams share how Conduit changed the way their docks run.',
  emptyText: 'No testimonials published yet.',
}

export const FAQ_PAGE_DEFAULTS: ListingDefaults = {
  eyebrow: 'FAQ',
  title: 'Frequently asked questions',
  lede: 'Everything you need to know about Conduit Dock Scheduling.',
  emptyText: 'No questions published yet.',
}
