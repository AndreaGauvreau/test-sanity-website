import type { FeaturesSection } from '../../types'

// Textes du Figma (269:216), tels quels : contenu de départ de la section (npm run seed)
// et de l'aperçu /preview/features. Le Figma n'affiche pas de titre : `title` est le titre
// masqué (lecteurs d'écran, moteurs de recherche), tiré du nom de la page.
export const features = {
  _type: 'featuresSection',
  title: 'Dock Scheduling features',
  items: [
    {
      _type: 'feature',
      _key: 'custom-rules',
      title: 'Control bookings with custom rules',
      text: 'Set scheduling rules to match and manage your capacity. Send out your booking link once and Dock Scheduling does the rest, suggesting times, collecting shipment data, and sending notifications to everyone. If schedules drift, Conduit automatically checks on arrivals to adjust ETAs.',
    },
    {
      _type: 'feature',
      _key: 'appointments',
      title: 'Turn appointments into action',
      text: 'Skip the drain of ongoing coordination. Dock Scheduling captures the data your organization needs for real-time tactical clarity. Managers get complete appointment and shipment info, including dock door recommendations, so they can focus on efficient labor and throughput.',
    },
    {
      _type: 'feature',
      _key: 'scheduling-data',
      title: 'Do more with scheduling data',
      text: 'Connect appointments with shipment records automatically. Centralizing information lets staff, customers, and carriers track activity from bookings to departures. Big-picture visibility lets staff solve exceptions and optimize network capacity.',
    },
  ],
} satisfies FeaturesSection
