import type { PerformanceSection } from '../../types'

// Textes du Figma (269:272), tels quels : contenu de départ de la section (npm run seed)
// et de l'aperçu /preview/performance. Atouts dans l'ordre de lecture, de gauche à droite ;
// les titres gardent le retour à la ligne de la maquette (deux paragraphes dans le Figma).
export const performance = {
  _type: 'performanceSection',
  eyebrow: 'Performance',
  title: 'Unlock your capacity for growth',
  benefits: [
    {
      _type: 'benefit',
      _key: 'labor',
      icon: 'chartPieSlice',
      title: 'Allocate labor and\nequipment efficiently',
      text: 'Real-time information gives staff bandwidth for faster unloading and loading, helping you avoid unnecessary overtime.',
    },
    {
      _type: 'benefit',
      _key: 'partners',
      icon: 'speedometer',
      title: 'Improve carrier, vendor,\nand customer performance',
      text: 'Interactive scorecards and data visualizations track key metrics to build reliability your customers can trust.',
    },
    {
      _type: 'benefit',
      _key: 'appointments',
      icon: 'calendarDots',
      title: 'Structure appointments for\noptimal throughput',
      text: 'Conduit leverages your custom rules to distribute volume evenly, smoothing the peaks and gaps that limit profitability.',
    },
  ],
} satisfies PerformanceSection
