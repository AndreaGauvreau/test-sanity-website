import { defineField, defineType } from 'sanity'

// Témoignage (Figma 269:333) : citation sur photo d'entrepôt, puis le bouton vers l'étude de
// cas. La citation, son auteur et le lien par défaut viennent de la collection Témoignages
// (champ `item`, à garder : la requête de la page le déréférence). Ici, le bouton (type `cta`,
// comme partout sur la page) et le titre invisible. La photo et le passant flou restent dans
// le code.
export const testimonialSection = defineType({
  name: 'testimonialSection',
  title: 'Témoignage',
  type: 'object',
  fields: [
    defineField({
      name: 'item',
      title: 'Témoignage affiché',
      type: 'reference',
      to: [{ type: 'testimonial' }],
      description: 'Vide : le plus récent de la collection Témoignages.',
    }),
    defineField({
      name: 'cta',
      title: 'Bouton',
      type: 'cta',
      description:
        'Ex. « Read the case study ». Destination vide : le lien du témoignage affiché ' +
        '(« Lien vers l’étude de cas »), sinon # en attendant. Champs vides : pas de bouton.',
    }),
    defineField({
      name: 'title',
      title: 'Titre pour les lecteurs d’écran',
      type: 'string',
      description:
        'Invisible à l’écran : annonce la section aux lecteurs d’écran et aux moteurs de recherche (titre h2).',
      validation: (rule) => rule.required(),
    }),
  ],
})
