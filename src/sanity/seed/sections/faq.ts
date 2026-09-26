import type { FaqSection } from '../../types'

// Textes du Figma (269:456), tels quels : contenu de départ de la section (npm run seed)
// et de l'aperçu /preview/faq. Le retour à la ligne de la carte d'aide est celui du Figma.
// Les questions sont dans la collection FAQ (seed/collections.ts).
export const faq = {
  _type: 'faqSection',
  eyebrow: 'Frequently asked question',
  title: 'Conduit Dock Scheduling FAQs',
  supportText: 'If you need additional support,\nConduit is always available to help you',
  supportCta: { _type: 'cta', label: 'Talk to sales' },
} satisfies FaqSection
