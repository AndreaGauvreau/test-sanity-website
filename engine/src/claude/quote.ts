/**
 * Textes relevés dans la page ou lus dans Sanity, cités dans un prompt ou un message pour Claude (décision 20 du POC) :
 * ce sont des DONNÉES, jamais des consignes. Ils passent tous par quoteData avant d'y entrer : rendu d'avant, sortie de
 * l'outil measure, textes visibles de la page, textes Sanity, liste des pages.
 *
 * Porté de `batterie-tests:cms/src/editor/quote.ts`, adapté à l'anglais : les prompts citent entre “ ” (et non « »).
 */

// Blancs, caractères de contrôle, séparateurs et formats Unicode (U+0085, U+2028, U+200B, U+FEFF, contrôles bidi…) : un
// texte cité reste sur sa ligne.
const BREAKS = /[\s\u0085\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu

// Guillemet droit ouvrant : en début de texte, ou après une espace, un guillemet ouvrant (‹, déjà remplacé) ou une
// parenthèse, un crochet ou une accolade ouvrants.
const OPENING_QUOTE = /(^|[ ‹([{])"/g

/**
 * Texte neutralisé, à citer entre “ ” : blancs, contrôles, séparateurs et formats Unicode réduits à une espace ;
 * guillemets “ ” « » et " remplacés par ‹ › (une citation ne se referme jamais) ; `max` caractères au plus, le dernier
 * étant « … » quand il est coupé. Les apostrophes (’ ') ne sont pas touchées : elles ne ferment pas une citation “ ”.
 */
export function quoteData(text: string, max: number): string {
  const clean = text
    .replace(BREAKS, ' ')
    .trim()
    .replace(/[“«]/g, '‹')
    .replace(/[”»]/g, '›')
    .replace(OPENING_QUOTE, '$1‹')
    .replace(/"/g, '›')
  if (clean.length <= max) return clean
  // Jamais une moitié de caractère (paire de substitution) avant « … ».
  return `${clean.slice(0, Math.max(0, max - 1)).replace(/[\uD800-\uDBFF]$/, '')}…`
}
