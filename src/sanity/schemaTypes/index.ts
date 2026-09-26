import { dockSchedulingPage } from './dockSchedulingPage'
import { faq } from './faq'
import { cta } from './objects/cta'
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
import { testimonial } from './testimonial'

// La page Dock Scheduling (document unique, ses textes section par section), puis les
// trois collections du site.
export const schemaTypes = [
  dockSchedulingPage,
  post,
  testimonial,
  faq,
  // Objets partagés et sections de la page
  cta,
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

// Documents uniques : ni création depuis le menu « + », ni suppression, ni duplication.
export const singletonTypes = new Set(['dockSchedulingPage'])
