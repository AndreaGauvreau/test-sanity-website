import postcss from 'postcss'

/**
 * Valeurs des custom properties du design system, pour le catalogue des couleurs du prompt (AI-03).
 *
 * Sur Conduit, les couleurs de tokens.json sont des RÔLES qui renvoient à la palette (« color-text » :
 * « var(--color-neutral-900) ») : sans résolution, ni le ton clair / sombre ni le ratio de contraste ne se calculent,
 * et Claude dirait « bien lisible » sans chiffre (leçon C02 du POC). La palette vit dans `src/styles/tokens.css`.
 */

/** Custom properties d'une feuille (`--nom` → valeur brute), dernière déclaration gagnante. CSS illisible : aucune. */
export function cssCustomValues(css: string): Map<string, string> {
  const values = new Map<string, string>()
  try {
    postcss.parse(css).walkDecls((decl) => {
      if (decl.prop.startsWith('--')) values.set(decl.prop, decl.value.trim())
    })
  } catch {
    // Feuille illisible : aucune valeur, le catalogue garde les références telles quelles.
  }
  return values
}

// var(--nom) ou var(--nom, repli) : le repli ne contient pas de parenthèse (suffisant pour des couleurs de palette).
const VAR = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?))?\s*\)/g
// Profondeur maximale d'une chaîne var() → var() : borne aussi une boucle (--a: var(--b); --b: var(--a)).
const MAX_DEPTH = 8

/**
 * Valeur d'un token une fois ses `var()` remplacées par les valeurs de la feuille, récursivement. null si une variable
 * reste inconnue (sans repli) ou si la chaîne est trop profonde / circulaire : on n'invente jamais une valeur.
 */
export function resolveCssValue(value: string, values: ReadonlyMap<string, string> | undefined): string | null {
  let current = value.trim()
  for (let depth = 0; depth <= MAX_DEPTH; depth++) {
    if (!current.includes('var(')) return current
    if (!values) return null
    let unknown = false
    current = current.replace(VAR, (_, name: string, fallback: string | undefined) => {
      const found = values.get(name) ?? fallback?.trim()
      if (found === undefined) unknown = true
      return found ?? ''
    })
    if (unknown) return null
  }
  return null
}
