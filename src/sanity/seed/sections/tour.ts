import type { TourSection } from '../../types'

// Textes du Figma (269:420), tels quels : contenu de départ de l'onglet Visite guidée
// (npm run seed) et de l'aperçu /preview/tour. L'URL de la visite n'est pas encore fournie.
export const tour = {
  _type: 'tourSection',
  title: 'Tour Dock Scheduling',
  lede: 'Take a self-serve tour of Conduit to see Dock Scheduling in action.',
  cta: { _type: 'cta', label: 'Take a tour' },
} satisfies TourSection
