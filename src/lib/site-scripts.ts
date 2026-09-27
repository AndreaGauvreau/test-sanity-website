import { escapeValue, templateVariables, type EscapeContext, type TemplateValues } from './template-variables'

/**
 * Scripts du site (siteSettings.scripts, B3 / G6). Pur : analyse du code et choix des scripts d'une page.
 * Le rendu (next/script, <style>, JSON-LD) est dans src/components/site-scripts/.
 *
 * POINT SENSIBLE : le code d'un script est écrit par Kuartz seulement (droit settings.code, vérifié par
 * l'admin) et il est injecté TEL QUEL : c'est une exécution de code voulue (XSS par conception). Seules les
 * VALEURS des {{variables}}, qui viennent du contenu, sont échappées pour leur contexte.
 */

export type ScriptPlacement = 'headEnd' | 'bodyStart' | 'bodyEnd'
export type ScriptRun = 'once' | 'everyPageVisit'

/** Script tel que le lit SITE_SETTINGS_QUERY (scripts actifs seulement). */
export type SiteScript = {
  _key: string
  name: string
  placement: ScriptPlacement
  /** « all », id d'une page du manifeste (« home », « blog ») ou « <page>/slug » (page article). */
  page: string
  run: ScriptRun
  code: string
}

/** Morceau exécutable d'un script : une balise <script> ou <style> du code. */
export type ScriptPart =
  | {
      kind: 'js'
      /** Attributs de la balise (src, async, defer, type="module", id, data-*…), valeurs brutes. */
      attributes: Record<string, string>
      /** Contenu en ligne (vide si src). */
      content: string
    }
  /** <script> dont le type n'est pas du JavaScript (application/ld+json…) : rendu tel quel dans le HTML. */
  | { kind: 'data'; type: string; attributes: Record<string, string>; content: string }
  | { kind: 'css'; content: string }

export type ParsedScript = {
  parts: ScriptPart[]
  /** Texte hors balises <script>/<style> (ignoré à l'injection), réduit, pour l'avertissement. */
  ignored: string
  /** Balise <script> ou <style> ouverte sans fermeture (B3 : avertissement proposé). */
  unclosed: boolean
}

const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module', 'text/ecmascript'])

const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase()
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attributes
}

/**
 * Découpe le code d'un script en balises <script> et <style> (dans l'ordre). Le code est du HTML :
 * « Type » de l'admin = CSS si <style>, JavaScript si <script> (B3).
 */
export function parseScriptCode(code: string): ParsedScript {
  const parts: ScriptPart[] = []
  const tag = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi
  let ignored = ''
  let last = 0
  for (const match of code.matchAll(tag)) {
    ignored += code.slice(last, match.index)
    last = match.index + match[0].length
    const name = match[1].toLowerCase()
    const attributes = parseAttributes(match[2])
    const content = match[3]
    if (name === 'style') {
      parts.push({ kind: 'css', content })
      continue
    }
    const type = (attributes.type ?? '').trim().toLowerCase()
    if (JS_TYPES.has(type)) parts.push({ kind: 'js', attributes, content })
    else parts.push({ kind: 'data', type, attributes, content })
  }
  ignored += code.slice(last)
  const unclosed = /<(script|style)\b/i.test(ignored)
  return { parts, ignored: ignored.replace(/\s+/g, ' ').trim(), unclosed }
}

/** Scripts d'une page : « all » pour le layout, sinon l'id exact de la page (« home », « blog/slug »). */
export function scriptsForPage(scripts: readonly SiteScript[] | null | undefined, page: string): SiteScript[] {
  return (scripts ?? []).filter((script) => script.page === page)
}

/** Contexte d'échappement des {{variables}} dans un morceau. */
function contextOf(part: ScriptPart): EscapeContext {
  if (part.kind === 'css') return 'css'
  return 'js'
}

/**
 * Remplace les {{variables}} d'une page article dans chaque morceau, valeurs échappées pour leur contexte
 * (chaîne JS/JSON pour <script>, chaîne CSS pour <style>). Variable inconnue : laissée telle quelle.
 * Sans `values` (page qui n'est pas une page article), le code reste intact.
 */
export function resolveScriptParts(parts: readonly ScriptPart[], values?: TemplateValues): ScriptPart[] {
  if (!values) return [...parts]
  return parts.map((part) => {
    const replace = (text: string) =>
      text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (whole, name: string) =>
        Object.hasOwn(values, name) ? escapeValue(values[name] ?? '', contextOf(part)) : whole,
      )
    return { ...part, content: replace(part.content) }
  })
}

/** Variables {{…}} utilisées par un script (colonne « champs CMS » de l'admin, G6). */
export function scriptVariables(code: string): string[] {
  return templateVariables(code)
}
