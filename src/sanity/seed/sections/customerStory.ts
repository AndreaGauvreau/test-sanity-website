import type { CustomerStorySection } from '../../types'

// Textes du Figma (269:305), tels quels : contenu de départ de la section (npm run seed)
// et de l'aperçu /preview/customerStory. La destination du lien n'est pas encore fournie.
export const customerStory = {
  _type: 'customerStorySection',
  eyebrow: 'Customer story',
  title: 'How Prism Logistics increased throughput by 20%',
  cta: { _type: 'cta', label: 'Read the case study' },
  summary:
    'Prism implemented Dock Scheduling at seven facilities to cut emails by 80% and improve throughput by more than 20%.',
  stats: [
    { _type: 'stat', _key: 'emails', value: '80%', label: 'Fewer scheduling emails' },
    { _type: 'stat', _key: 'throughput', value: '20%', label: 'Throughput improvement' },
  ],
  results: [
    { _type: 'result', _key: 'automated-scheduling', label: 'Automated scheduling with custom rules' },
    { _type: 'result', _key: 'data-before-arrivals', label: 'Collected data and documents before arrivals' },
    { _type: 'result', _key: 'network-capacity', label: 'Optimized capacity across its entire network' },
  ],
} satisfies CustomerStorySection
