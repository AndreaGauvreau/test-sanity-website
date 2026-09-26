import type { IntegrationsSection } from '../../types'

// Textes du Figma (269:347), tels quels : contenu de départ de la section (npm run seed)
// et de l'aperçu /preview/integrations. La destination du lien n'est pas encore fournie.
export const integrations = {
  _type: 'integrationsSection',
  eyebrow: 'Implementation',
  title: 'Transform your appointments within days',
  body: "Implementing Dock Scheduling only takes a few days. Configuration can happen within hours. Conduit takes you through the process, so it couldn't be easier.",
  cta: { _type: 'cta', label: 'See all integrations' },
  statValue: '160+',
  statLabel: 'WMS, TMS, ERP, and EDI integrations',
} satisfies IntegrationsSection
