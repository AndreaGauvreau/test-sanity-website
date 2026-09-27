import { signableScript, verifyScript } from './script-signature'
import { escapeValue, templateVariables, type TemplateValues } from './template-variables'

/**
 * Scripts du site (siteSettings.scripts, B3 / G6). Pur : analyse du code, vérification de la signature et
 * choix des scripts d'une page. Le rendu (next/script, <style>, JSON-LD) est dans src/components/site-scripts/.
 *
 * POINT SENSIBLE : le code d'un script est injecté TEL QUEL (exécution de code voulue). Il vit dans Sanity, que
 * tout Editor peut écrire : le site n'injecte donc QUE les scripts signés par l'admin (HMAC, secret serveur
 * SCRIPTS_SIGNING_SECRET, src/lib/script-signature.ts ; constat SEC-04) — `verifiedScripts()`.
 * Les VALEURS des {{variables}} viennent du contenu : elles ne sont remplacées QUE dans une chaîne (" ' `) et
 * échappées pour elle ; hors chaîne (code, commentaire), la variable reste écrite telle quelle (constat SEC-01).
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
  /** Absent = actif (la requête ne lit que les scripts actifs). Fait partie de la chaîne signée. */
  enabled?: boolean | null
  /** HMAC écrit par l'admin (B3) ; absent ou faux = script jamais injecté. */
  signature?: string | null
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

/**
 * Scripts dont la signature est valide pour ce secret (SEC-04). Secret absent ou trop court : aucun script.
 * Un script modifié hors de l'admin (Studio, API) n'a plus une signature valide : il est écarté sans bruit.
 */
export async function verifiedScripts(
  scripts: readonly SiteScript[] | null | undefined,
  secret: string | undefined,
): Promise<SiteScript[]> {
  const list = scripts ?? []
  const valid = await Promise.all(list.map((script) => verifyScript(secret, { ...signableScript(script), signature: script.signature })))
  return list.filter((_, index) => valid[index])
}

const VARIABLE_AT = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/y

/** Mots après lesquels « / » ouvre une expression régulière (sinon : division). */
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'])
const REGEX_AFTER_CHAR = new Set('(,=:[!&|?{};+-*%<>~^'.split(''))

/**
 * Parcourt un code JavaScript (ou JSON) et rappelle `onVariable` pour chaque {{variable}}, avec `inString` vrai
 * si elle est DANS une chaîne (" ' ` hors `${…}`), faux si elle est dans le code ou un commentaire. Renvoie le
 * texte où chaque variable est remplacée par le retour de `onVariable`.
 *
 * Lexeur minimal (chaînes, gabarits imbriqués, commentaires, expressions régulières). La seule ambiguïté du
 * langage est « / » (division ou expression régulière) : heuristique classique sur le jeton précédent. Les
 * valeurs remplacées sont échappées (aucun ' " ` $ / ni retour à la ligne) : elles ne changent pas le découpage.
 */
function scanJs(code: string, onVariable: (name: string, whole: string, inString: boolean) => string): string {
  type State = 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' | 'regex'
  let state: State = 'code'
  /** Gabarits ouverts : profondeur d'accolades de chaque `${…}` en cours. */
  const templates: number[] = []
  let inClass = false
  let prevChar = ''
  let prevWord = ''
  let out = ''
  let i = 0
  while (i < code.length) {
    VARIABLE_AT.lastIndex = i
    const variable = code[i] === '{' && code[i + 1] === '{' ? VARIABLE_AT.exec(code) : null
    if (variable) {
      const inString = state === 'sq' || state === 'dq' || state === 'tpl'
      out += onVariable(variable[1], variable[0], inString)
      i += variable[0].length
      if (state === 'code') {
        prevChar = '}'
        prevWord = ''
      }
      continue
    }
    const char = code[i]
    const next = code[i + 1] ?? ''
    out += char
    i += 1
    switch (state) {
      case 'sq':
      case 'dq':
        if (char === '\\') {
          out += next
          i += 1
        } else if ((state === 'sq' && char === "'") || (state === 'dq' && char === '"') || char === '\n') {
          state = 'code'
          prevChar = '"'
          prevWord = ''
        }
        break
      case 'tpl':
        if (char === '\\') {
          out += next
          i += 1
        } else if (char === '`') {
          state = 'code'
          prevChar = '`'
          prevWord = ''
        } else if (char === '$' && next === '{') {
          out += next
          i += 1
          templates.push(0)
          state = 'code'
          prevChar = '{'
          prevWord = ''
        }
        break
      case 'line':
        if (char === '\n') state = 'code'
        break
      case 'block':
        if (char === '*' && next === '/') {
          out += next
          i += 1
          state = 'code'
        }
        break
      case 'regex':
        if (char === '\\') {
          out += next
          i += 1
        } else if (char === '[') inClass = true
        else if (char === ']') inClass = false
        else if ((char === '/' && !inClass) || char === '\n') {
          state = 'code'
          prevChar = ')'
          prevWord = ''
        }
        break
      case 'code':
        if (char === '/' && next === '/') {
          out += next
          i += 1
          state = 'line'
        } else if (char === '/' && next === '*') {
          out += next
          i += 1
          state = 'block'
        } else if (char === '/') {
          if (prevChar === '' || REGEX_AFTER_CHAR.has(prevChar) || REGEX_AFTER_WORD.has(prevWord)) {
            state = 'regex'
            inClass = false
          } else {
            prevChar = '/'
            prevWord = ''
          }
        } else if (char === "'") state = 'sq'
        else if (char === '"') state = 'dq'
        else if (char === '`') state = 'tpl'
        else if (char === '{' && templates.length > 0) {
          templates[templates.length - 1] += 1
          prevChar = '{'
          prevWord = ''
        } else if (char === '}' && templates.length > 0 && templates[templates.length - 1] === 0) {
          templates.pop()
          state = 'tpl'
        } else if (!/\s/.test(char)) {
          if (char === '}' && templates.length > 0) templates[templates.length - 1] -= 1
          if (/[\w$]/.test(char)) {
            prevWord = /[\w$]/.test(prevChar) ? prevWord + char : char
          } else prevWord = ''
          prevChar = char
        }
        break
    }
  }
  return out
}

const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/**
 * Remplace les {{variables}} d'une page article dans chaque morceau (SEC-01) :
 * - <script> (JS ou JSON-LD) : seulement DANS une chaîne " ' ` (valeur échappée, contexte « js ») ; dans le
 *   code ou un commentaire, la variable reste écrite telle quelle (B3 le signale : `scriptVariablesOutsideStrings`) ;
 * - <style> : partout, contexte « css » (échappement hexadécimal, sûr dans et hors d'une chaîne CSS).
 * Variable inconnue : laissée telle quelle. Sans `values` (page qui n'est pas une page article), code intact.
 */
export function resolveScriptParts(parts: readonly ScriptPart[], values?: TemplateValues): ScriptPart[] {
  if (!values) return [...parts]
  return parts.map((part) => {
    if (part.kind === 'css') {
      const content = part.content.replace(VARIABLE, (whole, name: string) =>
        Object.hasOwn(values, name) ? escapeValue(values[name] ?? '', 'css') : whole,
      )
      return { ...part, content }
    }
    const content = scanJs(part.content, (name, whole, inString) =>
      inString && Object.hasOwn(values, name) ? escapeValue(values[name] ?? '', 'js') : whole,
    )
    return { ...part, content }
  })
}

/**
 * Variables {{…}} placées HORS d'une chaîne dans un <script> (code ou commentaire) : jamais remplacées par le
 * site (SEC-01). B3 doit les refuser à l'enregistrement (« Put {{title}} inside quotes »).
 */
export function scriptVariablesOutsideStrings(code: string): string[] {
  const names = new Set<string>()
  for (const part of parseScriptCode(code).parts) {
    if (part.kind === 'css') continue
    scanJs(part.content, (name, whole, inString) => {
      if (!inString) names.add(name)
      return whole
    })
  }
  return [...names]
}

/** Variables {{…}} utilisées par un script (colonne « champs CMS » de l'admin, G6). */
export function scriptVariables(code: string): string[] {
  return templateVariables(code)
}
