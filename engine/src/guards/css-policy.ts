import { frozenSet, type ControlDef, type TokensFile } from './types'

/**
 * Valeurs CSS permises dans l’éditeur visuel, propriété par propriété (policy de l’éditeur). Pur.
 * Une valeur se compare en entier, jamais par sous-chaîne : `var(--space-3)` passe, `calc(var(--space-3) * 2)` non.
 *
 * Portage Sanity/Conduit : la politique n’a plus de noms de tokens ni de points de rupture en dur. Elle se construit
 * à partir du design system chargé (tokenSets) : chaque propriété accepte les tokens d’un « rôle » (couleur,
 * espacement, style de texte…), déduit des groupes de tokens.json, des contrôles de zones.json et d’options explicites.
 * Un rôle vide (Conduit n’a pas de tokens d’espacement génériques) n’accepte que les mots-clés sûrs (0, auto…) : le
 * reste passe par une question au client (valeur en dur 🔴, jamais pour une propriété non exemptable).
 */

/**
 * Rôle d’un token dans la politique : quelles propriétés l’acceptent.
 * - color : color, background(-color), border-*-color, outline-color, text-decoration-color ;
 * - space : padding*, margin*, gap*, outline-offset ; spaceWide : padding* et margin* seulement (rythme de section,
 *   gouttière, retrait de page) ;
 * - font : font-family ; fontSize : font-size ; weight : font-weight ; textStyle : le raccourci `font` (styles de texte
 *   de Conduit, `font: var(--text-title-xl)`) ; tracking : letter-spacing (`var(--text-title-xl-tracking)`) ;
 * - radius : border-radius* ; shadow : box-shadow ; measure : max-width.
 */
export type TokenRole =
  | 'color'
  | 'space'
  | 'spaceWide'
  | 'font'
  | 'fontSize'
  | 'weight'
  | 'textStyle'
  | 'tracking'
  | 'radius'
  | 'shadow'
  | 'measure'

export const TOKEN_ROLES: readonly TokenRole[] = Object.freeze([
  'color',
  'space',
  'spaceWide',
  'font',
  'fontSize',
  'weight',
  'textStyle',
  'tracking',
  'radius',
  'shadow',
  'measure',
] as const)

/**
 * Tokens du site écrits comme dans le CSS (`var(--nom)`), par groupe de tokens.json, tous groupes confondus, et par rôle ;
 * soulèvements permis au survol (`lift`), points de rupture permis (`media`, « (min-width: 50.625rem) »), et pour chaque
 * style de texte le tracking qui va avec (`trackingOf` : `var(--text-title-xl)` → `var(--text-title-xl-tracking)`).
 */
export type TokenSets = {
  byGroup: Record<string, Set<string>>
  all: Set<string>
  roles: Record<TokenRole, ReadonlySet<string>>
  lift: ReadonlySet<string>
  media: ReadonlySet<string>
  trackingOf: ReadonlyMap<string, string>
}

/** Ce qui paramètre la politique en plus des groupes de tokens (tous facultatifs). */
export type PolicyOptions = {
  /**
   * Custom properties déclarées par la feuille de tokens du site (`--color-text`, `--page-inset`…). Sert à résoudre le
   * nom CSS d’un token (voir tokenVarName) ; sans elle, la convention seule décide.
   */
  declared?: ReadonlySet<string>
  /** Convention de nommage quand une custom property n’est pas déclarée (voir TokenNaming) ; `key` par défaut. */
  naming?: TokenNaming
  /** Contrôles de zones.json : `{ property, group }` ajoute les tokens du groupe au rôle de la propriété. */
  controls?: Record<string, ControlDef>
  /** Tokens ajoutés à un rôle, écrits `var(--nom)` ou `--nom` (seulement des tokens connus). */
  roles?: Partial<Record<TokenRole, readonly string[]>>
  /**
   * Soulèvements permis dans :hover et :focus-visible, écrits `var(--nom)` : `translateY(calc(var(--nom) * -1))`.
   * Par défaut, var(--space-1) et var(--space-2) quand le rôle space les contient (LyonDrive) ; aucun sinon (Conduit).
   */
  lift?: readonly string[]
  /** Points de rupture mobile-first permis, en min-width (« 50.625rem », « 64rem »). Aucun par défaut. */
  breakpoints?: readonly string[]
}

/**
 * Convention de nommage des tokens de tokens.json : `key` (contrat zones.ts : la clé EST le nom de la custom property
 * sans « -- », `color-text-muted` → `--color-text-muted`) ou `group-key` (POC LyonDrive : la clé est écrite sans son
 * groupe, `night` du groupe color → `--color-night` ; une clé qui commence déjà par le groupe n'est pas préfixée).
 */
export type TokenNaming = 'key' | 'group-key'

/**
 * Nom CSS d’un token de tokens.json (`--nom`, sans var()). Avec la liste des custom properties déclarées par la feuille de
 * tokens du site, celle qui existe l’emporte (`--clé`, puis `--groupe-clé`) ; sinon, la convention `naming` décide
 * (`key` par défaut, celle du contrat).
 */
export function tokenVarName(group: string, key: string, declared?: ReadonlySet<string>, naming: TokenNaming = 'key'): string {
  const full = `--${key}`
  const prefixed = `--${group}-${key}`
  if (declared?.has(full)) return full
  if (declared?.has(prefixed)) return prefixed
  if (naming === 'key') return full
  return key === group || key.startsWith(`${group}-`) ? full : prefixed
}

/** Groupes de tokens.json reconnus par leur nom, en minuscules. */
const GROUP_ROLES: Readonly<Record<string, TokenRole | 'text' | 'layout'>> = Object.freeze({
  color: 'color',
  colors: 'color',
  colour: 'color',
  colours: 'color',
  space: 'space',
  spacing: 'space',
  font: 'font',
  fonts: 'font',
  'font-family': 'font',
  weight: 'weight',
  weights: 'weight',
  'font-weight': 'weight',
  radius: 'radius',
  radii: 'radius',
  shadow: 'shadow',
  shadows: 'shadow',
  text: 'text',
  type: 'text',
  typography: 'text',
  'text-style': 'text',
  'text-styles': 'text',
  'font-size': 'fontSize',
  layout: 'layout',
})

/** Rôle des tokens d’un contrôle `{ property, group }` de zones.json, d’après sa propriété. */
function controlRole(property: string): TokenRole | null {
  const prop = property.toLowerCase()
  if (/^(color|background(-color)?|border(-(top|right|bottom|left))?-color|outline-color|text-decoration-color)$/.test(prop)) {
    return 'color'
  }
  if (/^(padding|margin)(-|$)/.test(prop)) return 'spaceWide'
  if (/^(gap|row-gap|column-gap|outline-offset)$/.test(prop)) return 'space'
  const direct: Record<string, TokenRole> = {
    'font-family': 'font',
    'font-size': 'fontSize',
    'font-weight': 'weight',
    font: 'textStyle',
    'letter-spacing': 'tracking',
    'box-shadow': 'shadow',
    'max-width': 'measure',
    'max-inline-size': 'measure',
  }
  if (Object.hasOwn(direct, prop)) return direct[prop]
  return /^border(-(top|bottom)-(left|right))?-radius$/.test(prop) ? 'radius' : null
}

/** Une barre oblique hors des parenthèses : le « / interligne » d’un raccourci `font`. */
function hasTopLevelSlash(value: string): boolean {
  let depth = 0
  for (const char of value) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === '/' && depth === 0) return true
  }
  return false
}

/**
 * Valeur d’un style de texte en raccourci `font` (« 500 1.5rem / 1.2 var(--font-sans) ») plutôt qu’une simple taille
 * (« 0.875rem », « clamp(…) ») : un interligne, une police, ou une graisse en tête.
 */
export const isFontShorthand = (value: string) =>
  hasTopLevelSlash(value) || /var\(--font/.test(value) || /^(?:[1-9]00|bold|normal|italic)\s+\S/i.test(value.trim())

/** Token d’un groupe « layout » : rythme ou retrait (spaceWide), largeur maximale (measure), autre (aucun rôle). */
function layoutRole(name: string): TokenRole | null {
  if (/section|gutter|inset/.test(name)) return 'spaceWide'
  if (/container|measure|max/.test(name)) return 'measure'
  return null
}

const TRACKING = /-tracking\)?$/

/** `var(--nom)` pour `--nom` ou `var(--nom)` ; null pour toute autre écriture. */
function asReference(value: string): string | null {
  const name = /^(?:var\()?(--[\w-]+)\)?$/.exec(value.trim())?.[1]
  return name ? `var(${name})` : null
}

/** Politique construite à partir des tokens du site et des options. Pure. */
export function tokenSets(tokens: TokensFile, options: PolicyOptions = {}): TokenSets {
  const byGroup: Record<string, Set<string>> = {}
  const all = new Set<string>()
  const roles = Object.fromEntries(TOKEN_ROLES.map((role) => [role, new Set<string>()])) as Record<TokenRole, Set<string>>
  // Le groupe layout est verrouillé dans l’inspecteur, mais ses tokens restent utilisables dans le CSS.
  for (const [group, definition] of Object.entries(tokens)) {
    const entries = definition?.tokens ?? {}
    const lower = group.toLowerCase()
    const known = Object.hasOwn(GROUP_ROLES, lower) ? GROUP_ROLES[lower] : undefined
    byGroup[group] = new Set()
    for (const [key, token] of Object.entries(entries)) {
      const name = tokenVarName(group, key, options.declared, options.naming)
      const reference = `var(${name})`
      byGroup[group].add(reference)
      all.add(reference)
      if (TRACKING.test(name)) {
        roles.tracking.add(reference)
        continue
      }
      if (known === 'text') roles[isFontShorthand(String(token?.value ?? '')) ? 'textStyle' : 'fontSize'].add(reference)
      else if (known === 'layout') {
        const role = layoutRole(name)
        if (role) roles[role].add(reference)
      } else if (known) roles[known].add(reference)
    }
  }
  // Contrôles : les tokens d'un groupe au nom inconnu (ni color, ni text, ni layout…) vont au rôle de la propriété
  // réglée (un tracking reste un tracking). Un groupe reconnu garde son classement : un contrôle ne l'élargit jamais
  // (`{ property: 'padding', group: 'layout' }` n'ouvre pas --page-max au padding ; validateDesignSystem le signale).
  for (const control of Object.values(options.controls ?? {})) {
    const role = control?.group ? controlRole(control.property) : null
    if (!role || !control.group || !Object.hasOwn(byGroup, control.group)) continue
    if (Object.hasOwn(GROUP_ROLES, control.group.toLowerCase())) continue
    for (const reference of byGroup[control.group]) roles[TRACKING.test(reference) ? 'tracking' : role].add(reference)
  }
  // Ajouts explicites : seulement des tokens connus (un rôle ne crée jamais de token).
  for (const role of TOKEN_ROLES) {
    for (const value of options.roles?.[role] ?? []) {
      const reference = asReference(value)
      if (reference && all.has(reference)) roles[role].add(reference)
    }
  }
  // Un style de texte va avec son tracking : le plus long préfixe qui en a un (`--text-body-strong` → `--text-body-tracking`).
  const trackingOf = new Map<string, string>()
  for (const reference of roles.textStyle) {
    let name = reference.slice(4, -1)
    while (name.lastIndexOf('-') > 2) {
      const candidate = `var(${name}-tracking)`
      if (roles.tracking.has(candidate)) {
        trackingOf.set(reference, candidate)
        break
      }
      name = name.slice(0, name.lastIndexOf('-'))
    }
  }
  const defaultLift = ['var(--space-1)', 'var(--space-2)'].filter((reference) => roles.space.has(reference))
  const lift = (options.lift ?? defaultLift)
    .map(asReference)
    .filter((reference): reference is string => reference !== null && all.has(reference))
    .map((reference) => `translateY(calc(${reference} * -1))`)
  const media = (options.breakpoints ?? []).map((width) => `(min-width: ${collapseBlanks(width)})`)
  return {
    byGroup,
    all,
    roles: Object.fromEntries(TOKEN_ROLES.map((role) => [role, frozenSet(roles[role])])) as Record<TokenRole, ReadonlySet<string>>,
    lift: frozenSet(lift),
    media: frozenSet(media),
    trackingOf,
  }
}

/** « (min-width: 48rem) et (min-width: 64rem) » : les points de rupture permis, pour les messages. */
export function mediaList(sets: Pick<TokenSets, 'media'>): string {
  const items = [...sets.media]
  if (!items.length) return 'no breakpoint (this design system declares none)'
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]
}

/**
 * Blancs CSS (espace, tabulation, LF, CR, FF) réduits à une espace, retirés au début et à la fin. Jamais `\s` ni
 * `trim()` de JavaScript : ils retirent aussi U+00A0, U+FEFF, U+2003, U+2028 ou \v, que CSS ne tient pas pour des
 * blancs (`.subtitle\u00a0` est une autre classe pour le navigateur, `block\u00a0` une valeur invalide).
 */
export function collapseBlanks(text: string): string {
  return trimSpace(text.replace(/[ \t\n\r\f]+/g, ' '))
}

/** Une espace retirée au début et à la fin (les blancs sont déjà réduits : pas de recul quadratique). */
const trimSpace = (text: string) => text.replace(/^ /, '').replace(/ $/, '')

/**
 * Blancs CSS réduits à une espace, aucun blanc collé aux parenthèses, « , » entre les éléments d’une liste. Casse
 * conservée ; tout autre caractère aussi (U+00A0 reste U+00A0, voir collapseBlanks).
 */
export function normalizeValue(value: string): string {
  return trimSpace(
    value
      .replace(/[ \t\n\r\f]+/g, ' ')
      .replace(/\( /g, '(')
      .replace(/ \)/g, ')')
      .replace(/ ?, ?/g, ', '),
  )
}

/**
 * Premier caractère hors de l’ASCII imprimable et des blancs CSS, écrit `U+00A0`, ou null. Aucun ne s’écrit dans un
 * sélecteur, un nom de propriété ou une valeur : invisible pour qui relit, il n’est jamais un blanc pour le navigateur.
 */
export function foreignCharacter(text: string): string | null {
  const match = /[^\x20-\x7e\t\n\r\f]/u.exec(text)
  return match ? codePoint(match[0]) : null
}

/** Texte cité (ligne, message) : tout caractère hors de l’ASCII imprimable s’écrit `<U+00A0>`, pour qu’il se voie. */
export function visible(text: string): string {
  return text.replace(/[^\x20-\x7e]/gu, (char) => `<${codePoint(char)}>`)
}

const codePoint = (char: string) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`

const FOREIGN_HINT = 'only printable ASCII characters are allowed'

/** Contexte d’une déclaration : le sujet du sélecteur porte-t-il :hover ou :focus-visible ? */
export type ValueContext = { hover: boolean }

/** `case` : valeur refusée seulement pour la casse d’un mot-clé (`None`) ; jamais exemptée par un accord 🔴. */
export type ValueRule = 'custom-property' | 'external' | 'property' | 'unknown-token' | 'hover-only' | 'value' | 'case'
export type ValueProblem = { rule: ValueRule; message: string }

/**
 * Longueur maximale d’une valeur (normalisée), vérifiée avant toute expression régulière : une valeur démesurée
 * ne ralentit aucun test (`\d*\.?\d+` ou les lookbehind de NEGATIVE_OR_CALC reculent en temps quadratique).
 */
export const MAX_VALUE_LENGTH = 200

/**
 * Ressource externe ou code : jamais permis, même choisi par le client en option 🔴.
 * Fonctions d’image comprises : `image(`, `image-set(`, `src(`, `element(` (la même sous-chaîne repère les préfixes
 * `-webkit-image-set(` et `-moz-element(`).
 * Un échappement CSS (`\75 rl(`, `h\74tps:\2f\2f`) peut masquer tout le reste : aucune barre oblique inverse.
 */
export const EXTERNAL_RESOURCE = /url\(|image\(|image-set\(|src\(|element\(|https?:|\/\/|expression\(|javascript:|@import|\\/i

/** Placement d’une zone intérieure : seules propriétés qu’un conteneur peut lui appliquer. */
export const PLACEMENT_PROPERTIES: ReadonlySet<string> = frozenSet([
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-block',
  'margin-inline',
  'margin-block-start',
  'margin-block-end',
  'margin-inline-start',
  'margin-inline-end',
  'text-align',
  'order',
  'align-self',
  'justify-self',
  'place-self',
])

/**
 * Seules propriétés permises dans un état (:hover, :focus-visible, :focus, :active) : la peinture, qui ne change pas la
 * mise en page (couleurs, contour, ombre, soulignement, transition, soulèvement). La vérification du rendu ne survole ni
 * ne sélectionne rien : un état qui réduirait, déplacerait ou masquerait un élément ne serait jamais mesuré.
 */
export const STATE_PROPERTIES: ReadonlySet<string> = frozenSet([
  'color',
  'background-color',
  'background',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline',
  'outline-color',
  'outline-offset',
  'box-shadow',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-color',
  'transition',
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  'transform',
])

/** Propriétés d’état dont la valeur est jugée par statePaintProblem : la couleur du texte et celle de son fond. */
export const STATE_PAINT_PROPERTIES: ReadonlySet<string> = frozenSet(['color', 'background-color', 'background'])

/**
 * Mots-clés refusés dans un état pour color, background-color et background : transparent efface le texte ou son fond,
 * les autres reprennent une couleur d’ailleurs (parent, couleur du texte, valeur initiale, feuille du navigateur), qui
 * peut être celle du fond. La vérification du rendu ne survole ni ne sélectionne rien : elle ne le verrait pas.
 */
const STATE_PAINT_KEYWORDS = new Set(['transparent', 'inherit', 'currentcolor', 'initial', 'unset', 'revert', 'revert-layer'])

/** Mots d’une valeur normalisée, séparés par une espace ou une virgule hors des parenthèses : `rgb(0 0 0 / 0)` reste entier. */
function topLevelWords(value: string): string[] {
  const found: string[] = []
  let depth = 0
  let word = ''
  for (const char of value) {
    if (char === '(') depth++
    if (char === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && (char === ' ' || char === ',')) {
      if (word) found.push(word)
      word = ''
      continue
    }
    word += char
  }
  if (word) found.push(word)
  return found
}

/** Couleur en dur d’alpha nul, transparent écrit autrement : #0000, #ffffff00, rgb(0 0 0 / 0), rgba(…, 0), hsl(… / 0%). */
function isZeroAlpha(word: string): boolean {
  if (/^#[\da-f]{3}0$|^#[\da-f]{6}00$/i.test(word)) return true
  const inner = /^(?:rgba?|hsla?)\(([^()]*)\)$/i.exec(word)?.[1]
  if (inner === undefined) return false
  const commas = inner.split(',')
  const alpha = inner.includes('/') ? inner.split('/').at(-1) : commas.length === 4 ? commas[3] : undefined
  const number = alpha?.trim() ?? ''
  return /^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/i.test(number) && parseFloat(number) === 0
}

/**
 * Dans un état (:hover, :focus-visible, :focus, :active), la valeur de color, background-color ou background qui
 * rendrait un texte ou son fond invisibles sans que la capture le voie : le mot fautif (transparent, inherit,
 * currentColor, initial, unset, revert, revert-layer, couleur d’alpha nul, background: none), ou null. Jamais
 * exemptable : un accord 🔴 ne porte que sur la valeur en dur, pas sur ce qu’elle cache au survol. Une écriture
 * échappée (`\74ransparent`) est déjà refusée par EXTERNAL_RESOURCE.
 */
export function statePaintProblem(property: string, value: string): string | null {
  const prop = property.toLowerCase()
  // Une valeur trop longue est déjà refusée (règle value, jamais exemptée) : pas d’expression régulière dessus.
  if (!STATE_PAINT_PROPERTIES.has(prop) || value.length > MAX_VALUE_LENGTH) return null
  for (const word of topLevelWords(value)) {
    const lower = word.toLowerCase()
    if (STATE_PAINT_KEYWORDS.has(lower) || isZeroAlpha(lower)) return word
    if (prop === 'background' && lower === 'none') return word
  }
  return null
}

/** Caractère d’un nom CSS (identifiant, unité, nom de fonction), non-ASCII compris, et premier caractère d’un identifiant. */
const NAME_CHAR = String.raw`[\w\u0080-\uffff-]`
const NAME_START = String.raw`[a-z_\u0080-\uffff-]`

/**
 * Ce qu’une valeur en dur (option 🔴) ne contient jamais, même accordée : tout ce qui pourrait faire sortir une zone
 * de son cadre ou lire autre chose qu’une valeur simple. Liste blanche, repère :
 * - toute parenthèse qui n’ouvre pas rgb(), rgba(), hsl(), hsla() ou var() : calc(), min(), max(), clamp(), round(),
 *   mod(), rem(), abs(), les fonctions trigonométriques, calc-size(), url(), image(), une fonction inconnue… ;
 * - tout nombre négatif, collé ou non à un opérateur (`*-1`, `/-1`, `+-1`, `(-1`, `,-1`, `0-5px`, début de valeur).
 *   Un tiret dans un identifiant (`--space-1`, `ease-out`) n’est pas un signe moins ; un exposant (`1e-5`) compte
 *   comme un négatif, par prudence ;
 * - toute barre oblique inverse : un échappement CSS peut masquer le nom d’une fonction (`c\61lc(`).
 * Le soulèvement au survol n’est jamais permis en dur : seule sa règle dédiée (TokenSets.lift) l’accepte.
 */
export const NEGATIVE_OR_CALC = new RegExp(
  [
    String.raw`\\`,
    String.raw`(?<!(?<!${NAME_CHAR})(?:rgba?|hsla?|var))\(`,
    String.raw`(?<!(?<!${NAME_CHAR})${NAME_START}${NAME_CHAR}*)-(?=\.?\d)`,
  ].join('|'),
  'i',
)

/**
 * Jamais de valeur en dur pour ces propriétés, même accordée par le client : une image n’est jamais écrite en dur,
 * un décalage (top, right, bottom, left, inset…) ne prend que 0 ou auto (il ferait sortir la zone du cadre), et un
 * contour ou une ombre ne prend qu’un token ou `1px solid` (épais ou très étalé, il masquerait le texte voisin sans que
 * le relevé des lignes recouvertes, qui ne voit ni contour ni ombre, ni la capture, qui ne survole rien, le voient).
 * Portage : le raccourci `font` (styles de texte de Conduit) contient une police, jamais en dur non plus (règle 3).
 */
const NOT_EXEMPTABLE: ReadonlySet<string> = frozenSet([
  'font-family',
  'font',
  'opacity',
  'display',
  'position',
  'transform',
  'background-image',
  'outline',
  'outline-offset',
  'box-shadow',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'inset-block',
  'inset-inline',
  'inset-block-start',
  'inset-block-end',
  'inset-inline-start',
  'inset-inline-end',
])

/** Un mot d’une valeur (les mots sont séparés par une espace). */
type Atom = (word: string, sets: TokenSets) => boolean

/** Token d’un rôle de la politique (voir TokenRole) : le rôle dépend du design system chargé. */
const role =
  (name: TokenRole): Atom =>
  (word, sets) =>
    sets.roles[name].has(word)
/**
 * Mots-clés CSS écrits en minuscules (`none`, jamais `NONE` ni `None`) : les contrôles suivants comparent les valeurs
 * telles quelles (`display: none`).
 */
const keyword =
  (...words: string[]): Atom =>
  (word) =>
    words.includes(word)
/** currentColor : seul mot-clé à casse libre (on l’écrit d’ordinaire en camelCase). */
const CURRENT_COLOR: Atom = (word) => word.toLowerCase() === 'currentcolor'
const either =
  (...atoms: Atom[]): Atom =>
  (word, sets) =>
    atoms.some((atom) => atom(word, sets))

/** Valeurs permises, dites à Claude : fixe, ou calculée d’après les tokens du design system chargé. */
type Hint = string | ((sets: TokenSets) => string)
type Rule = { hint: Hint; accepts: (value: string, sets: TokenSets) => boolean }

const hintOf = (rule: Rule, sets: TokenSets) => (typeof rule.hint === 'string' ? rule.hint : rule.hint(sets))

/** De `min` à `max` mots séparés par une espace, chacun accepté par `atom`. */
const words = (min: number, max: number, atom: Atom, hint: Hint): Rule => ({
  hint,
  accepts: (value, sets) => {
    const parts = value.split(' ')
    return parts.length >= min && parts.length <= max && parts.every((part) => atom(part, sets))
  },
})
const one = (atom: Atom, hint: Hint) => words(1, 1, atom, hint)
const oneOf = (...values: string[]) => one(keyword(...values), values.join(', '))
/** Valeur entière parmi une liste (une valeur peut contenir des espaces : `0 0 auto`). */
const whole = (...values: string[]): Rule => ({ hint: values.join(', '), accepts: (value) => values.includes(value) })

/** « a », « a ou b », « a, b ou c ». */
const alternatives = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} or ${items.at(-1)}` : (items[0] ?? ''))

/**
 * Tokens d’un rôle tels qu’on les cite : `var(--color-…)` quand ils partagent un préfixe (`--color-`), sinon la liste ;
 * null pour un rôle vide.
 */
function pattern(sets: TokenSets, name: TokenRole): string | null {
  const names = [...sets.roles[name]].map((reference) => reference.slice(4, -1))
  if (!names.length) return null
  let prefix = names[0]
  for (const other of names) while (!other.startsWith(prefix)) prefix = prefix.slice(0, -1)
  prefix = prefix.slice(0, prefix.lastIndexOf('-') + 1)
  if (names.length > 1 && prefix.length > 2) {
    const tracking = names.every((entry) => entry.endsWith('-tracking'))
    return `var(${prefix}…${tracking ? '-tracking' : ''})`
  }
  return names.map((entry) => `var(${entry})`).join(', ')
}

/** « un token de couleur (var(--color-…)) », ou null quand le design system n’en a aucun. */
const tokenPhrase = (sets: TokenSets, name: TokenRole, phrase: string) => {
  const found = pattern(sets, name)
  return found ? `${phrase} (${found})` : null
}

/** Rappel ajouté quand un rôle est vide : pas de valeur inventée, une question au client. */
const NO_TOKEN = (what: string) =>
  ` (this design system has no ${what} token: for another value, ask the client with ask_client)`

/** Indice « token du rôle, ou ces mots-clés » ; le rôle vide le dit. */
const tokenHint =
  (name: TokenRole, phrase: string, what: string, ...keywords: string[]): Hint =>
  (sets) => {
    const found = tokenPhrase(sets, name, phrase)
    return found ? alternatives([found, ...keywords]) : `${alternatives(keywords)}${NO_TOKEN(what)}`
  }

const COLOR = either(role('color'), keyword('transparent', 'inherit'), CURRENT_COLOR)
/** padding et margin : tokens d’espacement, rythme de section, gouttière et retrait de page (spaceWide), ou 0. */
const SPACE = either(role('space'), role('spaceWide'), keyword('0'))
const MARGIN = either(SPACE, keyword('auto'))
const GAP = either(role('space'), keyword('0'))
/**
 * Décalage (top, right, bottom, left, inset) : 0 ou auto seulement, qui ne déplacent rien. Un token déplacerait la zone
 * ou l’un de ses éléments (position: relative), hors de son parent ou de la page, et la capture ne le verrait pas dans
 * :hover, :focus-visible ou :active.
 */
const INSET = keyword('0', 'auto')
const INSET_HINT =
  '0 or auto (top, right, bottom, left and inset move neither the zone nor its elements: to add space, use margin or padding)'
const RADIUS = either(role('radius'), keyword('0'))
const BORDER_COLOR = either(role('color'), keyword('transparent'), CURRENT_COLOR)
/** Largeur maximale : none, 100 %, ou un token de largeur (measure). */
const MEASURE = either(keyword('none', '100%'), role('measure'))

const TRANSITION_PROPERTIES = [
  'color',
  'background-color',
  'border-color',
  'box-shadow',
  'transform',
  'outline-color',
  'text-decoration-color',
]
const EASINGS = ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear']
const ALIGNMENTS = [
  'start',
  'end',
  'center',
  'stretch',
  'baseline',
  'flex-start',
  'flex-end',
  'space-between',
  'space-around',
  'space-evenly',
  'normal',
  'left',
  'right',
]

/** Durée de 1 ms à 1 s : `200ms`, `0.2s`. */
function isDuration(word: string): boolean {
  const match = /^(\d*\.?\d+)(ms|s)$/i.exec(word)
  if (!match) return false
  const ms = Number(match[1]) * (match[2].toLowerCase() === 's' ? 1000 : 1)
  return ms >= 1 && ms <= 1000
}

/** Liste séparée par des virgules dont chaque élément est accepté. */
const list =
  (item: (entry: string) => boolean) =>
  (value: string): boolean =>
    value.split(', ').every(item)

/** « propriété durée [courbe] » */
function isTransition(entry: string): boolean {
  const [property, duration, easing, ...rest] = entry.split(' ')
  return (
    rest.length === 0 &&
    TRANSITION_PROPERTIES.includes(property) &&
    isDuration(duration ?? '') &&
    (easing === undefined || EASINGS.includes(easing))
  )
}

/** `none`, `0`, ou exactement `1px`, `solid` et une couleur, dans n’importe quel ordre. */
function isBorder(value: string, sets: TokenSets): boolean {
  if (['none', '0'].includes(value)) return true
  const parts = value.split(' ')
  return (
    parts.length === 3 &&
    parts.filter((part) => part === '1px').length === 1 &&
    parts.filter((part) => part === 'solid').length === 1 &&
    parts.filter((part) => BORDER_COLOR(part, sets)).length === 1
  )
}

/** Entier entre `min` et `max`, sans signe `+`. */
const integerIn = (value: string, min: number, max: number) =>
  /^-?\d+$/.test(value) && Number(value) >= min && Number(value) <= max

function isGridColumns(value: string): boolean {
  if (value === 'none') return true
  const repeat = /^repeat\((\d+), (1fr|minmax\(0, 1fr\))\)$/.exec(value)
  if (repeat) return integerIn(repeat[1], 1, 6)
  const fractions = value.split(' ')
  return fractions.length <= 6 && fractions.every((part) => /^[1-9]\d*fr$/.test(part))
}

function isGridPlacement(value: string): boolean {
  if (value === '1 / -1') return true
  const span = /^span (\d+)$/.exec(value)
  return span !== null && integerIn(span[1], 1, 6)
}

const COLOR_HINT = tokenHint('color', 'a color token', 'color', 'transparent', 'inherit', 'currentColor')
/** « les tokens d’espacement (var(--space-…)), var(--page-inset), … ou 0 » ; sans token d’espacement, le rappel. */
const SPACE_HINT = (sets: TokenSets) => {
  const space = tokenPhrase(sets, 'space', 'the spacing tokens')
  const wide = [...sets.roles.spaceWide].filter((reference) => !sets.roles.space.has(reference))
  const text = alternatives([...(space ? [space] : []), ...wide, '0'])
  return space ? text : `${text}${NO_TOKEN('generic spacing')}`
}
const BORDER_HINT = 'none, 0, or 1px solid with a color token, transparent or currentColor'
const GAP_HINT = tokenHint('space', 'a spacing token', 'spacing', '0')
const TRANSITION_HINT =
  `none, or “property duration [easing]” separated by commas (properties: ${TRANSITION_PROPERTIES.join(', ')}; ` +
  `duration from 1 ms to 1 s; easings: ${EASINGS.join(', ')})`
const RADIUS_HINT = tokenHint('radius', 'a radius token', 'radius', '0')
const LIFT_HINT = (sets: TokenSets) =>
  sets.lift.size ? `none, or ${alternatives([...sets.lift])} in :hover or :focus-visible` : 'none'
/** Style de texte (raccourci font) : le tracking qui l’accompagne est exigé dans la même règle (css-lint, font-pair). */
const TEXT_STYLE_HINT = (sets: TokenSets) => {
  const found = tokenPhrase(sets, 'textStyle', 'a text style')
  return found
    ? `${found} or inherit, with letter-spacing on the tracking of the same style in the same rule`
    : `inherit${NO_TOKEN('text style')}`
}

const RULES: Record<string, Rule> = {
  color: one(COLOR, COLOR_HINT),
  'background-color': one(COLOR, COLOR_HINT),
  'border-color': one(COLOR, COLOR_HINT),
  'border-top-color': one(COLOR, COLOR_HINT),
  'border-right-color': one(COLOR, COLOR_HINT),
  'border-bottom-color': one(COLOR, COLOR_HINT),
  'border-left-color': one(COLOR, COLOR_HINT),
  'outline-color': one(COLOR, COLOR_HINT),
  'text-decoration-color': one(COLOR, COLOR_HINT),
  background: one(either(role('color'), keyword('transparent')), tokenHint('color', 'a color token', 'color', 'transparent')),
  'background-image': oneOf('none'),
  'font-family': one(either(role('font'), keyword('inherit')), tokenHint('font', 'a font token', 'font', 'inherit')),
  'font-size': one(either(role('fontSize'), keyword('inherit')), tokenHint('fontSize', 'a size token', 'size', 'inherit')),
  'font-weight': one(either(role('weight'), keyword('inherit')), tokenHint('weight', 'a weight token', 'weight', 'inherit')),
  // Styles de texte de Conduit (`font: var(--text-title-xl)`, `letter-spacing: var(--text-title-xl-tracking)`).
  font: one(either(role('textStyle'), keyword('inherit')), TEXT_STYLE_HINT),
  'letter-spacing': one(either(role('tracking'), keyword('inherit')), tokenHint('tracking', 'a tracking token', 'tracking', 'inherit')),
  'font-style': oneOf('normal', 'italic'),
  'line-height': {
    hint: 'normal, or a unitless number from 0.9 to 2.5',
    accepts: (value) => value === 'normal' || (/^\d*\.?\d+$/.test(value) && Number(value) >= 0.9 && Number(value) <= 2.5),
  },
  'text-transform': oneOf('none', 'uppercase', 'lowercase', 'capitalize'),
  'text-wrap': oneOf('wrap', 'balance', 'pretty'),
  'text-align': oneOf('left', 'center', 'right', 'start', 'end'),
  'text-decoration': oneOf('none', 'underline'),
  'text-decoration-line': oneOf('none', 'underline'),
  padding: words(1, 4, SPACE, (sets) => `1 to 4 values among ${SPACE_HINT(sets)}`),
  margin: words(1, 4, MARGIN, (sets) => `1 to 4 values among ${SPACE_HINT(sets)}, or auto`),
  gap: words(1, 2, GAP, (sets) =>
    sets.roles.space.size ? `1 or 2 ${tokenPhrase(sets, 'space', 'spacing tokens')} or 0` : `0${NO_TOKEN('spacing')}`,
  ),
  'row-gap': one(GAP, GAP_HINT),
  'column-gap': one(GAP, GAP_HINT),
  inset: words(1, 4, INSET, `1 to 4 values among ${INSET_HINT}`),
  'border-radius': words(1, 4, RADIUS, (sets) =>
    sets.roles.radius.size ? `1 to 4 ${tokenPhrase(sets, 'radius', 'radius tokens')} or 0` : `0${NO_TOKEN('radius')}`,
  ),
  'box-shadow': one(either(role('shadow'), keyword('none')), tokenHint('shadow', 'a shadow token', 'shadow', 'none')),
  border: { hint: BORDER_HINT, accepts: isBorder },
  outline: { hint: BORDER_HINT, accepts: isBorder },
  'border-width': oneOf('0', '1px'),
  'border-style': oneOf('solid', 'none'),
  'outline-offset': one(GAP, GAP_HINT),
  transition: {
    hint: TRANSITION_HINT,
    accepts: (value) => value === 'none' || list(isTransition)(value),
  },
  'transition-property': {
    hint: TRANSITION_PROPERTIES.join(', '),
    accepts: list((entry) => TRANSITION_PROPERTIES.includes(entry)),
  },
  'transition-duration': { hint: 'a duration from 1 ms to 1 s (200ms, 0.2s)', accepts: list(isDuration) },
  'transition-timing-function': { hint: EASINGS.join(', '), accepts: list((entry) => EASINGS.includes(entry)) },
  transform: {
    hint: LIFT_HINT,
    accepts: (value, sets) => value === 'none' || sets.lift.has(value),
  },
  display: oneOf('block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'none'),
  'flex-direction': oneOf('row', 'column', 'row-reverse', 'column-reverse'),
  'flex-wrap': oneOf('wrap', 'nowrap', 'wrap-reverse'),
  flex: whole('none', 'auto', '1', '0 0 auto', '1 1 0'),
  'flex-grow': { hint: 'a digit from 0 to 9', accepts: (value) => /^\d$/.test(value) },
  'flex-shrink': { hint: 'a digit from 0 to 9', accepts: (value) => /^\d$/.test(value) },
  order: { hint: 'an integer from -9 to 9', accepts: (value) => integerIn(value, -9, 9) },
  'grid-template-columns': {
    hint: 'none, repeat(n, 1fr) or repeat(n, minmax(0, 1fr)) with n from 1 to 6, or 1 to 6 fractions (2fr 1fr)',
    accepts: isGridColumns,
  },
  'grid-column': { hint: 'span n (n from 1 to 6) or 1 / -1', accepts: isGridPlacement },
  'grid-row': { hint: 'span n (n from 1 to 6) or 1 / -1', accepts: isGridPlacement },
  width: oneOf('auto', '100%', 'fit-content'),
  'max-width': one(MEASURE, (sets) => ['none', '100%', ...sets.roles.measure].join(', ')),
  // Portage Conduit : le site écrit les tailles en propriétés logiques. En écriture horizontale (la seule du site),
  // inline-size vaut width et max-inline-size vaut max-width : mêmes valeurs permises, rien de plus.
  'inline-size': oneOf('auto', '100%', 'fit-content'),
  'max-inline-size': one(MEASURE, (sets) => ['none', '100%', ...sets.roles.measure].join(', ')),
  'min-width': oneOf('0', 'auto'),
  height: oneOf('auto'),
  opacity: oneOf('1'),
  position: oneOf('static', 'relative'),
}

for (const property of [
  'align-items',
  'align-self',
  'align-content',
  'justify-content',
  'justify-items',
  'justify-self',
  'place-items',
  'place-self',
  'place-content',
]) {
  RULES[property] = oneOf(...ALIGNMENTS)
}
// Variantes de margin et padding : une valeur par côté, une ou deux pour block et inline.
for (const [base, atom, hint] of [
  ['padding', SPACE, SPACE_HINT],
  ['margin', MARGIN, (sets: TokenSets) => `${SPACE_HINT(sets)}, or auto`],
] as const) {
  for (const side of ['top', 'right', 'bottom', 'left', 'block-start', 'block-end', 'inline-start', 'inline-end']) {
    RULES[`${base}-${side}`] = one(atom, (sets) => `one value among ${hint(sets)}`)
  }
  for (const axis of ['block', 'inline']) RULES[`${base}-${axis}`] = words(1, 2, atom, (sets) => `1 or 2 values among ${hint(sets)}`)
}
for (const side of ['top', 'right', 'bottom', 'left']) {
  RULES[side] = one(INSET, INSET_HINT)
  RULES[`border-${side}`] = { hint: BORDER_HINT, accepts: isBorder }
}
for (const corner of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) {
  RULES[`border-${corner}-radius`] = one(RADIUS, RADIUS_HINT)
}
Object.freeze(RULES)

/** Propriétés CSS que l’éditeur connaît (liste blanche), gelée. */
export const ALLOWED_PROPERTIES: ReadonlySet<string> = frozenSet(Object.keys(RULES))

/**
 * Toute référence `var(--nom`, suivie de `)` ou d’une valeur de repli (`,`), quelle que soit la casse de `var` : son nom
 * seul est comparé aux tokens, et il doit être exact (`VAR(--SPACE-3)` refusé, `var(--nope, red)` aussi).
 */
const TOKEN_REFERENCE = /var\(--([\w-]+)(?=[),])/gi

/** Premier problème d’une déclaration, ou null si elle est permise. La propriété est comparée en minuscules. */
export function checkValue(property: string, value: string, tokens: TokenSets, context: ValueContext): ValueProblem | null {
  // Avant toLowerCase() : le KELVIN SIGN (U+212A) y devient un k, alors que le navigateur ne connaît pas la propriété.
  const inProperty = foreignCharacter(property)
  if (inProperty) {
    return {
      rule: 'property',
      message: `Invisible or non-ASCII character (${inProperty}) in a property name: ${FOREIGN_HINT}.`,
    }
  }
  const prop = property.toLowerCase()
  const normalized = normalizeValue(value)
  if (prop.startsWith('--')) {
    return { rule: 'custom-property', message: `No new token (\`${prop}\`): use those of the design system.` }
  }
  // Avant toute expression régulière ; le message ne recopie pas la valeur.
  if (normalized.length > MAX_VALUE_LENGTH) {
    return {
      rule: 'value',
      message: `Value too long for \`${prop}\`: ${normalized.length} characters (${MAX_VALUE_LENGTH} at most).`,
    }
  }
  // `block\u00a0` n’est pas `block` pour le navigateur : la déclaration serait ignorée.
  const inValue = foreignCharacter(normalized)
  if (inValue) {
    return {
      rule: 'value',
      message: `Invisible or non-ASCII character (${inValue}) in the value of \`${prop}\`: ${FOREIGN_HINT}.`,
    }
  }
  if (EXTERNAL_RESOURCE.test(normalized)) {
    return {
      rule: 'external',
      message: `External resource forbidden (url(), @import, web address), even if chosen by the client: \`${prop}: ${normalized}\`.`,
    }
  }
  // Object.hasOwn : « constructor » ou « toString » ne sont pas des propriétés CSS permises.
  const rule = Object.hasOwn(RULES, prop) ? RULES[prop] : undefined
  if (!rule) return { rule: 'property', message: `Property not allowed in the editor: \`${prop}\`.` }
  const unknown = [...normalized.matchAll(TOKEN_REFERENCE)]
    .map((match) => `var(--${match[1]})`)
    .find((reference) => !tokens.all.has(reference))
  if (unknown) return { rule: 'unknown-token', message: `Unknown token: \`${unknown}\`.` }
  if (prop === 'transform' && tokens.lift.has(normalized) && !context.hover) {
    return { rule: 'hover-only', message: `The lift \`${normalized}\` is only allowed in :hover or :focus-visible.` }
  }
  if (!rule.accepts(normalized, tokens)) {
    // Refusée seulement pour sa casse (`None`) : le dire, plutôt que redonner la liste, sous une règle qu’aucun
    // accord 🔴 n’exempte.
    const lower = normalized.toLowerCase()
    const caseOnly = lower !== normalized && rule.accepts(lower, tokens)
    const advice = caseOnly ? `Write CSS keywords in lowercase: \`${lower}\`` : `Allowed: ${hintOf(rule, tokens)}`
    return { rule: caseOnly ? 'case' : 'value', message: `Value not allowed for \`${prop}\`: \`${normalized}\`. ${advice}.` }
  }
  return null
}

/** Une valeur en dur accordée par le client (option 🔴) peut-elle exempter cette propriété ? */
export function isExemptable(property: string): boolean {
  const prop = property.toLowerCase()
  return Object.hasOwn(RULES, prop) && !NOT_EXEMPTABLE.has(prop)
}

/** Composante d’une couleur en dur : un nombre, un pourcentage, ou l’angle de la teinte de hsl(). */
const COLOR_NUMBER = String.raw`(?:\d+(?:\.\d+)?|\.\d+)(?:%|deg|rad|grad|turn)?`

/**
 * rgb(), rgba(), hsl() ou hsla() à composantes numériques, écrite avec des virgules (`rgba(1, 2, 3, 0.5)`) ou des
 * espaces (`rgb(1 2 3 / 0.5)`), dans une valeur normalisée (normalizeValue).
 */
const NUMERIC_COLOR = new RegExp(
  String.raw`^(?:rgba?|hsla?)\((?:${COLOR_NUMBER}(?:, ${COLOR_NUMBER}){2,3}|${COLOR_NUMBER}(?: ${COLOR_NUMBER}){2}(?: ?/ ?${COLOR_NUMBER})?)\)$`,
  'i',
)

/** Chaque appel de rgb(), rgba(), hsl() ou hsla(), jusqu’à sa parenthèse fermante ou jusqu’à une parenthèse imbriquée. */
const COLOR_CALL = /(?:rgba?|hsla?)\([^()]*\)?/gi

/**
 * Couleur en dur que le contrôle du contraste ne saurait pas mesurer (relecture de la tâche 26) : un appel de rgb(),
 * rgba(), hsl() ou hsla() dont les composantes ne sont pas toutes numériques (NUMERIC_COLOR : couleur relative
 * `rgb(from var(--color-night) r g b)`, que Chrome calcule en `color(srgb …)`, `none`, var() dans la couleur, parenthèse
 * non fermée), ou un `#` qui n’ouvre pas un hexadécimal de 3 ou 6 chiffres (ni alpha en hexadécimal : `rgb(… / 0.5)`,
 * ni écriture invalide). Accordée, une telle couleur rendait inconnu le contraste d’après : un logo de la couleur de son
 * fond, ou d’alpha nul, passait le plancher du logotype. `value` est normalisée (normalizeValue) et courte
 * (MAX_VALUE_LENGTH).
 */
export function unmeasurableColor(value: string): boolean {
  if ((value.match(COLOR_CALL) ?? []).some((call) => !NUMERIC_COLOR.test(call))) return true
  return (value.match(/#[\w-]*/g) ?? []).some((hash) => !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hash))
}

/**
 * Une valeur en dur (option 🔴) peut-elle être accordée ? Seulement si elle est courte (longueur vérifiée avant toute
 * expression régulière), sans nombre négatif ni fonction autre que rgb(), rgba(), hsl(), hsla() et var()
 * (NEGATIVE_OR_CALC), sans couleur que le contrôle du contraste ne saurait pas mesurer (unmeasurableColor), et si chaque
 * `var(` ouvre un token existant, sans valeur de repli : `var(--color-ink, red)` vaut red, `var(--nope, 10px)` vaut
 * 10px. Jamais avec un caractère invisible ou non ASCII (foreignCharacter).
 */
export function isGrantableValue(value: string, tokens: TokenSets): boolean {
  const normalized = normalizeValue(value)
  if (normalized.length > MAX_VALUE_LENGTH || foreignCharacter(normalized)) return false
  if (NEGATIVE_OR_CALC.test(normalized) || unmeasurableColor(normalized)) return false
  return (normalized.match(/var\([^)]*\)?/gi) ?? []).every((reference) => tokens.all.has(reference))
}
