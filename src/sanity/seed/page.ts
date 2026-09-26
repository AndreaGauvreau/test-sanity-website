import { customerStory } from './sections/customerStory'
import { faq } from './sections/faq'
import { features } from './sections/features'
import { getStarted } from './sections/getStarted'
import { hero } from './sections/hero'
import { insights } from './sections/insights'
import { integrations } from './sections/integrations'
import { performance } from './sections/performance'
import { system } from './sections/system'
import { testimonial } from './sections/testimonial'
import { tour } from './sections/tour'

// Contenu de départ de la page Dock Scheduling : une entrée par champ du document.
export const pageSections = {
  hero,
  features,
  system,
  performance,
  customerStory,
  testimonial,
  integrations,
  tour,
  faq,
  insights,
  getStarted,
}

export const pageSeo = {
  seoTitle: 'Dock Scheduling Software for Capacity Control',
  seoDescription:
    'Let carriers and customers book dock appointments on your rules. Conduit Dock Scheduling cuts calls and emails and turns scheduling into capacity control.',
}
