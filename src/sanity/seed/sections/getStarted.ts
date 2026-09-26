import type { GetStartedSection } from '../../types'

// Textes du Figma (269:543), tels quels : contenu de départ de la section (npm run seed)
// et de l'aperçu /preview/getStarted. Les destinations des boutons ne sont pas encore fournies.
export const getStarted = {
  _type: 'getStartedSection',
  eyebrow: 'Get started',
  title: 'Put your dock schedule on rules,',
  titleMuted: 'not phone calls',
  text: 'Talk to our team about Dock Scheduling, or take the self-serve tour and see the appointment record in action.',
  primaryCta: { _type: 'cta', label: 'Talk to sales' },
  secondaryCta: { _type: 'cta', label: 'Take a tour' },
} satisfies GetStartedSection
