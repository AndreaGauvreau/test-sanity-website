import { aiUsage } from './aiUsage'
import { articleSeoTemplate } from './articleSeoTemplate'
import { blogPage } from './blogPage'
import { dockSchedulingPage } from './dockSchedulingPage'
import { faq } from './faq'
import { faqPage, testimonialsPage } from './listingPage'
import { cta } from './objects/cta'
import { seo } from './objects/seo'
import { post } from './post'
import { customerStorySection } from './sections/customerStory'
import { faqSection } from './sections/faq'
import { featuresSection } from './sections/features'
import { getStartedSection } from './sections/getStarted'
import { heroSection } from './sections/hero'
import { insightsSection } from './sections/insights'
import { integrationsSection } from './sections/integrations'
import { performanceSection } from './sections/performance'
import { systemSection } from './sections/system'
import { testimonialSection } from './sections/testimonial'
import { tourSection } from './sections/tour'
import { siteSettings } from './siteSettings'
import { testimonial } from './testimonial'

// Réglages et pages (documents uniques), modèle SEO des pages article, les trois collections du
// site, puis le journal de consommation IA (privé, écrit par le moteur, hors structure du Studio).
export const schemaTypes = [
  siteSettings,
  dockSchedulingPage,
  blogPage,
  testimonialsPage,
  faqPage,
  articleSeoTemplate,
  post,
  testimonial,
  faq,
  aiUsage,
  // Objets partagés et sections de la page
  cta,
  seo,
  heroSection,
  featuresSection,
  systemSection,
  performanceSection,
  customerStorySection,
  testimonialSection,
  integrationsSection,
  tourSection,
  faqSection,
  insightsSection,
  getStartedSection,
]

// Documents uniques (id fixe) : ni création depuis le menu « + », ni suppression, ni duplication.
export const SINGLETON_IDS = {
  siteSettings: 'siteSettings',
  dockSchedulingPage: 'dockSchedulingPage',
  blogPage: 'blogPage',
  testimonialsPage: 'testimonialsPage',
  faqPage: 'faqPage',
  // Pas de point dans l'id : un id avec un point est privé, le site ne pourrait pas le lire.
  // Modèle SEO des articles du blog ; ceux des autres collections : ARTICLE_SEO_IDS.
  articleSeoTemplate: 'articleSeo-post',
} as const

/** Modèle SEO des pages article (C6), par collection (type Sanity) : un document articleSeoTemplate chacun. */
export const ARTICLE_SEO_IDS = {
  post: 'articleSeo-post',
  testimonial: 'articleSeo-testimonial',
  faq: 'articleSeo-faq',
} as const

export const singletonTypes = new Set<string>(Object.keys(SINGLETON_IDS))

// Types qu'on ne crée jamais depuis le Studio (menu « + », modèles) : singletons et journal IA.
export const hiddenCreationTypes = new Set<string>([...singletonTypes, 'aiUsage'])
