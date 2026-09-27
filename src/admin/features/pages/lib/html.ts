/**
 * Lecture du HTML rendu d'une page publique (C2) : JSON-LD et arbre des titres. PUR, sans DOM ni exécution :
 * le HTML est traité comme du TEXTE (expressions régulières bornées), aucun script n'est interprété, aucune
 * balise n'est réinjectée telle quelle dans l'admin (les textes extraits sont rendus par React, donc échappés).
 */

/** Taille maximale traitée (au-delà, le reste est ignoré). */
export const MAX_HTML_LENGTH = 3_000_000
const MAX_JSON_LD_BLOCKS = 10
const MAX_JSON_LD_LENGTH = 50_000
const MAX_HEADINGS = 200

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
const LD_JSON_TYPE = /\btype\s*=\s*(?:"\s*application\/ld\+json\s*"|'\s*application\/ld\+json\s*'|application\/ld\+json(?=[\s>/]|$))/i

/**
 * Blocs `<script type="application/ld+json">` dans l'ordre du document, mis en forme (JSON indenté de 2) quand le
 * contenu est du JSON valide, sinon le texte brut (modèle avec {{…}} hors chaîne, par exemple).
 */
export function extractJsonLd(html: string): string[] {
  const source = html.slice(0, MAX_HTML_LENGTH)
  const blocks: string[] = []
  for (const match of source.matchAll(SCRIPT)) {
    if (blocks.length >= MAX_JSON_LD_BLOCKS) break
    if (!LD_JSON_TYPE.test(match[1])) continue
    const raw = match[2].trim().slice(0, MAX_JSON_LD_LENGTH)
    if (!raw) continue
    blocks.push(formatJson(raw))
  }
  return blocks
}

export function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

// ─── Titres ─────────────────────────────────────────────────────────────────

export type Heading = { level: 1 | 2 | 3 | 4 | 5 | 6; text: string }

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** Retire ce qui n'est pas du contenu rendu : commentaires, scripts, styles, templates, noscript. */
function stripNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
}

/** Texte visible d'un fragment HTML : balises retirées, <br> = espace, entités décodées, espaces réduits. */
export function textOf(fragment: string): string {
  return decodeEntities(fragment.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Titres H1 → H6 du `<body>`, dans l'ordre du document. */
export function extractHeadings(html: string): Heading[] {
  let source = html.slice(0, MAX_HTML_LENGTH)
  const body = source.search(/<body\b/i)
  if (body >= 0) source = source.slice(body)
  source = stripNonContent(source)
  const headings: Heading[] = []
  for (const match of source.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)) {
    if (headings.length >= MAX_HEADINGS) break
    headings.push({ level: Number(match[1]) as Heading['level'], text: textOf(match[2]) })
  }
  return headings
}

export type HeadingIssue = 'skip' | 'empty' | 'extra-h1'

export type HeadingRowModel = Heading & { issue?: HeadingIssue; note?: string }

export type HeadingSummaryItem = { ok: boolean; text: string }

export type HeadingAnalysis = { rows: HeadingRowModel[]; summary: HeadingSummaryItem[] }

/**
 * Alertes de C2 : aucun H1 ou plusieurs H1 ; niveau sauté (« H4 after an H2 ») ; titre vide. Elles n'empêchent pas
 * de publier. Une ligne porte au plus une alerte (vide > saut > H1 en trop).
 */
export function analyzeHeadings(headings: readonly Heading[]): HeadingAnalysis {
  let h1Seen = 0
  let skipped = 0
  let empty = 0
  const rows: HeadingRowModel[] = headings.map((heading, index) => {
    const previous = index > 0 ? headings[index - 1].level : null
    if (heading.level === 1) h1Seen += 1
    if (!heading.text) {
      empty += 1
      return { ...heading, issue: 'empty', note: 'Empty heading' }
    }
    if (previous !== null && heading.level > previous + 1) {
      skipped += 1
      return { ...heading, issue: 'skip', note: `H${heading.level} after an H${previous}` }
    }
    if (heading.level === 1 && h1Seen > 1) return { ...heading, issue: 'extra-h1', note: 'More than one H1' }
    return { ...heading }
  })
  const h1 = headings.filter((h) => h.level === 1).length
  return {
    rows,
    summary: [
      { ok: h1 === 1, text: h1 === 1 ? 'One H1' : h1 === 0 ? 'No H1' : `${h1} H1s` },
      { ok: skipped === 0, text: skipped === 0 ? 'No level skipped' : skipped === 1 ? 'A level is skipped' : `${skipped} levels skipped` },
      { ok: empty === 0, text: empty === 0 ? 'No empty heading' : empty === 1 ? 'An empty heading' : `${empty} empty headings` },
    ],
  }
}
