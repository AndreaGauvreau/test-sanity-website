import { defineField, defineType } from 'sanity'

import { maxLength } from '../shared'

// Intégrations (Figma 269:347) : sur-titre, titre, texte, lien « See all integrations »,
// chiffre clé (« 160+ »). La grille des huit logos reste dans le code.
export const integrationsSection = defineType({
  name: 'integrationsSection',
  title: 'Intégrations',
  type: 'object',
  // Le chiffre et sa légende, regroupés à l'écran (sans objet imbriqué dans les données).
  fieldsets: [{ name: 'stat', title: 'Chiffre clé', description: 'Affiché au-dessus de la grille de logos.' }],
  fields: [
    defineField({
      name: 'eyebrow',
      title: 'Sur-titre',
      type: 'string',
      description: 'Le petit libellé orange au-dessus du titre. Ex. « Implementation ».',
      validation: (rule) => [rule.required(), maxLength(rule, 30)],
    }),
    defineField({
      name: 'title',
      title: 'Titre',
      type: 'string',
      description: 'Titre de la section (h2). Le retour à la ligne est automatique.',
      validation: (rule) => [rule.required(), maxLength(rule, 60)],
    }),
    defineField({
      name: 'body',
      title: 'Texte',
      type: 'text',
      rows: 3,
      description: 'Deux ou trois lignes, en bas de la colonne de gauche, au-dessus du lien.',
      validation: (rule) => [rule.required(), maxLength(rule, 200)],
    }),
    defineField({
      name: 'cta',
      title: 'Lien vers les intégrations',
      type: 'cta',
      description: 'Lien souligné sous le texte. Ex. « See all integrations ».',
    }),
    defineField({
      name: 'statValue',
      title: 'Valeur',
      type: 'string',
      fieldset: 'stat',
      description: 'Le grand chiffre orange. Ex. « 160+ ».',
      validation: (rule) => [rule.required(), maxLength(rule, 8)],
    }),
    defineField({
      name: 'statLabel',
      title: 'Légende',
      type: 'string',
      fieldset: 'stat',
      description:
        'Ce que compte le chiffre. Ex. « WMS, TMS, ERP, and EDI integrations ». Une ligne courte : au-delà de 45 caractères, elle passe à la ligne.',
      validation: (rule) => [rule.required(), maxLength(rule, 45)],
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'eyebrow' },
  },
})
