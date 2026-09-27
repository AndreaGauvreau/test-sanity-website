import { formatRatio, textContrast, type BackgroundLayer } from './contrast'
// Neutralisation des textes cités (décision 20) : une seule règle pour tout le moteur, celle d'engine-claude.
import { quoteData } from '../claude/quote'

/**
 * Relevé unique d’une zone : lignes, taille, couleur, fond et contraste de chaque texte,
 * calculés côté Node à partir du relevé brut de la page. Pur.
 * Le relevé brut (RawZone) vient de READ_ZONE (visual.ts) ; il sert à la capture d’avant, à celle d’après
 * et à l’outil measure.
 */

/** Rectangle d’une ligne de texte (Range.getClientRects), réduit à sa hauteur. */
export type LineRect = { top: number; bottom: number }

export type Box = { left: number; top: number; width: number; height: number }

/**
 * Élément qui porte du texte en propre ; key = rang de chaque ancêtre depuis la racine de la zone (« 1.0 »),
 * '' pour la racine.
 */
export type RawText = {
  key: string
  text: string
  rects: LineRect[]
  color: string
  fontSize: number
  fontWeight: string
  /** Fonds traversés, du plus proche au plus lointain, jusqu’au premier fond opaque. */
  layers: BackgroundLayer[]
  /** Élément rendu, mais de largeur ou de hauteur nulle (flex: 1 1 0 avec min-width: 0) : son texte déborde ou disparaît. */
  collapsed: boolean
  /**
   * Lignes de ses propres nœuds de texte (un rectangle de Range.getClientRects par nœud et par ligne, sans le texte de ses
   * descendants), dans l’ordre du texte, 200 au plus.
   */
  ownLines: number
  /**
   * Rangs (depuis 0) de celles de ces lignes dont l’un des points de la grille (READ_ZONE : les 3 points de la décision 15,
   * une abscisse tous les demi-corps, les bords et le milieu des éléments de la zone qui la chevauchent, 8 hauteurs et
   * plus dans sa bande) n’est pas vu : document.elementFromPoint n’y renvoie ni son élément, ni, dans ses lettres, un
   * descendant en ligne qui ne peint rien, au repos comme dans un état ; ou document.caretPositionFromPoint ne retombe
   * pas dans son nœud de texte. Un autre élément la recouvre (le fond d’un voisin, le padding d’un mot mis en avant, avec
   * ou sans fond), elle est coupée, ou hors de la page.
   */
  coveredLines: number[]
}

/**
 * État mesuré en plus du repos (décision 16) : survol (:hover), clic (:hover et :active), focus clavier (:focus et
 * :focus-visible), focus après un clic (:focus seul), et leurs combinaisons : survol avec le focus après un clic (:hover et
 * :focus), survol avec le focus clavier (:hover, :focus et :focus-visible), clic qui donne le focus (:hover, :active et
 * :focus), clic avec le focus clavier (:hover, :active, :focus et :focus-visible : Tab, puis bouton de la souris enfoncé
 * sur l’élément). Les 8 combinaisons que Chrome donne (STATE_CLASSES, visual.ts). Les ancêtres d’un élément survolé ou
 * cliqué le sont aussi ; ceux d’un élément focalisé sont en :focus-within.
 */
export type StateKind =
  'hover' | 'active' | 'focus-visible' | 'focus' | 'hover-focus' | 'hover-focus-visible' | 'active-focus' | 'active-focus-visible'

/** Peinture d’un texte : ce que demande le contraste (RawText sans les lignes). */
export type RawPaint = Pick<RawText, 'key' | 'text' | 'color' | 'fontSize' | 'fontWeight' | 'layers'>

/**
 * Peinture de tous les textes rendus d’une occurrence (READ_ZONE), dans l’ordre du document : les MAX_PAINTS premiers ;
 * `total` les compte tous, relevés ou non (au-delà de MAX_PAINTS, le relevé est partiel).
 */
export type RawPaints = { texts: RawPaint[]; total: number }

/**
 * Textes de la zone dans un état forcé (planStates, visual.ts). `hover` : profondeur jusqu’à laquelle les éléments qui
 * portent un texte, et leurs ancêtres dans la zone, sont survolés (et cliqués, pour active et active-focus), comme sous un
 * pointeur posé à cette profondeur : -1 pour les seuls ancêtres de la zone (pointeur sur son parent), 0 pour sa racine, 1
 * pour ses enfants… ; `focus` : profondeur des éléments focalisés, dans la zone (0 : sa racine) ou au-dessus (-1 : son
 * parent, -2 : son grand-parent…) ; null quand l’état n’en a pas.
 */
export type RawState = RawPaints & { kind: StateKind; hover: number | null; focus: number | null }

/**
 * Texte qu'une règle de peinture ajoutée ou modifiée peint sous le minimum, là où elle peut s’appliquer (décision 19, 4e
 * relecture ; visual.ts, judgeRules) : `rule` écrite comme dans le CSS Module, avec les propriétés en cause
 * (« .content { color } ») ; à une largeur, pour une occurrence (rang depuis 0) parmi `occurrences`, au repos (`kind`
 * null) ou dans un état forcé ; `ratio` et `required`, le contraste du texte et le minimum exigé. `masked` : texte qu’une
 * règle plus précise de la même modification lui reprend, jugé sans elle. `apart` : dans une zone à contenu libre (HTML
 * venu du CMS, 5e relecture), texte que la règle peint jugée seule, sans les autres règles ajoutées ou modifiées de la
 * modification, de tout groupe, hors celles du même sélecteur et celles qui visent toute la zone. `broad` : règle large
 * (elle atteint ce texte par héritage d’un élément sans texte à lui, ou par un sujet sans classe ni balise de bloc), qui
 * peindrait ailleurs des textes courants : le minimum est alors 4,5, quelle que soit la taille du texte.
 */
export type RuleExposure = {
  rule: string
  viewport: number
  occurrence: number
  occurrences: number
  kind: StateKind | null
  key: string
  text: string
  ratio: number
  required: number
  masked: boolean
  apart: boolean
  broad: boolean
}

/** Décalage d’un élément par position: relative (px, positif vers le bas et vers la droite). */
export type Offset = { key: string; top: number; left: number }

/** Relevé brut de la zone dans la page, tel que READ_ZONE le renvoie. */
export type RawZone = {
  box: Box
  /**
   * Boîtes CSS de la zone (getClientRects) : 0 si elle n’est pas rendue (display: none, ancêtre masqué,
   * display: contents). Une zone rendue peut avoir une taille nulle (flex: 1 1 0 avec min-width: 0).
   */
  boxes: number
  /** Boîte de contenu du parent (sans bordures ni marges intérieures), à gauche et à droite. */
  parent: { left: number; width: number } | null
  margins: { top: number; right: number; bottom: number; left: number }
  /**
   * Éléments de la zone (racine comprise, clé '') déplacés par position: relative : décalage utilisé en px, vers le bas
   * (top) et vers la droite (left) ; bottom: 96px donne top: -96. Même clé que les textes.
   */
  offsets: Offset[]
  /**
   * Étendue du contenu de la zone (rectangles non vides de tout son contenu, même débordant de sa boîte), en px depuis
   * le coin haut gauche de la page ; null si rien n’est rendu. Poussé à gauche ou en haut de la page, il disparaît sans
   * défilement possible.
   */
  content: { left: number; top: number; right: number } | null
  /** Largeur de la page, sans barre de défilement. */
  pageWidth: number
  style: {
    fontSize: string
    lineHeight: string
    maxWidth: string
    color: string
    opacity: string
    display: string
    textAlign: string
    gridTemplateColumns: string
  }
  /**
   * Mots mis en avant (*…* dans le CMS) : les `<em>` rendus de la zone (au moins une boîte, texte rendu non vide), avec leur
   * texte rendu (innerText, sans le texte masqué qu’ils contiennent) et leur couleur rendue.
   */
  accents: { text: string; color: string }[]
  /** Enfants directs visibles (taille non nulle). */
  children: Box[]
  texts: RawText[]
  /**
   * Clés des éléments de la zone qui portent un texte en propre mais ne sont pas rendus (display: none, visibility:
   * hidden, ancêtre masqué), 50 au plus. Même clé que les textes.
   */
  hiddenTexts: string[]
  /** Nombre d’occurrences de la zone sur la page (éléments qui portent le même data-edit). */
  occurrences: number
  /**
   * Un plafond du relevé des lignes recouvertes est atteint (READ_ZONE : 50 éléments peints ou 200 fragments, points par
   * ligne, ou MAX_RULES règles de style lues pour les états qui peignent) : des lignes ont pu ne pas être sondées partout.
   */
  partial: boolean
  /**
   * Peinture de tous les textes rendus de la zone (MAX_PAINTS au plus), pour le contraste ; ses premiers textes sont ceux de
   * `texts`, relevés en entier.
   */
  paints: RawPaints
  /** Textes de la zone dans chaque état forcé (décision 16) : vide pour READ_ZONE, rempli par la capture. */
  states: RawState[]
}

export type TextMeasure = {
  key: string
  text: string
  lines: number
  fontSize: number
  fontWeight: string
  color: string
  /** Fond effectif du pire cas, null s’il ne se lit pas (image, dégradé illisible). */
  background: string | null
  ratio: number | null
  required: number
  /** Rendu avec une largeur ou une hauteur nulle. */
  collapsed: boolean
  /** Lignes de ses propres nœuds de texte (RawText.ownLines). */
  ownLines: number
  /** Rangs de celles qui sont recouvertes par un autre élément, coupées ou hors de la page (RawText.coveredLines). */
  coveredLines: number[]
}

/** Contraste d’un texte relevé pour sa seule peinture (RawPaint), au repos ou dans un état forcé. */
export type PaintText = Pick<
  TextMeasure,
  'key' | 'text' | 'color' | 'fontSize' | 'fontWeight' | 'background' | 'ratio' | 'required'
>

/** Textes relevés pour leur peinture (RawPaints), avec leur contraste ; `total` : textes rendus, relevés ou non. */
export type PaintMeasure = { texts: PaintText[]; total: number }

/** Textes de la zone dans un état forcé (RawState), avec leur contraste. */
export type StateMeasure = PaintMeasure & { kind: StateKind; hover: number | null; focus: number | null }

/**
 * Relevé d’une occurrence pour le contraste : la peinture de ses textes au repos et dans chaque état forcé. Un ZoneMeasure
 * en est un ; au-delà des MAX_OCCURRENCES occurrences relevées en entier, les suivantes ne sont relevées que pour leur
 * peinture (toPaintedMeasure), jusqu’à MAX_PAINTED_OCCURRENCES.
 */
export type PaintedMeasure = Pick<ZoneMeasure, 'viewport' | 'occurrence' | 'occurrences' | 'found' | 'paints' | 'states'>

/** Rendu réel de l’élément sélectionné, à une largeur d’écran : ce que Claude ne voit pas autrement. */
export type ZoneMeasure = {
  viewport: number
  /** Rang de l’occurrence relevée parmi celles de la zone sur la page, dans l’ordre du document (depuis 0). */
  occurrence: number
  /** Nombre d’occurrences de la zone sur la page ; 0 si la zone est introuvable. */
  occurrences: number
  found: boolean
  /**
   * display: none, ou aucune boîte rendue : ni lignes, ni textes, ni cadre. Une zone de taille nulle encore rendue
   * n’est pas masquée : son contenu peut rester visible, et son cadre est relevé (frameCheck la refuse).
   */
  hidden: boolean
  lines: number
  width: number
  height: number
  fontSize: string
  lineHeight: string
  maxWidth: string
  color: string
  opacity: string
  accents: { text: string; color: string }[]
  texts: TextMeasure[]
  /** Clés des textes de la zone masqués (display: none, visibility: hidden) ; vide si la zone est masquée ou introuvable. */
  hiddenTexts: string[]
  /**
   * Dépassement de la boîte de contenu du parent (px, arrondi), côtés dont la marge calculée est négative, décalages
   * relatifs non nuls (px, arrondis) et côtés où le contenu sort de la page ; null si la zone est introuvable, masquée
   * ou sans parent.
   */
  frame: {
    overflowLeft: number
    overflowRight: number
    negativeMargins: string[]
    offsets: Offset[]
    outside: string[]
  } | null
  /** Mise en page de la zone (null si introuvable ou masquée). */
  layout: Layout | null
  /** Un plafond du relevé des lignes recouvertes est atteint (RawZone.partial). */
  partial: boolean
  /** Contraste de tous les textes rendus au repos (MAX_PAINTS au plus) ; vide si la zone est masquée ou introuvable. */
  paints: PaintMeasure
  /** Contraste des textes dans chaque état forcé (décision 16) ; vide si la zone est masquée ou introuvable. */
  states: StateMeasure[]
}

/**
 * Mise en page de la zone : colonnes réelles (grille ou flex), enfants par rangée, alignement du texte,
 * marges dans la boîte de contenu du parent, ordre visuel des enfants s’il diffère de celui du code.
 */
export type Layout = {
  display: string
  columns: number | null
  rows: number[]
  order: number[] | null
  textAlign: string
  marginLeft: number | null
  marginRight: number | null
}

/** Éléments de texte relevés au plus par zone. */
export const MAX_TEXTS = 10

/**
 * Textes rendus dont la peinture est relevée au plus par occurrence, au repos comme dans chaque état, pour le contraste
 * (décision 19 : 400) : au-delà, le contrôle du contraste le dit et refuse (relevé partiel, textes non vérifiés).
 */
export const MAX_PAINTS = 400

/** Occurrences d’une zone répétée relevées au plus en entier (cartes, liens…), dans l’ordre du document. */
export const MAX_OCCURRENCES = 12

/**
 * Occurrences d’une zone répétée relevées au plus pour la peinture de leurs textes (contraste), au repos et dans chaque état
 * forcé : au-delà, le contrôle du contraste refuse (relevé partiel).
 */
export const MAX_PAINTED_OCCURRENCES = 100

/**
 * Règles de style de la page lues au plus (READ_ZONE : règles des @media et des groupes comprises) : au-delà, le contrôle du
 * contraste refuse (les règles ajoutées n’ont pas toutes été lues).
 */
export const MAX_RULES = 20000

/** Les `limit` premiers rangs d’une zone qui apparaît `total` fois, plus l’occurrence choisie `index` (même introuvable). */
function ranksUpTo(limit: number, total: number, index: number): number[] {
  const ranks = Array.from({ length: Math.min(total, limit) }, (_, rank) => rank)
  return ranks.includes(index) ? ranks : [...ranks, index]
}

/**
 * Rangs des occurrences à relever en entier pour une zone qui apparaît `total` fois et dont l’occurrence `index` est
 * choisie : les MAX_OCCURRENCES premières, plus l’occurrence choisie si elle vient après (toujours relevée, même
 * introuvable).
 */
export const occurrenceRanks = (total: number, index: number) => ranksUpTo(MAX_OCCURRENCES, total, index)

/**
 * Rangs des occurrences dont la peinture est relevée (contraste) : les MAX_PAINTED_OCCURRENCES premières, plus
 * l’occurrence choisie ; toutes celles d’occurrenceRanks en font partie.
 */
export const paintedRanks = (total: number, index: number) => ranksUpTo(MAX_PAINTED_OCCURRENCES, total, index)

/**
 * Rangées visuelles : rectangles triés par leur haut, regroupés quand leur chevauchement vertical vaut
 * au moins la moitié de la plus petite hauteur (la rangée garde l’union). Un simple chevauchement ne suffit
 * pas : les lignes d’un titre à interligne serré se chevauchent de quelques pixels.
 */
export function countRows(rects: LineRect[]): number {
  const sorted = rects.filter((rect) => rect.bottom > rect.top).sort((a, b) => a.top - b.top)
  let rows = 0
  let current: LineRect | null = null
  for (const rect of sorted) {
    if (current) {
      const overlap = Math.min(current.bottom, rect.bottom) - Math.max(current.top, rect.top)
      const smallest = Math.min(current.bottom - current.top, rect.bottom - rect.top)
      if (overlap >= smallest / 2) {
        current = { top: Math.min(current.top, rect.top), bottom: Math.max(current.bottom, rect.bottom) }
        continue
      }
    }
    rows++
    current = rect
  }
  return rows
}

/**
 * Extrait d’un texte relevé dans la page, pour les messages et pour Claude (60 caractères par défaut) : neutralisé par
 * quoteData (décision 20), à citer entre “ ” (tous les messages sont en anglais ; quoteData neutralise aussi « »).
 */
export function excerpt(text: string, max = 60): string {
  return quoteData(text, max)
}

// Arrondi sans « -0 ».
const px = (value: number) => Math.round(value) || 0

// Deux enfants dont le haut diffère de 2 px au plus sont sur la même rangée.
const ROW_TOLERANCE = 2

/**
 * Deux enfants sont sur la même rangée si leurs hauts diffèrent de 2 px au plus, ou si leur chevauchement vertical vaut
 * au moins la moitié de la plus petite hauteur (comme countRows) : des enfants de hauteurs différentes centrés
 * (align-items: center) ou alignés sur leur ligne de base n’ont pas le même haut.
 */
function sameRow(a: Box, b: Box): boolean {
  if (Math.abs(a.top - b.top) <= ROW_TOLERANCE) return true
  const overlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
  return overlap >= Math.min(a.height, b.height) / 2
}

/**
 * Rangée de chaque enfant (0, 1…), dans l’ordre vertical : un enfant rejoint la rangée en cours s’il est sur la même
 * rangée que chacun de ses membres (une carte sur deux rangées, grid-row: span 2, ne fusionne pas les cartes empilées à
 * côté d’elle).
 */
function rowsOf(children: Box[]): number[] {
  const byTop = children.map((_, index) => index).sort((a, b) => children[a].top - children[b].top)
  const rows = children.map(() => 0)
  let row = -1
  let members: Box[] = []
  for (const index of byTop) {
    if (!members.every((member) => sameRow(member, children[index]))) members = []
    if (!members.length) row++
    members.push(children[index])
    rows[index] = row
  }
  return rows
}

/** Nombre d’enfants par rangée, de haut en bas (4 cartes en 3 colonnes → [3, 1]). */
export function gridRows(children: Box[]): number[] {
  const counts: number[] = []
  for (const row of rowsOf(children)) counts[row] = (counts[row] ?? 0) + 1
  return counts
}

/** Rangs (1 à n) des enfants lus rangée par rangée, de gauche à droite ; null si c’est l’ordre du code. */
export function visualOrder(children: Box[]): number[] | null {
  const rows = rowsOf(children)
  const order = children
    .map((_, index) => index)
    .sort((a, b) => rows[a] - rows[b] || children[a].left - children[b].left || a - b)
    .map((index) => index + 1)
  return order.every((rank, index) => rank === index + 1) ? null : order
}

/** Colonnes réelles : pistes calculées d’une grille, plus longue rangée d’un flex ; null sinon. */
export function columnCount(display: string, gridTemplateColumns: string, rows: number[]): number | null {
  if (display.endsWith('grid')) {
    const tracks = gridTemplateColumns
      .trim()
      .split(/\s+/)
      .filter((track) => track !== '' && track !== 'none' && !track.startsWith('[') && !track.endsWith(']'))
    return tracks.length ? tracks.length : null
  }
  if (display.endsWith('flex')) return rows.length ? Math.max(...rows) : null
  return null
}

function layoutOf(raw: RawZone): Layout {
  const rows = gridRows(raw.children)
  return {
    display: raw.style.display,
    columns: columnCount(raw.style.display, raw.style.gridTemplateColumns, rows),
    rows,
    order: visualOrder(raw.children),
    textAlign: raw.style.textAlign,
    marginLeft: raw.parent ? px(raw.box.left - raw.parent.left) : null,
    marginRight: raw.parent ? px(raw.parent.left + raw.parent.width - raw.box.left - raw.box.width) : null,
  }
}

function toTextMeasure(raw: RawText): TextMeasure {
  const contrast = textContrast({ color: raw.color, fontSize: raw.fontSize, fontWeight: raw.fontWeight, layers: raw.layers })
  return {
    key: raw.key,
    text: raw.text,
    lines: countRows(raw.rects),
    fontSize: raw.fontSize,
    fontWeight: raw.fontWeight,
    color: raw.color,
    background: contrast.background,
    ratio: contrast.ratio,
    required: contrast.required,
    collapsed: raw.collapsed,
    ownLines: raw.ownLines,
    coveredLines: raw.coveredLines,
  }
}

function toPaintMeasure(raw: RawPaints): PaintMeasure {
  return {
    texts: raw.texts.map(({ key, text, color, fontSize, fontWeight, layers }) => {
      const { background, ratio, required } = textContrast({ color, fontSize, fontWeight, layers })
      return { key, text, color, fontSize, fontWeight, background, ratio, required }
    }),
    total: raw.total,
  }
}

function toStateMeasure(raw: RawState): StateMeasure {
  return { kind: raw.kind, hover: raw.hover, focus: raw.focus, ...toPaintMeasure(raw) }
}

/**
 * Relevé de peinture seule de l’occurrence `occurrence` (au-delà des MAX_OCCURRENCES relevées en entier), parmi les
 * `occurrences` de la zone sur la page, avec ses états forcés ; introuvable pour `raw` null.
 */
export function toPaintedMeasure(
  viewport: number,
  raw: RawPaints | null,
  occurrence: number,
  occurrences: number,
  states: RawState[],
): PaintedMeasure {
  if (!raw) return { viewport, occurrence, occurrences: 0, found: false, paints: { texts: [], total: 0 }, states: [] }
  return { viewport, occurrence, occurrences, found: true, paints: toPaintMeasure(raw), states: states.map(toStateMeasure) }
}

/** La zone dépasse-t-elle de plus de 1 px, à gauche ou à droite, la boîte de contenu de son parent ? */
export function escapesParent(zone: { left: number; width: number }, parent: { left: number; width: number }): boolean {
  return zone.left < parent.left - 1 || zone.left + zone.width > parent.left + parent.width + 1
}

/** Côtés CSS et leur nom dans les messages (anglais : lus par Claude). */
const SIDES = [
  ['left', 'left'],
  ['right', 'right'],
  ['top', 'top'],
  ['bottom', 'bottom'],
] as const

/** Côtés où le contenu de la zone sort de la page de plus de 1 px, dans l’ordre gauche, haut, droite. */
function outsideOf({ content, pageWidth }: RawZone): string[] {
  if (!content) return []
  const sides: [string, boolean][] = [
    ['left', content.left < -1],
    ['top', content.top < -1],
    ['right', content.right > pageWidth + 1],
  ]
  return sides.filter(([, out]) => out).map(([side]) => side)
}

/**
 * Cadre de la zone dans son parent : dépassements à gauche et à droite, marges négatives, décalages relatifs, et
 * contenu sorti de la page.
 */
function frameOf(raw: RawZone): ZoneMeasure['frame'] {
  if (!raw.parent) return null
  const { box, parent } = raw
  return {
    overflowLeft: Math.round(Math.max(0, parent.left - box.left)),
    overflowRight: Math.round(Math.max(0, box.left + box.width - parent.left - parent.width)),
    negativeMargins: SIDES.filter(([side]) => raw.margins[side] < -0.5).map(([, label]) => label),
    offsets: raw.offsets
      .map((offset) => ({ key: offset.key, top: px(offset.top), left: px(offset.left) }))
      .filter((offset) => offset.top !== 0 || offset.left !== 0),
    outside: outsideOf(raw),
  }
}

/** Relevé de l’occurrence `occurrence` de la zone (la première par défaut) à cette largeur. */
export function toZoneMeasure(viewport: number, raw: RawZone | null, occurrence = 0): ZoneMeasure {
  const empty: ZoneMeasure = {
    viewport,
    occurrence,
    occurrences: 0,
    found: false,
    hidden: false,
    lines: 0,
    width: 0,
    height: 0,
    fontSize: '',
    lineHeight: '',
    maxWidth: '',
    color: '',
    opacity: '',
    accents: [],
    texts: [],
    hiddenTexts: [],
    frame: null,
    layout: null,
    partial: false,
    paints: { texts: [], total: 0 },
    states: [],
  }
  if (!raw) return empty
  const base: ZoneMeasure = {
    ...empty,
    occurrences: raw.occurrences,
    found: true,
    width: px(raw.box.width),
    height: px(raw.box.height),
    fontSize: raw.style.fontSize,
    lineHeight: raw.style.lineHeight,
    maxWidth: raw.style.maxWidth,
    color: raw.style.color,
    opacity: raw.style.opacity,
  }
  // Zone masquée à cette largeur (R03 : sous-titre masqué sur mobile) : ni lignes, ni textes. Pas une zone de taille
  // nulle encore rendue : ses liens ou son texte peuvent déborder, ou être poussés hors de la page par un décalage.
  if (raw.style.display === 'none' || raw.boxes === 0) return { ...base, hidden: true }
  return {
    ...base,
    lines: countRows(raw.texts.flatMap((text) => text.rects)),
    accents: raw.accents,
    texts: raw.texts.map(toTextMeasure),
    hiddenTexts: raw.hiddenTexts,
    frame: frameOf(raw),
    layout: layoutOf(raw),
    partial: raw.partial,
    paints: toPaintMeasure(raw.paints),
    states: raw.states.map(toStateMeasure),
  }
}

const lineCount = (n: number) => `${n} line${n === 1 ? '' : 's'}`

/**
 * « 2 of 7 lines covered », « 1 of 7 lines covered » ; `word` vide : « 2 of 7 lines ». En anglais : ces textes vont au
 * journal visible par le client (admin en anglais) et à Claude, dont les consignes sont en anglais.
 */
export const coveredCount = (covered: number, total: number, word = 'covered') =>
  `${covered} of ${total} line${total === 1 ? '' : 's'}${word ? ` ${word}` : ''}`

function describeLayout(layout: Layout): string {
  const parts: string[] = []
  const kind = layout.display.endsWith('grid') ? 'grid' : layout.display.endsWith('flex') ? 'flex' : null
  const children = layout.rows.reduce((sum, count) => sum + count, 0)
  if (kind && children >= 2) {
    const grid = [kind]
    if (layout.columns !== null) grid.push(`${layout.columns} column${layout.columns > 1 ? 's' : ''}`)
    grid.push(`${layout.rows.length > 1 ? 'rows' : 'row'} ${layout.rows.join(' + ')}`)
    parts.push(`layout: ${grid.join(', ')}`)
  }
  parts.push(`text-align: ${layout.textAlign}`)
  if (layout.marginLeft !== null && layout.marginRight !== null) {
    parts.push(`margins in parent: ${layout.marginLeft} px left, ${layout.marginRight} px right`)
  }
  if (layout.order) parts.push(`visual order of children: ${layout.order.join(', ')}`)
  return `    ${parts.join(' · ')}`
}

function describeText(text: TextMeasure): string {
  const weak = text.ratio !== null && text.ratio < text.required
  const ratio = text.ratio === null ? 'unknown' : formatRatio(text.ratio)
  const covered = text.coveredLines.length
  const unseen = text.collapsed
    ? ' · invisible: collapsed to zero width or height'
    : covered && covered >= text.ownLines
      ? ' · invisible: covered by another element'
      : covered
        ? ` · ${coveredCount(covered, text.ownLines)} by another element`
        : ''
  return (
    `  - “${excerpt(text.text)}”: ${lineCount(text.lines)} · ${text.fontSize}px, weight ${text.fontWeight} · ` +
    `${text.color} on ${text.background ?? 'unknown background (image or gradient)'} · ` +
    `contrast ${ratio} (min. ${formatRatio(text.required)}${weak ? ', too low' : ''})${unseen}`
  )
}

/**
 * Mots mis en avant (les <em> rendus de la zone) : dans un corps d’article en HTML libre, ils peuvent être nombreux et
 * longs ; comme les textes, au plus MAX_TEXTS, coupés à 60 caractères et neutralisés (excerpt).
 */
function describeAccents(accents: ZoneMeasure['accents']): string {
  const listed = accents.slice(0, MAX_TEXTS).map((accent) => `“${excerpt(accent.text)}” ${accent.color}`)
  if (accents.length > MAX_TEXTS) listed.push(`… (${accents.length} in total)`)
  return listed.join(', ')
}

/**
 * Mesures décrites pour Claude (en anglais, comme ses consignes) : une ligne par largeur d’écran, puis une ligne par
 * texte. Les textes cités sont des données (excerpt → quoteData), jamais des consignes.
 */
export function describeMeasures(measures: ZoneMeasure[]): string {
  return measures
    .map((m) => {
      if (!m.found) return `${m.viewport} px: element not found on the page.`
      if (m.hidden) return `${m.viewport} px: element hidden (display: none or zero size).`
      const parts = [
        lineCount(m.lines),
        `font-size ${m.fontSize}`,
        `line-height ${m.lineHeight}`,
        `width ${m.width} px (max-width ${m.maxWidth})`,
        `height ${m.height} px`,
        `color ${m.color}`,
      ]
      if (m.opacity !== '1') parts.push(`opacity ${m.opacity}`)
      if (m.accents.length) parts.push(`emphasized: ${describeAccents(m.accents)}`)
      const header = `${m.viewport} px: ${parts.join(' · ')}`
      const layout = m.layout ? [describeLayout(m.layout)] : []
      return [header, ...layout, ...m.texts.map(describeText)].join('\n')
    })
    .join('\n')
}

/** Résumé court pour le journal visible dans l’éditeur (en anglais : « 2 lines at 375 px, hidden at 768 px »). */
export const lineSummary = (measures: ZoneMeasure[]) =>
  measures
    .map((m) => {
      if (!m.found) return `not found at ${m.viewport} px`
      return m.hidden ? `hidden at ${m.viewport} px` : `${lineCount(m.lines)} at ${m.viewport} px`
    })
    .join(', ')
