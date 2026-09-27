/**
 * Coloration minimale du code de l'admin (scripts HTML, JSON-LD), d'après les écrans B3 / G6 / C6 :
 * noms de balises en code/tag, accolades JSON en code/brace, champs {{…}} en code/value ; le reste en couleur de texte.
 * Volontairement simple (pas de dépendance) : le texte n'est jamais interprété, seulement découpé.
 */
export type CodeTokenKind = 'text' | 'tag' | 'brace' | 'value'
export type CodeToken = { kind: CodeTokenKind; text: string }

const PATTERN = /(\{\{[^{}\n]*\}\})|(<\/?)([A-Za-z][\w:-]*)|([{}])/g

export function tokenizeCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = []
  let last = 0
  const push = (kind: CodeTokenKind, text: string) => {
    if (!text) return
    const prev = tokens[tokens.length - 1]
    if (prev && prev.kind === kind) prev.text += text
    else tokens.push({ kind, text })
  }
  for (const m of code.matchAll(PATTERN)) {
    const index = m.index ?? 0
    push('text', code.slice(last, index))
    if (m[1]) push('value', m[1])
    else if (m[2]) {
      push('text', m[2])
      push('tag', m[3])
    } else if (m[4]) push('brace', m[4])
    last = index + m[0].length
  }
  push('text', code.slice(last))
  return tokens
}
