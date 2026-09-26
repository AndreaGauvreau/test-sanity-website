import type { TestimonialSection } from '../../types'

// Textes du Figma (269:333), tels quels : contenu de départ de la section (npm run seed)
// et de l'aperçu /preview/testimonial. Sans `item`, la page affiche le témoignage le plus
// récent (testimonialDoc dans ../collections.ts : citation, Teresa Nelson…).
// Bouton sans destination : il prend le lien du témoignage affiché (vide pour l'instant).
// `title` n'est pas dans le Figma : titre invisible, pour les lecteurs d'écran.
export const testimonial = {
  _type: 'testimonialSection',
  cta: { _type: 'cta', label: 'Read the case study' },
  title: 'Customer testimonial',
} satisfies TestimonialSection
