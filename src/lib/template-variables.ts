/**
 * Variables {{…}} des pages article (C6 modèle SEO, G6 scripts). Pur : aucun import.
 *
 * Valeurs d'un article `post` : {{title}}, {{slug}}, {{date}} (AAAA-MM-JJ, date de publication),
 * {{excerpt}}, {{cover}} (URL de l'image 1200 × 630), {{author}}, {{category}}.
 * La même liste est déclarée dans src/admin.config.ts (articleSeoTemplates) et dans le schéma
 * (POST_TEMPLATE_VARIABLES, src/sanity/schemaTypes/articleSeoTemplate.ts).
 */

export type TemplateValues = Readonly<Record<string, string | null | undefined>>

/** {{ nom }} : lettres, chiffres, soulignement ; espaces tolérés autour du nom. */
const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/** Noms des variables citées dans un texte, sans doublon, dans l'ordre d'apparition. */
export function templateVariables(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(VARIABLE), (match) => match[1]))]
}

/** Contexte d'insertion d'une valeur : texte brut (métadonnées), chaîne JS/JSON, chaîne CSS, HTML. */
export type EscapeContext = 'text' | 'js' | 'css' | 'html'

/**
 * Échappe une valeur pour son contexte. Les valeurs viennent du contenu (modifiable par le client) :
 * elles ne doivent jamais pouvoir fermer la balise ni la chaîne qui les contient.
 * - js   : contenu d'une chaîne JavaScript ou JSON entre guillemets doubles (JSON.stringify sans les
 *          guillemets), `<` en < (jamais de « </script> »), U+2028 et U+2029 échappés ;
 * - css  : contenu d'une chaîne CSS entre guillemets, caractères non alphanumériques en échappement hexadécimal ;
 * - html : entités pour & < > " ' ;
 * - text : tel quel (Next échappe les métadonnées).
 */
export function escapeValue(value: string, context: EscapeContext): string {
  switch (context) {
    case 'js':
      return JSON.stringify(value)
        .slice(1, -1)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
    case 'css':
      return value.replace(/[^A-Za-z0-9 _.,:/-]/g, (char) => `\\${char.codePointAt(0)!.toString(16)} `)
    case 'html':
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    case 'text':
      return value
  }
}

export type ResolveResult = {
  value: string
  /** Variables citées dont la valeur est vide pour cet article. */
  empty: string[]
  /** Variables citées que l'article ne connaît pas (laissées telles quelles dans le texte). */
  unknown: string[]
}

/**
 * Remplace les {{variables}} connues par leur valeur échappée pour le contexte. Une variable inconnue
 * reste écrite telle quelle (l'admin la refuse à la saisie, C6) ; une variable vide devient une chaîne
 * vide, et elle est signalée (le SEO se replie alors sur la valeur du site).
 */
export function resolveTemplate(text: string, values: TemplateValues, context: EscapeContext): ResolveResult {
  const empty = new Set<string>()
  const unknown = new Set<string>()
  const value = text.replace(VARIABLE, (whole, name: string) => {
    if (!Object.hasOwn(values, name)) {
      unknown.add(name)
      return whole
    }
    const raw = values[name]
    if (raw === null || raw === undefined || raw === '') {
      empty.add(name)
      return ''
    }
    return escapeValue(raw, context)
  })
  return { value, empty: [...empty], unknown: [...unknown] }
}
