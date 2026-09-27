import postcss, {
  CssSyntaxError,
  type AtRule,
  type ChildNode,
  type Declaration as PostcssDeclaration,
  type Root,
  type Rule,
} from 'postcss'
import {
  checkValue,
  collapseBlanks,
  foreignCharacter,
  isExemptable,
  isGrantableValue,
  MAX_VALUE_LENGTH,
  mediaList,
  normalizeValue,
  PLACEMENT_PROPERTIES,
  STATE_PROPERTIES,
  statePaintProblem,
  visible,
  type TokenSets,
} from './css-policy'
import type { Hardcoded, ScopeFlags, Violation, ZoneDef } from './types'

/**
 * Contrôle du CSS modifié par Claude : fichiers entiers avant/après, analysés par postcss ;
 * seules les déclarations ajoutées, modifiées ou retirées sont jugées, et seulement dans les règles de la zone choisie.
 */

export type CssLintContext = {
  scope: ScopeFlags
  /** Politique du design system chargé (tokenSets) : tokens par rôle, points de rupture, soulèvements. */
  policy: TokenSets
  hardcoded: Hardcoded[]
  /**
   * Zone choisie par le client, ou les zones choisies (demande à plusieurs éléments, 8 au plus), et toutes les zones
   * déclarées (zones.json).
   */
  zone: string | readonly string[]
  zones: Record<string, ZoneDef>
}

/**
 * Une déclaration par sélecteur d’une liste (`.a, .b { … }` en donne deux). `media` : '' à la racine. `property` : le
 * nom tel que le lit le navigateur (`*display`, `display !` gardent leur caractère en trop), lettres ASCII en minuscules.
 */
export type Declaration = { media: string; selector: string; property: string; value: string; important: boolean }

/** Morceau d’un sélecteur entre deux combinateurs : `.nav`, `a:hover`, `:global(h2)`… */
export type Compound = {
  raw: string
  classes: string[]
  element: string | null
  pseudoClasses: string[]
  /** Argument brut entre parenthèses de chaque pseudo-classe (même ordre que `pseudoClasses`), null sans parenthèses. */
  pseudoArguments: (string | null)[]
  pseudoElements: string[]
  universal: boolean
  id: boolean
  attribute: boolean
  /** Argument brut de `:global(…)`, s’il y en a un. */
  global: string | null
  /** Morceau vide, nom invalide (`.1x`), balise après un autre sélecteur ou caractère inattendu (`%`, `&`, `|`, `"`…). */
  malformed: boolean
}

/**
 * Paramètres d’une règle @ ; pour un @media, `(min-width:48rem)` → `(min-width: 48rem)`. Seuls les blancs CSS sont
 * réduits (collapseBlanks) : `(min-width: 48rem)` suivi de U+00A0 n’est pas un point de rupture permis.
 */
function paramsOf(at: AtRule): string {
  const params = collapseBlanks(at.params)
  if (at.name.toLowerCase() !== 'media') return params
  return params.replace(/\( /g, '(').replace(/ \)/g, ')').replace(/ ?: ?/g, ': ')
}

/** Une règle @ telle qu’on la cite : `@media (min-width: 48rem)`, `@import url(…)`, `@charset` (sans trim()). */
function atRuleOf(at: AtRule): string {
  const params = paramsOf(at)
  return params ? `@${at.name} ${params}` : `@${at.name}`
}

/** Contexte d’une règle : les paramètres d’un @media, la règle @ entière pour toute autre. */
const mediaOf = (at: AtRule) => (at.name.toLowerCase() === 'media' ? paramsOf(at) : atRuleOf(at))

/** Blanc CSS : espace, tabulation, LF, CR, FF. Jamais `\s` de JavaScript, qui compte aussi U+00A0, U+FEFF ou \v. */
const BLANK = /[ \t\n\r\f]/

/**
 * Morceaux d’un sélecteur et combinateurs entre eux, hors parenthèses et crochets. Un morceau manquant (combinateur au
 * début, à la fin ou doublé) reste `''` : `.subtitle >` ne se lit jamais comme `.subtitle`. `balanced` : parenthèses
 * et crochets refermés. Seuls les blancs CSS séparent deux morceaux : U+00A0 reste dans le morceau (`.subtitle` suivi de
 * U+00A0 est une autre classe pour le navigateur).
 */
function splitSelector(selector: string): { compounds: string[]; combinators: string[]; balanced: boolean } {
  // Morceaux aux indices pairs, combinateurs aux indices impairs.
  const items: string[] = []
  let current = ''
  let depth = 0
  let balanced = true
  const close = () => {
    if (!current) return
    // Deux morceaux séparés seulement par des blancs : combinateur descendant.
    if (items.length % 2 === 1) items.push(' ')
    items.push(current)
    current = ''
  }
  // Pas de trim() : les blancs CSS du début et de la fin sont sautés par la boucle.
  for (const char of selector) {
    if (char === '(' || char === '[') depth++
    if (char === ')' || char === ']') depth--
    if (depth < 0) balanced = false
    if (depth === 0 && (BLANK.test(char) || char === '>' || char === '+' || char === '~')) {
      close()
      if (BLANK.test(char)) continue
      if (items.length % 2 === 0) items.push('')
      items.push(char)
      continue
    }
    current += char
  }
  close()
  if (items.length % 2 === 0 && items.length) items.push('')
  return {
    compounds: items.filter((_, i) => i % 2 === 0),
    combinators: items.filter((_, i) => i % 2 === 1),
    balanced: balanced && depth === 0,
  }
}

/**
 * Sélecteur comparable d’une version à l’autre : blancs CSS réduits, combinateurs entourés d’une espace. Injectif : un
 * combinateur en trop reste dans la forme normalisée (`.subtitle >`, `> .subtitle`), tout autre caractère aussi.
 */
function normalizeSelector(selector: string): string {
  const { compounds, combinators } = splitSelector(selector)
  const joined = compounds
    .map((compound, i) => (i === 0 || combinators[i - 1] === ' ' ? compound : `${combinators[i - 1]} ${compound}`))
    .join(' ')
  // Morceau vide en tête ou en queue : une espace en trop. Pas de trim(), qui retirerait aussi U+00A0 ou U+FEFF.
  const start = compounds[0] === '' ? 1 : 0
  const end = compounds.length > 1 && compounds.at(-1) === '' ? joined.length - 1 : joined.length
  return joined.slice(start, end)
}

/**
 * Éléments d’une liste de sélecteurs, séparés par les virgules hors parenthèses et crochets. Un élément vide (virgule
 * en tête, en queue ou doublée) reste `''` : postcss (`rule.selectors`) le retire en silence quand aucun blanc ne suit
 * la virgule (`, .subtitle`, `.a,, .b`), alors que le navigateur ignore toute la règle. Pas de trim() non plus.
 */
function selectorList(selector: string): string[] {
  const items: string[] = []
  let current = ''
  let depth = 0
  for (const char of selector) {
    if (char === '(' || char === '[') depth++
    if (char === ')' || char === ']') depth--
    if (depth === 0 && char === ',') {
      items.push(current)
      current = ''
    } else {
      current += char
    }
  }
  return [...items, current]
}

const IDENT = /^-?(?:[\w-]|\\.)+/
/** Nom de classe ou de balise valide pour le navigateur (`.1x` ne l’est pas : toute la règle serait ignorée). */
const VALID_NAME = /^(?:--|-?[a-z_])[\w-]*$/i

/** Contenu entre parenthèses à partir de `start` (sur la parenthèse ouvrante) : [contenu, fin]. */
function parenthesized(text: string, start: number): [string, number] {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') depth++
    if (text[i] === ')' && --depth === 0) return [text.slice(start + 1, i), i + 1]
  }
  return [text.slice(start + 1), text.length]
}

function parseCompound(raw: string): Compound {
  const compound: Compound = {
    raw,
    classes: [],
    element: null,
    pseudoClasses: [],
    pseudoArguments: [],
    pseudoElements: [],
    universal: false,
    id: false,
    attribute: false,
    global: null,
    malformed: raw === '',
  }
  let i = 0
  while (i < raw.length) {
    const char = raw[i]
    const rest = raw.slice(i)
    if (char === '*') {
      compound.universal = true
      i++
    } else if (char === '.' || char === '#') {
      const name = IDENT.exec(rest.slice(1))?.[0] ?? ''
      if (char === '.') compound.classes.push(name)
      else compound.id = true
      if (char === '.' && !VALID_NAME.test(name)) compound.malformed = true
      i += 1 + name.length
    } else if (char === '[') {
      compound.attribute = true
      const end = raw.indexOf(']', i)
      i = end === -1 ? raw.length : end + 1
    } else if (char === ':') {
      const element = rest.startsWith('::')
      const offset = element ? 2 : 1
      const written = IDENT.exec(rest.slice(offset))?.[0] ?? ''
      const name = written.toLowerCase()
      i += offset + written.length
      let argument: string | null = null
      if (raw[i] === '(') [argument, i] = parenthesized(raw, i)
      if (element) {
        compound.pseudoElements.push(name)
      } else if (written === 'global') {
        // Deux :global dans un morceau (`:global(.x):global(h2)` s’écrit `.xh2`) : jamais une balise seule.
        compound.global = compound.global === null ? collapseBlanks(argument ?? '') : `${compound.global} ${argument ?? ''}`
      } else {
        // `:GLOBAL(p)` n’est pas lu par les CSS Modules (ils ne connaissent que `:global`) : pseudo-classe inconnue.
        compound.pseudoClasses.push(name === 'global' ? written : name)
        compound.pseudoArguments.push(argument)
      }
    } else {
      // Balise en tête du morceau ; tout autre caractère (`%`, `&`, `|`, `"`…) ou une balise plus loin : mal formé.
      const name = IDENT.exec(rest)?.[0] ?? char
      if (i !== 0 || !VALID_NAME.test(name)) compound.malformed = true
      compound.element = (compound.element ?? '') + name
      i += name.length
    }
  }
  return compound
}

export function compoundsOf(selector: string): Compound[] {
  return splitSelector(selector).compounds.map(parseCompound)
}

const PSEUDO_CLASSES = new Set([
  'hover',
  'focus-visible',
  'focus',
  'active',
  'first-child',
  'last-child',
  'first-of-type',
  'last-of-type',
  'nth-child',
  'nth-of-type',
])

/** Pseudo-classes dont l’argument est une formule An+B. */
const NTH = new Set(['nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type'])
/**
 * Formule An+B : odd, even, 3, 2n+1, -n+3… Jamais « of S », qui ouvrirait un sélecteur quelconque (`n of *`). Seuls les
 * blancs CSS séparent les termes.
 */
const AN_PLUS_B = /^[ \t\n\r\f]*(?:odd|even|[+-]?\d+|[+-]?\d*n(?:[ \t\n\r\f]*[+-][ \t\n\r\f]*\d+)?)[ \t\n\r\f]*$/i

/** Problème d’un sélecteur, quelle que soit la zone ; null s’il est permis. */
export function selectorProblem(selector: string): string | null {
  // U+00A0, U+FEFF, \v… : jamais un blanc pour le navigateur, qui lit une autre classe ou ignore toute la règle.
  const foreign = foreignCharacter(selector)
  if (foreign) {
    return (
      `Invisible or non-ASCII character (${foreign}) in a selector: only printable ASCII characters are ` +
      `allowed: \`${visible(selector)}\`.`
    )
  }
  // Un échappement peut déguiser n’importe quel nom : `.c\74 a` vaut `.cta`.
  if (selector.includes('\\')) return `Escape forbidden in a selector (\`\\\`): \`${selector}\`.`
  const { compounds: parts, combinators, balanced } = splitSelector(selector)
  if (!parts.length) {
    return 'Empty selector in a list (leading, trailing or doubled comma): the browser ignores the whole rule.'
  }
  const compounds = parts.map(parseCompound)
  // Le navigateur ignore un sélecteur mal formé, et avec lui toute la règle (liste comprise) : rien n’y est rétabli.
  if (!balanced || compounds.some((c) => c.malformed)) {
    return `Malformed selector (combinator at the start, at the end or doubled, unexpected name or character): \`${selector}\`.`
  }
  const sibling = combinators.find((combinator) => combinator === '+' || combinator === '~')
  if (sibling) {
    return (
      `Combinator \`${sibling}\` forbidden: it targets a sibling element, outside the zone; only the space and \`>\` ` +
      `are allowed: \`${selector}\`.`
    )
  }
  if (compounds.some((c) => c.universal || c.id || c.attribute)) {
    return `Global selector forbidden (\`*\`, \`#id\`, \`[attribute]\`): \`${selector}\`.`
  }
  if (compounds.some((c) => c.pseudoElements.length)) return `Pseudo-element forbidden: \`${selector}\`.`
  const pseudo = compounds.flatMap((c) => c.pseudoClasses).find((name) => !PSEUDO_CLASSES.has(name))
  if (pseudo !== undefined) return `Pseudo-class \`:${pseudo}\` forbidden: \`${selector}\`.`
  for (const { pseudoClasses, pseudoArguments } of compounds) {
    for (const [k, name] of pseudoClasses.entries()) {
      const argument = pseudoArguments[k]
      if (NTH.has(name) && (argument === null || !AN_PLUS_B.test(argument))) {
        return `\`:${name}\` only accepts an An+B formula (odd, even, 3, 2n+1, -n+3), without “of”: \`${selector}\`.`
      }
      if (!NTH.has(name) && argument !== null) return `\`:${name}\` is written without parentheses: \`${selector}\`.`
    }
  }
  // `.content :global(h2)` : une balise seule, hors du premier morceau, comme dans Article.module.css.
  if (compounds.some((c, i) => c.global !== null && (i === 0 || !/^[a-z][a-z0-9]*$/i.test(c.global)))) {
    return `\`:global\` forbidden: \`${selector}\`.`
  }
  if (!compounds[0]?.classes.length) return `The selector must start with a class of the CSS Module: \`${selector}\`.`
  return null
}

/** Classes d’un CSS Module qui appartiennent à la zone, et celles de ses zones intérieures (classe → libellé). */
export type ZoneSelectors = {
  own: Set<string>
  /** Classe racine de la (première) zone visée dans ce fichier : celle que citent les messages. */
  root: string
  childClasses: Map<string, string>
  hasChildren: boolean
  hideable: boolean
  /**
   * Classes racines de toutes les zones visées dans ce fichier (min-width permis), et celles des zones masquables
   * (display: none permis). Une seule zone : `{root}` et `{root}` si elle est masquable, comme dans le POC.
   */
  roots: Set<string>
  hideableRoots: Set<string>
}

const bare = (selector: string) => selector.replace(/^\./, '')

/**
 * Règles de la zone dans ce CSS Module. Une classe n’existe que dans son CSS Module : dans un autre fichier, la zone
 * n’a aucune classe. Zone inconnue (ou nom d’une propriété d’objet, `constructor`) : aucune classe, rien n’est permis.
 *
 * Portage (demande à plusieurs éléments, Maj + clic) : `zoneIds` peut lister plusieurs zones visées. Leurs classes
 * s’additionnent ; une zone intérieure de l’une qui est elle-même visée garde ses classes propres (elle est visée) ; la
 * racine de chacune reçoit min-width, et display: none si elle est masquable. Avec une seule zone, rien ne change.
 */
export function zoneSelectors(zoneIds: string | readonly string[], zones: Record<string, ZoneDef>, file: string): ZoneSelectors {
  const defOf = (id: string) => (Object.hasOwn(zones, id) ? zones[id] : undefined)
  const ids = typeof zoneIds === 'string' ? [zoneIds] : [...zoneIds]
  const own = new Set<string>()
  const roots = new Set<string>()
  const hideableRoots = new Set<string>()
  const childClasses = new Map<string, string>()
  let root = ''
  let hideable = false
  let hasChildren = false
  for (const id of ids) {
    const zone = defOf(id)
    const selectors = zone?.files.includes(file) ? zone.selectors : []
    for (const selector of selectors) own.add(bare(selector))
    const first = bare(selectors[0] ?? '')
    if (first) {
      roots.add(first)
      if (zone?.hideable === true) hideableRoots.add(first)
    }
    if (!root && first) {
      root = first
      hideable = zone?.hideable === true
    }
    hasChildren ||= (zone?.children?.length ?? 0) > 0
    // Seules les zones intérieures écrites dans le même CSS Module : ailleurs, leurs classes sont d’un autre fichier.
    for (const child of zone?.children ?? []) {
      const def = defOf(child)
      if (!def?.files.includes(file)) continue
      for (const selector of def.selectors) childClasses.set(bare(selector), def.label)
    }
  }
  // Une zone intérieure visée elle aussi n’est plus « d’une autre zone » : ses classes sont à la demande (une seule
  // zone visée : rien n’est retiré, comme dans le POC).
  for (const id of ids) {
    if (!ids.some((other) => other !== id && defOf(other)?.children?.includes(id))) continue
    for (const selector of defOf(id)?.selectors ?? []) childClasses.delete(bare(selector))
  }
  return { own, root, childClasses, hasChildren, hideable, roots, hideableRoots }
}

/**
 * Le sélecteur appartient-il à la zone ? Il commence par une classe de la zone ; une zone intérieure ne reçoit que du
 * placement, par un sélecteur descendant ; une balise seule n’est visée que dans une zone sans zone intérieure.
 */
export function ownershipProblem(selector: string, property: string, owner: ZoneSelectors): string | null {
  const compounds = compoundsOf(selector)
  const allowed = [...owner.own].map((own) => `.${own}`).join(', ')
  const foreign = (name: string) => {
    const child = owner.childClasses.get(name)
    if (child !== undefined) {
      return (
        `\`.${name}\` is the own rule of the zone “${child}”: a zone does not touch the rule of a zone it ` +
        `contains; only placement is allowed, through a descendant selector (\`.${owner.root} .${name}\`).`
      )
    }
    const list = allowed ? `allowed classes: ${allowed}` : 'none of its classes in this file'
    return `\`.${name}\` does not belong to this zone (${list}).`
  }
  // Premier morceau : au moins une classe, toutes de la zone (une règle sans classe vise au-delà de la zone).
  if (!compounds[0]?.classes.length) {
    return `The selector must start with a class of this zone (${allowed || 'none in this file'}): \`${selector}\`.`
  }
  // Premier morceau et morceaux intermédiaires : seulement les classes de la zone.
  for (const compound of compounds.slice(0, Math.max(1, compounds.length - 1))) {
    const outside = compound.classes.find((name) => !owner.own.has(name))
    if (outside !== undefined) return foreign(outside)
  }
  if (compounds.length < 2) return null

  const subject = compounds[compounds.length - 1]
  const outside = subject.classes.find((name) => !owner.own.has(name) && !owner.childClasses.has(name))
  if (outside !== undefined) return foreign(outside)
  const child = subject.classes.map((name) => owner.childClasses.get(name)).find((label) => label !== undefined)
  if (child !== undefined) {
    return PLACEMENT_PROPERTIES.has(property)
      ? null
      : `Inner zone “${child}”: from the container, only placement (margin, text-align, order, align-self, ` +
          `justify-self) is allowed, not \`${property}\`.`
  }
  if (!subject.classes.length && owner.hasChildren) {
    return `This zone contains other zones: target one of its classes, not a tag (\`${subject.raw}\`).`
  }
  return null
}

/** Texte sans ses commentaires, en un seul passage (un commentaire non refermé reste tel quel). */
function withoutComments(text: string): string {
  let result = ''
  let i = 0
  for (let start = text.indexOf('/*'); start !== -1; start = text.indexOf('/*', i)) {
    const end = text.indexOf('*/', start + 2)
    if (end === -1) break
    result += text.slice(i, start)
    i = end + 2
  }
  return result + text.slice(i)
}

/**
 * Nom d’une propriété tel que le lit le navigateur, commentaires retirés. postcss range dans raws.before un préfixe `*`
 * ou `_` (hacks IE) et tout ce qui précède le premier mot (chaîne, parenthèses, `:`), et dans raws.between tout ce qui
 * précède les deux-points (`!`, chaîne, parenthèses) : decl.prop reste `display`, alors que le navigateur ignore la
 * déclaration. Le nom garde ces caractères : ce n’est plus une propriété permise (règle `property`), ni la clé de
 * `display`.
 */
function writtenName(decl: PostcssDeclaration): string {
  // Blancs et points-virgules en tête : déclarations vides, sans effet.
  const prefix = withoutComments(decl.raws.before ?? '').replace(/^[ \t\n\r\f;]+/, '')
  const between = withoutComments(decl.raws.between ?? '')
  const colon = between.lastIndexOf(':')
  // Après les deux-points, raws.between ne garde que des blancs (et des commentaires, retirés).
  const suffix = colon !== -1 && /^[ \t\n\r\f]*$/.test(between.slice(colon + 1)) ? between.slice(0, colon) : between
  return collapseBlanks(`${prefix}${decl.prop}${suffix}`)
}

/** Nœud tel qu’on le cite : sélecteur, règle @ ou déclaration. */
function labelOf(node: ChildNode): string {
  if (node.type === 'rule') return collapseBlanks(node.selector)
  if (node.type === 'atrule') return atRuleOf(node)
  return node.type === 'decl' ? `${node.prop}: …` : '/* … */'
}

/**
 * Points-virgules libres d’un bloc (la racine ou un bloc @), dans l’ordre du fichier, chacun cité par ce qu’il fait
 * ignorer au navigateur : le premier nœud qui le suit hors commentaires, sinon `end`. postcss les range dans raws
 * (ownSemicolon de la règle d’avant, before du nœud suivant, after du bloc) et lit la règle suivante ; le navigateur
 * met le point-virgule dans son sélecteur, et l’ignore. Les blocs de déclarations ne sont pas parcourus : un
 * point-virgule en trop y est sans effet. Linéaire : ni next() de postcss (indexOf), ni recherche en avant par nœud.
 */
function freeSemicolons(block: Root | AtRule, where: string, end: string, found: string[]): void {
  const nodes = block.nodes ?? []
  const following: string[] = []
  let label = end
  for (let i = nodes.length - 1; i >= 0; i--) {
    following[i] = label
    if (nodes[i].type !== 'comment') label = labelOf(nodes[i])
  }
  for (const [i, node] of nodes.entries()) {
    if (node.type === 'decl') continue
    if (node.raws.before?.includes(';')) found.push(`${where}; ${node.type === 'comment' ? following[i] : labelOf(node)}`)
    if (node.type === 'atrule' && node.nodes) freeSemicolons(node, `${atRuleOf(node)} › `, '(end of block)', found)
    if (node.type === 'rule' && node.raws.ownSemicolon) found.push(`${where}; ${following[i]}`)
  }
  if (block.raws.after?.includes(';')) found.push(`${where}; ${end}`)
}

/**
 * Déclarations, règles @, imbrications et points-virgules libres d’un CSS. Lève CssSyntaxError si le CSS ne s’analyse
 * pas.
 */
export function parseCss(css: string): {
  declarations: Declaration[]
  atRules: string[]
  nested: string[]
  semicolons: string[]
} {
  const root = postcss.parse(css)
  const declarations: Declaration[] = []
  const atRules: string[] = []
  const nested: string[] = []
  const semicolons: string[] = []

  freeSemicolons(root, '', '(end of file)', semicolons)
  root.walkAtRules((at) => {
    atRules.push(atRuleOf(at))
    if (at.parent?.type !== 'root') nested.push(atRuleOf(at))
  })
  root.walkRules((rule) => {
    if (rule.parent?.type === 'rule') nested.push(rule.selector)
  })
  root.walkDecls((decl) => {
    const parent = decl.parent
    const value = normalizeValue(decl.value)
    const name = writtenName(decl)
    if (parent?.type !== 'rule') {
      const at = parent?.type === 'atrule' ? `@${(parent as AtRule).name} › ` : ''
      nested.push(`${at}${name}: ${value}`)
      return
    }
    const rule = parent as Rule
    const media = rule.parent?.type === 'atrule' ? mediaOf(rule.parent as AtRule) : ''
    // Minuscules ASCII seulement, comme le navigateur : toLowerCase() ferait un k du KELVIN SIGN (U+212A).
    const property = name.replace(/[A-Z]+/g, (letters) => letters.toLowerCase())
    // rule.selector brut, jamais rule.selectors : postcss y retire un élément vide et coupe avec trim().
    for (const selector of selectorList(rule.selector)) {
      declarations.push({ media, selector: normalizeSelector(selector), property, value, important: decl.important })
    }
  })
  return { declarations, atRules, nested, semicolons }
}

const keyOf = (d: Declaration) => `${d.media}|${d.selector}|${d.property}|${d.value}|${d.important}`

/** Éléments de `after` sans jumeau dans `before` (multiensemble), et ceux de `before` restés sans jumeau. */
function difference<T>(before: T[], after: T[], key: (item: T) => string): { added: T[]; removed: T[] } {
  const remaining = new Map<string, T[]>()
  for (const item of before) remaining.set(key(item), [...(remaining.get(key(item)) ?? []), item])
  const added: T[] = []
  for (const item of after) {
    const twins = remaining.get(key(item))
    if (twins?.length) twins.pop()
    else added.push(item)
  }
  return { added, removed: [...remaining.values()].flat() }
}

const isAllowedMedia = (media: string, sets: TokenSets) => media === '' || sets.media.has(media)
const atRuleText = (media: string) => (media.startsWith('@') ? media : `@media ${media}`)
/** Une valeur trop longue n’est citée que par son début ; un caractère invisible s’y voit (`<U+00A0>`). */
const shown = (value: string) =>
  value.length > MAX_VALUE_LENGTH ? `${visible(value.slice(0, MAX_VALUE_LENGTH))}…` : visible(value)
const lineOf = (d: Declaration) =>
  `${d.media ? `${visible(atRuleText(d.media))} › ` : ''}${visible(d.selector)} ` +
  `{ ${visible(d.property)}: ${shown(d.value)}${d.important ? ' !important' : ''} }`
/** Imbrication ou point-virgule cité : caractères invisibles montrés, séparateur ` › ` gardé tel quel. */
const shownEntry = (entry: string) => entry.split(' › ').map(visible).join(' › ')
const atRuleMessage = (at: string, sets: TokenSets) =>
  `\`${visible(at)}\`: only the @media ${mediaList(sets)} are allowed ` +
  '(no external resource, no @font-face, no @import, no @container).'

const SEMICOLON = 'Semicolon between two rules: the browser ignores the rule that follows it.'

const displayNoneMessage = (sets: TokenSets) =>
  'Hiding a zone is only allowed for a hideable zone, mobile-first: display: none in the base rule ' +
  `of the zone’s class, display restored in an @media among ${mediaList(sets)}.`

const MOVED =
  'Rule of another zone moved: the order of the other zones’ rules does not change (it decides the cascade); ' +
  'put it back in its place.'

/**
 * Première déclaration d’une autre zone, restée telle quelle, qui n’est plus à sa place parmi celles des autres zones ;
 * null si leur ordre n’a pas changé. La différence en multiensemble ne voit pas un déplacement, qui change pourtant la
 * cascade (règle de base écrite après son @media). Les déclarations ajoutées ou retirées (`changed`) sont jugées à part ;
 * la zone déplace ses propres règles comme elle veut.
 */
function movedForeign(
  before: Declaration[],
  after: Declaration[],
  changed: Set<Declaration>,
  owner: ZoneSelectors,
): Declaration | null {
  const kept = (list: Declaration[]) =>
    list.filter((d) => !changed.has(d) && ownershipProblem(d.selector, d.property, owner) !== null)
  // Mêmes déclarations des deux côtés (jumelles de la différence) : seul leur ordre peut changer.
  const keys = kept(after).map(keyOf)
  return kept(before).find((d, i) => keyOf(d) !== keys[i]) ?? null
}

/** Le sujet du sélecteur (dernier morceau) porte-t-il :hover ou :focus-visible ? */
function isHover(selector: string): boolean {
  const subject = compoundsOf(selector).at(-1)
  return subject?.pseudoClasses.some((name) => name === 'hover' || name === 'focus-visible') ?? false
}

/** États que la vérification du rendu ne voit jamais : elle ne survole, ne sélectionne ni n’active rien. */
const STATES = ['hover', 'focus-visible', 'focus', 'active']

/**
 * Premier état (:hover, :focus-visible, :focus, :active) porté par un morceau du sélecteur, le sujet comme un ancêtre
 * (`.nav:hover a` change les liens au survol de la navigation) ; null sinon.
 */
function stateOf(selector: string): string | null {
  for (const compound of compoundsOf(selector)) {
    const state = compound.pseudoClasses.find((name) => STATES.includes(name))
    if (state !== undefined) return state
  }
  return null
}

const stateMessage = (property: string, state: string) =>
  `\`${property}\` is not allowed in a state (\`:${state}\`): the render check neither hovers nor selects ` +
  'anything, and would not see what it changes (an element shrunk, moved or hidden). In :hover, :focus-visible, :focus ' +
  `and :active, only paint is allowed: ${[...STATE_PROPERTIES].join(', ')} (the lift for transform).`

const statePaintMessage = (property: string, value: string, state: string) =>
  `\`${property}: ${value}\` is not allowed in a state (\`:${state}\`): the render check neither hovers nor ` +
  'selects anything, and would not see a text or a background turned invisible. In :hover, :focus-visible, :focus and ' +
  ':active, color, background-color and background take a color token (var(--color-…)): no transparent (no ' +
  'zero-alpha color, no background: none), no inherit, currentColor, initial, unset, revert or revert-layer.'

const minWidthMessage = (root: string) =>
  `\`min-width\` is only set on the zone’s class (\`.${root}\`): on an inner element, it lets flex or ` +
  'grid shrink it to a zero width, and its text disappears. Keep min-width: auto, the default value.'

/**
 * display: none sans media, rétabli sur grand écran : parmi les `display` du même sélecteur hors media ou dans un point
 * de rupture permis, le dernier dans l’ordre du fichier (celui qui l’emporte à 64rem) n’est pas none. Un rétablissement
 * écrit avant la règle de base, ou recouvert plus loin, ne rétablit rien.
 */
function isRestored(d: Declaration, declarations: Declaration[], sets: TokenSets): boolean {
  if (d.media !== '') return false
  const last = declarations
    .filter((other) => other.selector === d.selector && other.property === 'display' && isAllowedMedia(other.media, sets))
    .at(-1)
  return last !== undefined && last.value !== 'none'
}

type Problem = { rule: string; message: string }

/** Le sélecteur est-il exactement la classe racine d’une zone visée (`.hero`) ? */
const isRootOf = (selector: string, roots: ReadonlySet<string>) => selector.startsWith('.') && roots.has(selector.slice(1))

/**
 * Portage Conduit : un style de texte s’écrit par paire, `font: var(--text-X)` + `letter-spacing: var(--text-X-tracking)`
 * (tokens.css). Une déclaration `font` ajoutée ou modifiée sur un style qui a un tracking exige, dans la même règle (même
 * media, même sélecteur), le letter-spacing de ce tracking (le raccourci font ne remet pas letter-spacing à zéro :
 * l’ordre n’y change rien) ; un letter-spacing ajouté ou modifié doit être celui du style de la règle. null si la paire
 * est juste, ou si le style n’a pas de tracking.
 */
function fontPairProblem(d: Declaration, after: Declaration[], sets: TokenSets): string | null {
  const same = (other: Declaration) => other.media === d.media && other.selector === d.selector
  const lastOf = (property: string) => after.filter((other) => same(other) && other.property === property).at(-1)
  if (d.property === 'font') {
    const tracking = sets.trackingOf.get(d.value)
    if (!tracking) return null
    if (lastOf('letter-spacing')?.value === tracking) return null
    return `The text style \`${d.value}\` goes with its tracking: also write \`letter-spacing: ${tracking}\` in the same rule.`
  }
  if (d.property === 'letter-spacing') {
    const font = lastOf('font')
    const expected = font ? sets.trackingOf.get(font.value) : undefined
    if (!expected || expected === d.value) return null
    return `The text style \`${font!.value}\` of this rule goes with \`letter-spacing: ${expected}\`, not \`${d.value}\`.`
  }
  return null
}

/**
 * Valeurs en dur accordées (🔴) qui couvrent la déclaration : sa propriété et sa valeur exactes (valeur normalisée),
 * jamais une propriété non exemptable, une valeur trop longue, un nombre négatif, un calc() ou un var() inconnu ou avec
 * valeur de repli.
 */
function grantsOf(d: Declaration, sets: TokenSets, hardcoded: Hardcoded[]): Hardcoded[] {
  if (!isExemptable(d.property) || !isGrantableValue(d.value, sets)) return []
  return hardcoded.filter((entry) => entry.property.toLowerCase() === d.property && normalizeValue(entry.value) === d.value)
}

/**
 * Juge une déclaration ajoutée ou modifiée. `granted` : les valeurs en dur accordées grâce auxquelles elle passe (vide
 * si elle passait sans elles, ou si elle est refusée).
 */
function judgeDeclaration(
  d: Declaration,
  after: Declaration[],
  sets: TokenSets,
  hardcoded: Hardcoded[],
  owner: ZoneSelectors,
): { problems: Problem[]; granted: Hardcoded[] } {
  const problems: Problem[] = []
  if (d.important) problems.push({ rule: 'important', message: '`!important` is forbidden.' })
  if (!isAllowedMedia(d.media, sets)) problems.push({ rule: 'at-rule', message: atRuleMessage(atRuleText(d.media), sets) })
  // Une seule violation `selector` par déclaration : l’appartenance n’est jugée que pour un sélecteur permis.
  const selector = selectorProblem(d.selector) ?? ownershipProblem(d.selector, d.property, owner)
  if (selector) problems.push({ rule: 'selector', message: selector })

  const problem = checkValue(d.property, d.value, sets, { hover: isHover(d.selector) })
  // Une valeur en dur accordée n’exempte que du refus de la valeur, jamais d’un refus dû à la casse (règle `case`).
  const grants = grantsOf(d, sets, hardcoded)
  const exempted = problem?.rule === 'value' && grants.length > 0
  if (problem && !exempted) {
    const elsewhere = hardcoded.find(
      (entry) => normalizeValue(entry.value) === d.value && entry.property.toLowerCase() !== d.property,
    )
    const hint = elsewhere
      ? ` The hard-coded value granted by the client is \`${elsewhere.property}: ${elsewhere.value}\`: ` +
        'write exactly this property and this value.'
      : ''
    problems.push({ rule: problem.rule, message: `${problem.message}${hint}` })
  }

  // Un état ne change que la peinture : ni taille, ni place, ni affichage, que la capture ne verrait pas. Jamais exempté.
  const state = stateOf(d.selector)
  if (state !== null && !STATE_PROPERTIES.has(d.property)) {
    problems.push({ rule: 'state', message: stateMessage(d.property, state) })
  }
  // Dans un état, le texte et son fond gardent un token de couleur : rien de transparent ni repris d’ailleurs, que la
  // capture, au repos, ne verrait pas. Jamais exempté.
  if (state !== null && statePaintProblem(d.property, d.value) !== null) {
    problems.push({ rule: 'state', message: statePaintMessage(d.property, d.value, state) })
  }
  // min-width (0, ou toute valeur en dur) laisse flex ou grid écraser un élément à une largeur nulle : seulement sur la
  // classe de la zone, dont le contrôle du cadre mesure la taille (dans un état, le refus précédent suffit). Jamais exempté.
  if (state === null && d.property === 'min-width' && d.value !== 'auto' && !isRootOf(d.selector, owner.roots)) {
    problems.push({ rule: 'min-width', message: minWidthMessage(owner.root) })
  }

  // Masquer : seulement la classe racine d’une zone déclarée masquable, rétablie dans un point de rupture.
  const hides = d.property === 'display' && d.value === 'none'
  if (hides && !(isRootOf(d.selector, owner.hideableRoots) && isRestored(d, after, sets))) {
    problems.push({ rule: 'display-none', message: displayNoneMessage(sets) })
  }
  // Style de texte (raccourci font) : le tracking du même style, dans la même règle (même sélecteur, même media).
  const pair = fontPairProblem(d, after, sets)
  if (pair) problems.push({ rule: 'font-pair', message: pair })
  return { problems, granted: exempted && problems.length === 0 ? grants : [] }
}

/**
 * Contrôle d’un CSS modifié. `granted` : les valeurs en dur accordées (entrées de `context.hardcoded`, dans leur ordre)
 * qui ont laissé passer une déclaration ajoutée. Même critère que l’exemption : l’admin les signale aux développeurs.
 */
export type CssCheck = { violations: Violation[]; granted: Hardcoded[] }

export function checkCssFiles(file: string, before: string | null, after: string | null, context: CssLintContext): CssCheck {
  const refused = (violation: Violation): CssCheck => ({ violations: [violation], granted: [] })
  if (!context.scope.style) {
    if (before === after) return { violations: [], granted: [] }
    return refused({ file, rule: 'style-change', message: 'Text mode: no style change is allowed.' })
  }
  if (after === null) return refused({ file, rule: 'file-deleted', message: 'File deleted: forbidden.' })

  let next: ReturnType<typeof parseCss>
  try {
    next = parseCss(after)
  } catch (err) {
    const message =
      err instanceof CssSyntaxError
        ? `The CSS no longer parses: ${err.reason} (line ${err.line}).`
        : `The CSS no longer parses: ${err instanceof Error ? err.message : String(err)}.`
    return refused({ file, rule: 'css-parse', message })
  }
  let previous: ReturnType<typeof parseCss> = { declarations: [], atRules: [], nested: [], semicolons: [] }
  try {
    previous = parseCss(before ?? '')
  } catch {
    // Un fichier d’avant illisible compte comme vide : tout ce qui est après est alors jugé.
  }

  const violations: Violation[] = []
  const push = (rule: string, message: string, line?: string) => {
    if (violations.some((v) => v.rule === rule && v.message === message)) return
    violations.push({ file, rule, message, ...(line ? { line } : {}) })
  }

  const sets = context.policy
  const identity = (item: string) => item
  for (const at of difference(previous.atRules, next.atRules, identity).added) {
    const media = /^@media (.*)$/i.exec(at)?.[1] ?? null
    if (media === null || !sets.media.has(media)) push('at-rule', atRuleMessage(at, sets))
  }
  for (const entry of difference(previous.nested, next.nested, identity).added) {
    push('nesting', 'Nested rule: forbidden.', shownEntry(entry))
  }
  for (const entry of difference(previous.semicolons, next.semicolons, identity).added) {
    push('css-parse', SEMICOLON, shownEntry(entry))
  }

  const owner = zoneSelectors(context.zone, context.zones, file)
  const used = new Set<Hardcoded>()
  const { added, removed } = difference(previous.declarations, next.declarations, keyOf)
  for (const declaration of added) {
    const { problems, granted } = judgeDeclaration(declaration, next.declarations, sets, context.hardcoded, owner)
    for (const { rule, message } of problems) push(rule, message, lineOf(declaration))
    for (const entry of granted) used.add(entry)
  }
  // Une déclaration retirée ne se juge que sur son sélecteur : la zone ne retire rien aux règles des autres.
  for (const declaration of removed) {
    const problem = ownershipProblem(declaration.selector, declaration.property, owner)
    if (problem) push('selector', problem, lineOf(declaration))
  }
  const moved = movedForeign(previous.declarations, next.declarations, new Set([...added, ...removed]), owner)
  if (moved) push('selector', MOVED, lineOf(moved))
  // Masquage déjà présent et rétabli avant : retirer ou recouvrir son rétablissement le rend définitif.
  for (const d of next.declarations) {
    const hidden = d.property === 'display' && d.value === 'none'
    if (hidden && isRestored(d, previous.declarations, sets) && !isRestored(d, next.declarations, sets)) {
      push('display-none', displayNoneMessage(sets), lineOf(d))
    }
  }
  return { violations, granted: context.hardcoded.filter((entry) => used.has(entry)) }
}

/** Les seuls refus de checkCssFiles. */
export function lintCssFiles(file: string, before: string | null, after: string | null, context: CssLintContext): Violation[] {
  return checkCssFiles(file, before, after, context).violations
}
