/**
 * Valeur d'un VariableInput : texte brut avec des champs {{nom}} (même syntaxe que le SEO des pages article,
 * écran C6, et les scripts, G6). Fonctions pures, testées sans DOM.
 */
export type VariableSegment = { kind: 'text'; text: string } | { kind: 'variable'; name: string }

/** Même grammaire que le site (src/lib/template-variables.ts) : lettres, chiffres, soulignement. */
export const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

export function parseVariables(value: string): VariableSegment[] {
  const out: VariableSegment[] = []
  let last = 0
  for (const m of value.matchAll(VARIABLE_PATTERN)) {
    const index = m.index ?? 0
    if (index > last) out.push({ kind: 'text', text: value.slice(last, index) })
    out.push({ kind: 'variable', name: m[1] })
    last = index + m[0].length
  }
  if (last < value.length) out.push({ kind: 'text', text: value.slice(last) })
  return out
}

export function serializeVariables(segments: readonly VariableSegment[]): string {
  return segments.map((s) => (s.kind === 'text' ? s.text : `{{${s.name}}}`)).join('')
}

/** Noms des champs utilisés, dans l'ordre, sans doublon. */
export function variablesIn(value: string): string[] {
  return [...new Set(parseVariables(value).flatMap((s) => (s.kind === 'variable' ? [s.name] : [])))]
}

/** Remplace les {{champs}} par leurs valeurs (aperçu « avec cet article ») ; champ absent → `fallback(name)` ou ''. */
export function resolveVariables(value: string, values: Readonly<Record<string, string | undefined>>, fallback?: (name: string) => string): string {
  return value.replace(VARIABLE_PATTERN, (_, name: string) => values[name] ?? fallback?.(name) ?? '')
}
