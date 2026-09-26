import type { Metadata } from 'next'

export const siteName = 'Conduit'

// Destinations des CTA et des notes : dans Sanity, avec chaque bouton (`#` tant qu'elles
// ne sont pas renseignées).

// Une page qui déclare `openGraph` remplace tout l'objet du layout (fusion superficielle) :
// elle repart de ces valeurs communes.
export const openGraphDefaults = {
  siteName,
  type: 'website',
  locale: 'en_US',
} satisfies Metadata['openGraph']
