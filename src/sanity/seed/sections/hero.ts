import type { HeroSection } from '../../types'

// Textes du Figma (269:177), tels quels. Contenu de départ de l'onglet Hero (npm run seed)
// et de l'aperçu /preview/hero. Les destinations des boutons ne sont pas encore fournies.
export const hero = {
  _type: 'heroSection',
  title: 'Automate scheduling for maximum capacity control',
  lede: 'Dock Scheduling extends booking power to carriers and customers based on your rules. Offload phone calls and emails and gain actionable insights into volume, shipment data, and performance. Automated scheduling becomes system-led capacity management with Conduit.',
  primaryCta: { _type: 'cta', label: 'Talk to sales' },
  secondaryCta: { _type: 'cta', label: 'Take a tour' },
  ratings: [
    { _type: 'rating', _key: 'g2', platform: 'g2', label: '4.7 stars on G2' },
    { _type: 'rating', _key: 'capterra', platform: 'capterra', label: '4.7 stars on Capterra' },
  ],
} satisfies HeroSection
