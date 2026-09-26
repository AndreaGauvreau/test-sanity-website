import type { SystemSection } from '../../types'

// Textes du Figma (269:232), tels quels : contenu de départ de la section (npm run seed)
// et de l'aperçu /preview/system. Les destinations des liens ne sont pas encore fournies.
export const system = {
  _type: 'systemSection',
  eyebrow: 'Conduit System',
  title: 'Build to your business needs',
  lede: "Conduit is modular so you can address immediate demands and grow into new opportunities. Gain unified network control while scaling each facility's solutions individually.",
  cta: { _type: 'cta', label: 'Explore the Conduit System' },
  modules: [
    {
      _type: 'module',
      _key: 'driver-check-in',
      title: 'Driver Check-in',
      text: 'Drivers self-register on arrival. The appointment record picks up the timestamp automatically.',
      link: { _type: 'cta', label: 'See more' },
    },
    {
      _type: 'module',
      _key: 'dock-operations',
      title: 'Dock Operations',
      text: 'Door assignments, live status, and unload progress on one board for the whole floor.',
      link: { _type: 'cta', label: 'See more' },
    },
    {
      _type: 'module',
      _key: 'yard-management',
      title: 'Yard Management',
      text: 'Track trailers from gate to door, so nothing sits in the lot unaccounted for.',
      link: { _type: 'cta', label: 'See more' },
    },
  ],
} satisfies SystemSection
