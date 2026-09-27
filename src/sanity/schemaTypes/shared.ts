import { LinkIcon } from '@sanity/icons/Link'
import { generateKeyBetween } from 'fractional-indexing'
import { defineArrayMember, defineField, type StringRule } from 'sanity'

// Texte alternatif obligatoire dès qu'une image est choisie. Le site lit
// `coalesce(alt, asset->altText)` : le texte de l'asset (médiathèque, C5) sert de repli.
export const altField = defineField({
  name: 'alt',
  title: 'Texte alternatif',
  type: 'string',
  description: 'Vide : le texte alternatif de l’image dans la médiathèque (altText de l’asset).',
  // Obligatoire seulement si l'asset n'a pas le sien (question 13 du Figma : une valeur par image).
  validation: (rule) =>
    rule.custom(async (alt, context) => {
      const image = context.parent as { asset?: { _ref?: string } } | undefined
      const ref = image?.asset?._ref
      if (!ref || alt) return true
      const assetAlt = await context
        .getClient({ apiVersion: '2026-09-01' })
        .fetch<string | null>(`*[_id == $ref][0].altText`, { ref })
      return assetAlt ? true : 'Décris l’image pour les lecteurs d’écran (ici ou dans la médiathèque)'
    }),
})

// Lien dans un texte riche : URL absolue, relative, mailto ou tel.
export const linkAnnotation = defineArrayMember({
  name: 'link',
  title: 'Lien',
  type: 'object',
  icon: LinkIcon,
  fields: [
    defineField({
      name: 'href',
      title: 'URL',
      type: 'url',
      validation: (rule) => rule.uri({ scheme: ['http', 'https', 'mailto', 'tel'], allowRelative: true }),
    }),
  ],
})

/**
 * Longueur maximale d'un texte, en AVERTISSEMENT (le Studio laisse publier). Les mêmes limites sont
 * déclarées dans src/admin.config.ts (compteurs de l'admin) et src/editor/zones.json (éditeur IA) ;
 * src/admin.config.test.ts vérifie qu'elles concordent. L'API Sanity n'applique pas ces règles :
 * l'admin et le moteur revalident côté serveur.
 */
export function maxLength(rule: StringRule, max: number) {
  return rule.max(max).warning(`${max} caractères au plus : au-delà, la mise en page du site peut casser.`)
}

/**
 * Ordre manuel d'une collection (G5 ⇅ de l'admin) : clé fractionnaire (fractional-indexing), triée
 * comme une chaîne. Masqué dans le Studio : l'admin la réécrit quand on glisse une ligne. Un document
 * créé dans le Studio reçoit une clé après la dernière de sa collection.
 */
export function orderRankField(type: string) {
  return defineField({
    name: 'orderRank',
    title: 'Ordre manuel',
    type: 'string',
    hidden: true,
    readOnly: true,
    initialValue: async (_params, { getClient }) => {
      const client = getClient({ apiVersion: '2026-09-01' })
      const last = await client.fetch<string | null>(
        `*[_type == $type && defined(orderRank)] | order(orderRank desc)[0].orderRank`,
        { type },
      )
      try {
        return generateKeyBetween(last ?? null, null)
      } catch {
        // Clé existante invalide (écrite à la main) : on repart d'une clé neuve.
        return generateKeyBetween(null, null)
      }
    },
  })
}
