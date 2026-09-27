import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pixelmatch from 'pixelmatch'
import { chromium, type Browser, type Page } from 'playwright-core'
import { PNG } from 'pngjs'
import { requiredContrast, textContrast } from './contrast'
import {
  MAX_PAINTS,
  MAX_RULES,
  MAX_TEXTS,
  occurrenceRanks,
  paintedRanks,
  toPaintedMeasure,
  toZoneMeasure,
  type PaintedMeasure,
  type RawPaint,
  type RawPaints,
  type RawState,
  type RawZone,
  type RuleExposure,
  type StateKind,
  type ZoneMeasure,
} from './measure'
import { frozenSet } from './types'

/**
 * Contrôles visuels du brouillon avec Playwright :
 * rendu sans erreur, pas de débordement horizontal, autres zones inchangées au pixel près,
 * et relevé de la zone sélectionnée (READ_ZONE), le même avant, après et pour l'outil measure ; avant et après, chaque
 * occurrence d'une zone répétée est relevée (12 au plus), pour que le cadre et le texte recouvert s'y contrôlent aussi,
 * et la peinture de ses textes est relevée par le même READ_ZONE, pour le contraste, dans chaque occurrence (100 au plus),
 * au repos et dans leurs états forcés (survol, clic, focus, et leurs combinaisons : planStates), avec les règles de la
 * page qui peignent un texte ; après la modification, chaque règle de peinture ajoutée ou modifiée est remplacée par une
 * valeur témoin le temps d'une lecture, pour trouver celles qui ne changent aucun texte relevé (décision 19 :
 * unmeasuredRules), et relue sans les autres règles ajoutées ou modifiées de son groupe, pour juger aussi les textes
 * qu'elles lui reprennent ; une règle large (par héritage, ou sans classe ni balise de bloc) doit y passer 4,5 (décision 19,
 * 4e relecture : RuleExposure). Dans une zone à contenu libre (HTML venu du CMS : le corps d'un article), chaque règle de
 * couleur ou de fond est aussi relue seule, sans les autres règles ajoutées ou modifiées de tout groupe, hors celles du même
 * sélecteur et celles de toute la zone (5e relecture : rulesApart).
 * Les zones intérieures à la sélection et ses ancêtres sont comparés sur leurs styles propres. La capture d'avant relève
 * aussi le texte propre de chaque autre zone de la page, donné à Claude en lecture seule (pageTextsOf).
 */

/** Place d'une zone par rapport à la sélection : elle-même, à l'intérieur, autour, ou ailleurs sur la page. */
export type ZoneRelation = 'self' | 'child' | 'ancestor' | 'other'

export type ZoneBox = {
  key: string
  zone: string
  index: number
  x: number
  y: number
  width: number
  height: number
  /**
   * Texte visible propre à la zone (blancs réduits, 150 caractères au plus), donné à Claude en lecture seule :
   * le texte d'une zone intérieure est relevé avec elle, pas avec son conteneur.
   */
  text: string
  relation: ZoneRelation
  /** Styles calculés de l'élément lui-même, dans l'ordre de FINGERPRINT_PROPERTIES. */
  own: string[]
  /** Styles calculés et tailles de la zone et de ses descendants, indépendants de sa position. */
  fingerprint: string
}

export type Capture = {
  viewport: number
  status: number
  errors: string[]
  overflow: number
  zones: ZoneBox[]
  png: PNG
  /** Relevé de la zone sélectionnée (occurrence demandée) à cette largeur. */
  measure: ZoneMeasure
  /**
   * Relevé de chaque occurrence de la zone à cette largeur, dans l'ordre du document : les MAX_OCCURRENCES premières,
   * plus l'occurrence demandée (occurrenceRanks).
   */
  occurrences: ZoneMeasure[]
  /**
   * Relevé de peinture de chaque occurrence de la zone à cette largeur (contraste), dans l'ordre du document : les
   * MAX_PAINTED_OCCURRENCES premières, plus l'occurrence demandée (paintedRanks) ; celles d'`occurrences` en font partie.
   */
  painted: PaintedMeasure[]
  /**
   * Règles de la page qui peignent un texte (RawRule), leur effet jugé dans la capture d'après (décision 19) ; null quand
   * elles n'ont pas toutes été lues (plus de MAX_RULES).
   */
  rules: RawRule[] | null
}

export type ZoneChange = {
  key: string
  zone: string
  reason: 'missing' | 'resized' | 'styles' | 'pixels' | 'placement'
  /** Styles propres qui ont changé (zone intérieure ou ancêtre). */
  properties?: string[]
}

// 0,2 % de pixels différents tolérés (anticrénelage), pour une zone restée à la même place.
const PIXEL_TOLERANCE = 0.002

/** Ce qui fait l'apparence d'une zone, relevé sur elle et ses descendants. */
export const FINGERPRINT_PROPERTIES: readonly string[] = Object.freeze([
  'display',
  'visibility',
  'opacity',
  'color',
  'background-color',
  'background-image',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-transform',
  'text-decoration-line',
  // Soulignement reçu d'un ancêtre : il se propage au texte sans changer text-decoration-line (propriété de Chrome).
  '-webkit-text-decorations-in-effect',
  'text-wrap',
  'text-align',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-color',
  'border-top-style',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'box-shadow',
  'gap',
  'transform',
  'order',
  'align-self',
  'justify-self',
])

/** Placement qu'un conteneur peut donner à une zone intérieure : signalé, pas refusé. */
export const PLACEMENT_STYLE_PROPERTIES: ReadonlySet<string> = frozenSet([
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'text-align',
  'order',
  'align-self',
  'justify-self',
])

export function crop(source: PNG, box: { x: number; y: number; width: number; height: number }): PNG | null {
  const x = Math.max(0, box.x)
  const y = Math.max(0, box.y)
  const width = Math.min(box.width, source.width - x)
  const height = Math.min(box.height, source.height - y)
  if (width <= 0 || height <= 0) return null
  const out = new PNG({ width, height })
  PNG.bitblt(source, out, x, y, width, height, 0, 0)
  return out
}

export function diffRatio(a: PNG, b: PNG): number {
  if (a.width !== b.width || a.height !== b.height) return 1
  const changed = pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.1, includeAA: false })
  return changed / (a.width * a.height)
}

/**
 * Zones autres que la sélection qui ont disparu, changé de taille, de styles ou d'apparence.
 * - zone intérieure : seuls ses styles propres comptent (sa taille suit la sélection) ; un changement limité
 *   au placement (marges, alignement, ordre) est signalé, tout autre est refusé ;
 * - ancêtre : tout changement de style propre est refusé, sa taille peut suivre ;
 * - autre zone : une zone simplement décalée (le contenu au-dessus a grandi) n'est pas « affectée » : on compare
 *   alors ses styles calculés, pas ses pixels, car un décalage d'une fraction de pixel change le rendu du texte.
 */
export function compareZones(before: Capture, after: Capture): ZoneChange[] {
  const afterByKey = new Map(after.zones.map((zone) => [zone.key, zone]))
  const changes: ZoneChange[] = []

  for (const zone of before.zones) {
    if (zone.relation === 'self' || zone.width === 0 || zone.height === 0) continue
    const next = afterByKey.get(zone.key)
    if (!next) {
      changes.push({ key: zone.key, zone: zone.zone, reason: 'missing' })
      continue
    }
    if (zone.relation === 'child' || zone.relation === 'ancestor') {
      const properties = FINGERPRINT_PROPERTIES.filter((_, i) => zone.own[i] !== next.own[i])
      if (!properties.length) continue
      const placement = zone.relation === 'child' && properties.every((property) => PLACEMENT_STYLE_PROPERTIES.has(property))
      changes.push({ key: zone.key, zone: zone.zone, reason: placement ? 'placement' : 'styles', properties })
      continue
    }
    if (Math.abs(next.width - zone.width) > 1 || Math.abs(next.height - zone.height) > 1) {
      changes.push({ key: zone.key, zone: zone.zone, reason: 'resized' })
      continue
    }
    if (next.fingerprint !== zone.fingerprint) {
      changes.push({ key: zone.key, zone: zone.zone, reason: 'styles' })
      continue
    }
    if (next.x !== zone.x || next.y !== zone.y) continue
    const a = crop(before.png, zone)
    const b = crop(after.png, next)
    if (a && b && diffRatio(a, b) > PIXEL_TOLERANCE) changes.push({ key: zone.key, zone: zone.zone, reason: 'pixels' })
  }
  return changes
}

/**
 * Texte visible d'une autre zone de la page, donné à Claude en lecture seule. `inner` : zone intérieure à la sélection
 * (à l'une de ses occurrences) ; quand Claude modifie le texte de la sélection, le sien en fait partie : le prompt ne le
 * cite pas en lecture seule.
 */
export type PageText = { zone: string; index: number; text: string; inner?: true }

/** Textes propres des zones affichées, hors zone sélectionnée (toutes ses occurrences), zones intérieures marquées. */
export function pageTextsOf(zones: ZoneBox[]): PageText[] {
  return zones
    .filter((box) => box.text !== '' && box.relation !== 'self' && box.width > 0 && box.height > 0)
    .map((box) => ({
      zone: box.zone,
      index: box.index,
      text: box.text,
      ...(box.relation === 'child' ? { inner: true as const } : {}),
    }))
}

/** Nœud de l'arbre DOM rendu par le protocole Chrome (DOM.getDocument), réduit à ce que lit le plan des états forcés. */
export type DomNode = {
  nodeId: number
  nodeType: number
  nodeName: string
  /** Texte d'un nœud de texte. */
  nodeValue?: string
  attributes?: string[]
  children?: DomNode[]
}

/**
 * Un état forcé pour toutes les occurrences relevées : sa sorte, la profondeur survolée et la profondeur focalisée
 * (RawState), les pseudo-classes de chaque nœud (nodeId du protocole Chrome), et les rangs des occurrences dont les textes y
 * sont relevés.
 */
export type StatePlan = {
  kind: StateKind
  hover: number | null
  focus: number | null
  ranks: number[]
  forced: Map<number, string[]>
}

// Ordre des pseudo-classes forcées sur un même nœud.
const PSEUDO_CLASSES = ['hover', 'active', 'focus', 'focus-visible', 'focus-within']

/**
 * Pseudo-classes de chaque sorte d'état : celles des éléments sous le pointeur (survol, clic) et celles de l'élément
 * focalisé (focus après un clic, focus clavier). Toutes les combinaisons que Chrome donne : :active n'y va jamais sans
 * :hover (un clic se fait sous le pointeur ; Espace ou Entrée maintenues au clavier ne posent pas :active, sonde), ni
 * :focus-visible sans :focus ; 3 états du pointeur (aucun, survol, clic) × 3 du focus (aucun, après un clic, clavier), moins
 * le repos : 8 sortes. Un clic qui donne ou garde le focus a le pointeur sur l'élément focalisé ou plus bas, jamais
 * au-dessus (un clic ailleurs retire le focus) ; un clic garde :focus-visible à un élément qui avait le focus clavier (Tab,
 * puis bouton de la souris enfoncé dessus). Dans l'ordre du plan : chaque combinaison après les états simples qui la
 * composent (contrastCheck ne répète pas dans une combinaison la baisse déjà vue dans l'un d'eux).
 */
const STATE_CLASSES: Record<StateKind, { pointer: string[]; focus: string[] }> = {
  hover: { pointer: ['hover'], focus: [] },
  active: { pointer: ['hover', 'active'], focus: [] },
  'focus-visible': { pointer: [], focus: ['focus', 'focus-visible'] },
  focus: { pointer: [], focus: ['focus'] },
  'hover-focus': { pointer: ['hover'], focus: ['focus'] },
  'hover-focus-visible': { pointer: ['hover'], focus: ['focus', 'focus-visible'] },
  'active-focus': { pointer: ['hover', 'active'], focus: ['focus'] },
  'active-focus-visible': { pointer: ['hover', 'active'], focus: ['focus', 'focus-visible'] },
}

const STATE_ORDER = Object.keys(STATE_CLASSES) as StateKind[]

const ELEMENT_NODE = 1
const TEXT_NODE = 3

const elementChildren = (node: DomNode) => (node.children ?? []).filter((child) => child.nodeType === ELEMENT_NODE)

function attributeOf(node: DomNode, name: string): string | null {
  const list = node.attributes ?? []
  for (let i = 0; i + 1 < list.length; i += 2) if (list[i] === name) return list[i + 1]
  return null
}

/** Élément qui prend le focus (clavier ou clic) : tabindex, contenteditable, lien avec href, champ, bouton, summary. */
function focusable(node: DomNode): boolean {
  const name = node.nodeName.toLowerCase()
  const editable = attributeOf(node, 'contenteditable')
  if (attributeOf(node, 'tabindex') !== null || (editable !== null && editable.toLowerCase() !== 'false')) return true
  if (name === 'a' || name === 'area') return attributeOf(node, 'href') !== null
  if (name === 'input') return attributeOf(node, 'type')?.toLowerCase() !== 'hidden'
  return ['button', 'select', 'textarea', 'summary', 'iframe'].includes(name)
}

/** Occurrences de la zone dans l'ordre du document, avec leurs ancêtres (du parent à <html>). */
function occurrencesIn(document: DomNode, zone: string): { root: DomNode; ancestors: DomNode[] }[] {
  const found: { root: DomNode; ancestors: DomNode[] }[] = []
  const walk = (node: DomNode, ancestors: DomNode[]) => {
    if (node.nodeType === ELEMENT_NODE && attributeOf(node, 'data-edit') === zone) found.push({ root: node, ancestors })
    const next = node.nodeType === ELEMENT_NODE ? [node, ...ancestors] : ancestors
    for (const child of elementChildren(node)) walk(child, next)
  }
  walk(document, [])
  return found
}

/**
 * Éléments de l'occurrence dont dépend la peinture d'un texte, dans l'ordre du document : ceux qui portent un texte en
 * propre (nœud de texte non vide) et leurs ancêtres dans la zone, avec leur profondeur (0 : la racine) et ces ancêtres (du
 * parent à la racine).
 */
function textChain(root: DomNode): { node: DomNode; depth: number; above: DomNode[] }[] {
  const carries = new Set<DomNode>()
  const mark = (node: DomNode): boolean => {
    let found = (node.children ?? []).some((child) => child.nodeType === TEXT_NODE && (child.nodeValue ?? '').trim() !== '')
    for (const child of elementChildren(node)) if (mark(child)) found = true
    if (found) carries.add(node)
    return found
  }
  mark(root)
  const chain: { node: DomNode; depth: number; above: DomNode[] }[] = []
  const walk = (node: DomNode, above: DomNode[]) => {
    if (!carries.has(node)) return
    chain.push({ node, depth: above.length, above })
    for (const child of elementChildren(node)) walk(child, [node, ...above])
  }
  walk(root, [])
  return chain
}

/**
 * États à forcer pour mesurer le contraste des textes de la zone hors du repos (décision 16), dans chaque occurrence
 * relevée (`ranks`). La peinture d'un texte ne dépend que de l'état de son élément et de ses ancêtres : le contrôle CSS
 * refuse les combinateurs + et ~, :has et :focus-within, et ne permet dans un état que la peinture. Forcer un état sur tous
 * les éléments d'une même profondeur à la fois donne donc à chaque texte un état réel, et les couvre tous ensemble :
 * - survol (:hover) et clic (:hover et :active) à chaque profondeur h, de -1 (les seuls ancêtres de la zone : pointeur sur
 *   son parent) au texte le plus profond : les éléments qui portent un texte et leurs ancêtres dans la zone, jusqu'à la
 *   profondeur h, et tous les ancêtres de la zone jusqu'à <html>, comme sous un pointeur posé à cette profondeur ;
 * - focus clavier (:focus et :focus-visible) et focus après un clic (:focus seul) de ceux de ces éléments qui prennent
 *   le focus, une profondeur à la fois (un seul élément focalisé par chaîne d'ancêtres), et de chaque ancêtre de la zone
 *   qui le prend (le lien d'une carte : profondeur -1), leurs ancêtres en :focus-within ;
 * - leurs combinaisons (STATE_CLASSES), pour chaque profondeur focalisée et chaque profondeur survolée : survol avec le
 *   focus après un clic (:hover et :focus), survol avec le focus clavier (:hover, :focus et :focus-visible), clic qui donne
 *   le focus (:hover, :active et :focus) et clic avec le focus clavier (:hover, :active, :focus et :focus-visible), le
 *   pointeur d'un clic sur l'élément focalisé ou plus bas, jamais au-dessus.
 * Un même état se force dans toutes les occurrences à la fois : leurs textes ne dépendent que de leurs éléments et de leurs
 * ancêtres.
 */
export function planStates(document: DomNode, zone: string, ranks: number[]): StatePlan[] {
  const occurrences = occurrencesIn(document, zone)
  const plans = new Map<string, Omit<StatePlan, 'forced'> & { forced: Map<number, Set<string>> }>()
  const add = (kind: StateKind, hover: number | null, focus: number | null, rank: number, forced: [DomNode, string[]][]) => {
    const id = `${kind}|${hover}|${focus}`
    const plan = plans.get(id) ?? { kind, hover, focus, ranks: [], forced: new Map<number, Set<string>>() }
    if (!plan.ranks.includes(rank)) plan.ranks.push(rank)
    for (const [node, classes] of forced) {
      const set = plan.forced.get(node.nodeId) ?? new Set<string>()
      for (const name of classes) set.add(name)
      plan.forced.set(node.nodeId, set)
    }
    plans.set(id, plan)
  }
  // Les mêmes pseudo-classes sur chacun de ces nœuds.
  const all = (nodes: DomNode[], classes: string[]): [DomNode, string[]][] => nodes.map((node) => [node, classes])
  for (const rank of ranks) {
    const occurrence = occurrences[rank]
    if (!occurrence) continue
    const { root, ancestors } = occurrence
    const chain = textChain(root)
    if (!chain.length) continue
    // Profondeurs survolées : des seuls ancêtres de la zone (-1) au texte le plus profond.
    const depths: number[] = []
    for (let depth = -1; depth <= Math.max(...chain.map((entry) => entry.depth)); depth++) depths.push(depth)
    const hovered = (depth: number) => [...chain.filter((entry) => entry.depth <= depth).map((entry) => entry.node), ...ancestors]
    // Éléments qui prennent le focus, par profondeur : dans la zone, puis ses ancêtres ; leurs ancêtres en :focus-within.
    const focused = new Map<number, { nodes: DomNode[]; above: Set<DomNode> }>()
    const enlist = (depth: number, node: DomNode, above: DomNode[]) => {
      const group = focused.get(depth) ?? { nodes: [], above: new Set<DomNode>() }
      group.nodes.push(node)
      for (const up of above) group.above.add(up)
      focused.set(depth, group)
    }
    for (const entry of chain) if (focusable(entry.node)) enlist(entry.depth, entry.node, [...entry.above, ...ancestors])
    ancestors.forEach((node, level) => {
      if (focusable(node)) enlist(-(level + 1), node, ancestors.slice(level + 1))
    })
    // Les éléments focalisés à cette profondeur, avec ces pseudo-classes ; leurs ancêtres en :focus-within.
    const focusAt = (depth: number, classes: string[]) => {
      const { nodes, above } = focused.get(depth)!
      return [...all(nodes, classes), ...all([...above], ['focus-within'])]
    }
    // Chaque sorte d'état, à chaque profondeur survolée (s'il y a un pointeur) et focalisée (s'il y a un focus).
    for (const kind of STATE_ORDER) {
      const { pointer, focus } = STATE_CLASSES[kind]
      for (const at of focus.length ? [...focused.keys()] : [null]) {
        for (const under of pointer.length ? depths : [null]) {
          // Clic qui donne ou garde le focus : le pointeur est sur l'élément focalisé ou dans lui.
          if (pointer.includes('active') && at !== null && under !== null && under < at) continue
          add(kind, under, at, rank, [
            ...(under === null ? [] : all(hovered(under), pointer)),
            ...(at === null ? [] : focusAt(at, focus)),
          ])
        }
      }
    }
  }
  // Aucune profondeur (null) avant toutes les autres.
  const order = (value: number | null) => (value === null ? -1e9 : value)
  return [...plans.values()]
    .sort(
      (a, b) =>
        STATE_ORDER.indexOf(a.kind) - STATE_ORDER.indexOf(b.kind) ||
        order(a.focus) - order(b.focus) ||
        order(a.hover) - order(b.hover),
    )
    .map((plan) => ({
      kind: plan.kind,
      hover: plan.hover,
      focus: plan.focus,
      ranks: plan.ranks,
      forced: new Map([...plan.forced].map(([nodeId, set]) => [nodeId, PSEUDO_CLASSES.filter((name) => set.has(name))])),
    }))
}

/**
 * Groupes de propriétés de peinture d'une règle, jugés chacun à part (décision 19) : la couleur du texte, son fond (raccourci
 * et longues formes), sa taille et sa graisse (raccourci font compris). Désactiver un groupe retire toutes ses propriétés.
 */
export const PAINT_GROUPS = Object.freeze({
  color: Object.freeze(['color'] as const),
  background: Object.freeze(['background', 'background-color', 'background-image'] as const),
  font: Object.freeze(['font', 'font-size', 'font-weight'] as const),
})

export type PaintGroup = keyof typeof PAINT_GROUPS

/**
 * Propriété d'un texte relevé que peint chaque groupe (décision 19, 4e relecture) : sa couleur, ses couches de fond, sa
 * taille et sa graisse. Une règle ne peint un texte que si elle change la propriété de son groupe.
 */
const PAINT_OF: Record<PaintGroup, (paint: RawPaint) => string> = {
  color: (paint) => paint.color,
  background: (paint) => JSON.stringify(paint.layers),
  font: (paint) => `${paint.fontSize}|${paint.fontWeight}`,
}

/**
 * Textes (rang de l'occurrence dans la lecture, clé) dont la propriété du groupe de peinture diffère d'une lecture à
 * l'autre (décision 19, 4e relecture) : la couleur pour une règle de couleur, les couches de fond pour un fond, la taille et
 * la graisse pour une taille. Une couleur qui ne change que le fond de ses textes (`background-color: currentColor` sur la
 * zone, leur couleur rétablie par une règle plus précise) ne les peint pas. Un texte absent d'une des deux lectures compte
 * comme changé ; une occurrence introuvable, non.
 */
export function reachedTexts(
  group: PaintGroup,
  reference: (RawPaints | null)[],
  read: (RawPaints | null)[],
): { index: number; key: string }[] {
  const found: { index: number; key: string }[] = []
  reference.forEach((paints, index) => {
    const other = read[index]
    if (!paints || !other) return
    const keys = [...new Set([...paints.texts, ...other.texts].map((text) => text.key))]
    for (const key of keys) {
      const was = paints.texts.find((text) => text.key === key)
      const now = other.texts.find((text) => text.key === key)
      if (!was || !now || PAINT_OF[group](was) !== PAINT_OF[group](now)) found.push({ index, key })
    }
  })
  return found
}

/**
 * Sujet d'un sélecteur de la page, tel que le navigateur l'écrit (son dernier composé, états compris) : 'class' s'il porte
 * une classe, 'tag' s'il commence par une balise, 'none' s'il n'a que des pseudo-classes (`:nth-child(2)`, `:last-child`) et
 * vise donc n'importe quelle balise (décision 19, 4e relecture).
 */
export function selectorSubject(selector: string): 'class' | 'tag' | 'none' {
  let depth = 0
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i]
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (depth === 0 && ' >+~'.includes(char)) start = i + 1
  }
  // Le sujet sans le contenu de ses parenthèses (`:nth-child(n+1 of .x)` n'a pas de classe à lui).
  let bare = ''
  depth = 0
  for (const char of selector.slice(start)) {
    if (char === '(') depth++
    if (depth === 0) bare += char
    if (char === ')') depth--
  }
  if (bare.includes('.')) return 'class'
  return /^[a-z]/i.test(bare) ? 'tag' : 'none'
}

// États d'un sélecteur : remplacés par :is(*) pour savoir ce qu'il vise hors de ses états.
const STATE_CLASS = /:(hover|focus-visible|focus-within|focus|active)/gi

/**
 * Balises de bloc d'un contenu riche : une zone qui en contient une sans attribut class (racine exclue) est à contenu libre
 * (5e relecture). Son HTML vient du CMS (le corps d'un article : `<p>`, `<h2>`, `<li>`… sans classe), pas d'un composant,
 * dont chaque bloc porte une classe de son CSS Module ; les textes en ligne sans classe d'un composant (`<span>` du pied de
 * page, liens du menu) n'en font pas une. Ses balises changent d'une page à l'autre : une liste, une citation ou un
 * sous-titre absents de la page peuvent exister ailleurs.
 */
export const FREE_CONTENT_TAGS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, dt, dd, figcaption'

/**
 * Règles à désactiver pour juger seule une règle de peinture ajoutée ou modifiée dans une zone à contenu libre (décision 19,
 * 5e relecture) : les autres règles ajoutées ou modifiées de son groupe (celles qui peuvent la rattraper), et celles des
 * autres groupes, sauf celles du même sélecteur (elles l'accompagnent partout) et celles qui visent toute la zone (`wide` :
 * sélecteurs qui s'appliquent à sa racine, états compris ; elles peignent partout où elle peint). Une couleur rendue
 * lisible sur les seules balises de la page par un fond d'une autre règle, ou un fond par une couleur (`.content {
 * background-color }` et `.content p, .content h2 { color }`), ou par une taille qui abaisse le seuil, se juge ainsi sans
 * elle : ailleurs, sur une balise que cette autre règle ne vise pas, elle peindrait seule.
 */
export function rulesApart<T extends Pick<RawRule, 'selector' | 'group'>>(
  candidate: T,
  rules: T[],
  wide: ReadonlySet<string>,
): T[] {
  return rules.filter(
    (other) =>
      other !== candidate &&
      (other.group === candidate.group || (other.selector !== candidate.selector && !wide.has(other.selector))),
  )
}

/**
 * Règle de style de la page qui peint un texte, lue par READ_ZONE un sélecteur de sa liste et un groupe de peinture
 * (PAINT_GROUPS) à la fois : `rule` l'identifie (en-têtes des @media et groupes qui la contiennent, ce sélecteur et les
 * déclarations de ce groupe), `selector` est ce sélecteur tel que le navigateur l'écrit, `properties` les propriétés du
 * groupe qu'elle pose, `applies` dit si elle s'applique à cette largeur (sous des @media qui y correspondent), `at` où la
 * retrouver pour la désactiver (TOGGLE_RULES : indices dans document.styleSheets puis dans les règles imbriquées, et texte
 * de sa liste de sélecteurs). `effect` : dans la capture d'après, remplacée par une valeur témoin le temps d'une lecture
 * (judgeRules), à cette largeur, au repos ou dans un état forcé, elle change la propriété de son groupe sur un texte
 * relevé de la zone (ou l'a déjà fait à une largeur précédente) ; toujours faux avant.
 */
export type RawRule = {
  rule: string
  selector: string
  group: PaintGroup
  properties: string[]
  applies: boolean
  at: { path: number[]; list: string }
  effect: boolean
}

/**
 * Nom haché d'une classe de CSS Module. Vérifié sur Next 16.3.6 (Turbopack, `next dev`, 2026-09-27) :
 * « Hero-module__Vtspxq__title », « Section-module__d2c-Xa__title » (le hachage de 6 caractères prend aussi `-` et `_`),
 * « geist_9c6cb61b-module__8NX9hq__variable ». Même format que Next 16.3.3 dans le POC.
 */
export const MODULE_HASH = /-module__[\w-]{6}__/g
const MODULE_CLASS = /\.[\w-]+?-module__[\w-]{6}__/g

/** Règle ou sélecteur sans le hachage de ses classes de CSS Module : une recompilation du module ne le change pas. */
export const withoutHash = (text: string) => text.replace(MODULE_HASH, '-module__')

/** Règle écrite comme dans le CSS Module, avec les propriétés en cause : « .content > :nth-child(n+1) { color } ». */
export const ruleName = (entry: Pick<RawRule, 'selector' | 'properties'>) =>
  `${entry.selector.replace(MODULE_CLASS, '.')} { ${entry.properties.join(', ')} }`

/**
 * Règles de peinture ajoutées ou modifiées (ce sélecteur et ce groupe de peinture, avec ces valeurs, absents avant à toutes
 * les largeurs) sans effet mesuré à aucune largeur : remplacées par une valeur témoin le temps d'une lecture, au repos
 * comme dans chaque état forcé, elles ne changent la propriété de leur groupe sur aucun texte relevé de la zone
 * (décision 19). La paire « règle large sombre + règle plus précise qui rétablit les textes mesurés », la couleur de la
 * zone rétablie sur chacun de ses textes, un bloc ou une balise absents de l'article : elles ne peindraient que des textes
 * que personne n'a vus (autre page, contenu ajouté plus tard dans le CMS). Écrites comme dans le CSS Module, avec les
 * propriétés en cause (« .content > :nth-child(n+1) { color } »), sans doublon. `before` et `after` : les règles relevées
 * à chaque largeur (Capture.rules) ; null quand les règles d'après n'ont pas toutes été lues.
 */
export function unmeasuredRules(
  before: (Pick<RawRule, 'rule'>[] | null)[],
  after: (Pick<RawRule, 'rule' | 'selector' | 'properties' | 'effect'>[] | null)[],
): string[] | null {
  if (after.some((rules) => rules === null)) return null
  const known = new Set(before.flatMap((rules) => rules ?? []).map((entry) => withoutHash(entry.rule)))
  const rules = after.flatMap((rules) => rules ?? [])
  const effective = new Set(rules.filter((entry) => entry.effect).map((entry) => withoutHash(entry.rule)))
  const found = new Set<string>()
  for (const entry of rules) {
    const key = withoutHash(entry.rule)
    if (known.has(key) || effective.has(key)) continue
    found.add(ruleName(entry))
  }
  return [...found]
}

/**
 * Accès à l'aperçu du brouillon (`next dev` du clone de travail, 127.0.0.1:4042) : son URL, le cookie du secret d'aperçu
 * (ENGINE_PREVIEW_SECRET ; nom décidé par engine-core et le site), le navigateur (Chrome installé, playwright-core
 * channel « chrome » par défaut) et les largeurs relevées (375, 768, 1280). `settle` : attente appelée sur chaque page
 * après son chargement et ses polices, avant tout relevé (texte attendu présent, feuille rechargée…) ; aucune par défaut.
 *
 * Le secret passe par un COOKIE lié à l'origine de l'aperçu, jamais par un en-tête : les en-têtes supplémentaires d'un
 * contexte Playwright partent vers toutes les origines (images du CDN Sanity, polices…). Le secret n'est jamais journalisé
 * ni renvoyé.
 */
export type VisualSettings = {
  baseUrl: string
  cookies?: readonly { name: string; value: string }[]
  channel?: string
  viewports: number[]
  settle?: (page: Page) => Promise<void>
}

/**
 * URL de la page dans l'aperçu : un chemin absolu (`/`, `/blog/x`) de la même origine que l'aperçu, jamais une autre
 * origine (`//exemple.com`, `https://…`), ni un chemin relatif. Lève une erreur sinon.
 */
export function previewUrl(settings: Pick<VisualSettings, 'baseUrl'>, pagePath: string): string {
  const origin = new URL(settings.baseUrl).origin
  const target = new URL(pagePath, settings.baseUrl)
  if (!pagePath.startsWith('/') || pagePath.startsWith('//') || pagePath.includes('\\') || target.origin !== origin) {
    throw new Error(`Page path refused for the preview: ${JSON.stringify(pagePath.slice(0, 200))}`)
  }
  return target.toString()
}

async function openBrowser(channel: string | undefined): Promise<Browser> {
  try {
    return await chromium.launch({ channel: channel ?? 'chrome', headless: true })
  } catch {
    // Pas de Chrome installé : on tente le Chromium géré par Playwright.
    return chromium.launch({ headless: true })
  }
}

/** Contexte de navigation à cette largeur, avec le cookie de l'aperçu (lié à son origine). */
async function openContext(browser: Browser, settings: VisualSettings, viewport: number) {
  const context = await browser.newContext({ viewport: { width: viewport, height: 900 }, deviceScaleFactor: 1 })
  if (settings.cookies?.length) {
    const url = new URL(settings.baseUrl).origin
    await context.addCookies(settings.cookies.map(({ name, value }) => ({ name, value, url, httpOnly: true, sameSite: 'Lax' as const })))
  }
  return context
}

// Relevé brut de la zone sélectionnée, exécuté dans la page par Playwright, pour chaque occurrence demandée (`ranks` ;
// null pour une occurrence introuvable). En entier pour celles de `full` (capture d'avant, capture d'après, outil
// measure) ; pour les autres, et pour toutes dans un état forcé (`state`, décision 16) ou des règles désactivées ou
// remplacées le temps d'une lecture (décision 19), seulement la peinture de leurs textes, sans lignes, bords ni cadre. Le choix des éléments qui
// portent un texte, leurs clés et la lecture de leurs fonds sont ainsi les mêmes au repos, dans les états et sans une
// règle, écrits une seule fois : les textes se comparent à ceux du repos, clé par clé. Au repos, rend aussi les règles de
// la page qui peignent un texte (RawRule), un sélecteur et un groupe de peinture à la fois ; null au-delà de `maxRules`
// règles ; et `free` : une de ces occurrences contient, sous sa racine, une balise de `freeTags` (FREE_CONTENT_TAGS) sans
// attribut class, elle est à contenu libre (5e relecture). Lu dans le DOM seul (balises, attributs) : le CSS n'y change rien.
// Aucune fonction nommée ici, ni `const f = () => …` : ce callback est sérialisé vers le navigateur, et tsx/esbuild
// envelopperait ces fonctions dans un utilitaire __name qui n'y existe pas. Seulement des callbacks anonymes et des boucles for.
const READ_ZONE = ({
  selected,
  ranks,
  full,
  maxTexts,
  maxPaints,
  maxRules,
  groups,
  freeTags,
  state,
}: {
  selected: string
  ranks: number[]
  full: number[]
  maxTexts: number
  maxPaints: number
  maxRules: number
  groups: [PaintGroup, readonly string[]][]
  freeTags: string
  state: boolean
}): { zones: (RawZone | RawPaints | null)[]; rules: RawRule[] | null; free: boolean } => {
  // État forcé, ou règles désactivées : les transitions et animations en cours sont menées à leur fin ; on lit la valeur de
  // l'état, pas un entre-deux.
  if (state) {
    for (const animation of document.getAnimations()) {
      try {
        animation.finish()
      } catch {
        // Animation sans fin : laissée telle quelle (aucune n'est permise dans l'éditeur).
      }
    }
  }
  const instances = Array.from(document.querySelectorAll<HTMLElement>('[data-edit]')).filter(
    (node) => node.getAttribute('data-edit') === selected,
  )

  // Règles de style de la page, au repos seulement : @media et groupes dépliés (`maxRules` au plus : au-delà, `capped`),
  // chacune avec son contexte (en-têtes des @media et groupes qui la contiennent), si elle s'applique à cette largeur (sous
  // des @media qui y correspondent) et son chemin (indice de sa feuille dans document.styleSheets, puis son rang dans sa
  // feuille et dans chaque groupe) pour la retrouver. Une feuille illisible (autre origine) est ignorée.
  const styles: { rule: CSSStyleRule; context: string; applies: boolean; path: number[] }[] = []
  let capped = false
  if (!state) {
    const pending: { rule: CSSRule; context: string; applies: boolean; path: number[] }[] = []
    for (let sheet = 0; sheet < document.styleSheets.length; sheet++) {
      try {
        const list = Array.from(document.styleSheets[sheet].cssRules)
        for (let r = 0; r < list.length; r++) pending.push({ rule: list[r], context: '', applies: true, path: [sheet, r] })
      } catch {
        continue
      }
    }
    for (let r = 0; r < pending.length; r++) {
      if (r >= maxRules) {
        capped = true
        break
      }
      const { rule, context, applies, path } = pending[r]
      if (rule instanceof CSSStyleRule) styles.push({ rule, context, applies, path })
      else if (rule instanceof CSSGroupingRule) {
        const head = `${context}${rule.cssText.slice(0, rule.cssText.indexOf('{')).trim()} `
        const inner = applies && (!(rule instanceof CSSMediaRule) || window.matchMedia(rule.media.mediaText).matches)
        const list = Array.from(rule.cssRules)
        for (let c = 0; c < list.length; c++) pending.push({ rule: list[c], context: head, applies: inner, path: [...path, c] })
      }
    }
  }

  const zones: (RawZone | RawPaints | null)[] = []
  for (const rank of ranks) {
    const el = instances[rank]
    if (!el) {
      zones.push(null)
      continue
    }
    // Éléments de la zone, racine exclue, dans l'ordre du document.
    const inside = Array.from(el.querySelectorAll<HTMLElement>('*'))

    // Clé de chaque élément de la zone : rang de chaque ancêtre parmi les enfants de son parent, depuis la racine ('' pour
    // elle, « 1.0 » pour le 1er enfant de son 2e enfant). Un élément vient après son parent dans l'ordre du document.
    const keys = new Map<Element, string>([[el, '']])
    for (const node of inside) {
      const up = node.parentElement
      if (!up) continue
      const prefix = keys.get(up) ?? ''
      const index = String(Array.from(up.children).indexOf(node))
      keys.set(node, prefix === '' ? index : `${prefix}.${index}`)
    }

    // Alpha du fond de chaque élément de la zone et de ses ancêtres, lu une fois pour les couches de fond et pour les
    // lignes recouvertes, comme readPage du banc : « / alpha » de toute syntaxe, ou 4e valeur de rgba() ; transparent : 0 ;
    // illisible : opaque.
    const alphas = new Map<Element, number>()
    const around: Element[] = [...inside]
    for (let a: Element | null = el; a; a = a.parentElement) around.push(a)
    for (const node of around) {
      const color = getComputedStyle(node).backgroundColor
      let alpha = 1
      if (!color || color === 'transparent') alpha = 0
      else {
        const slash = color.match(/\/\s*([\d.]+)(%?)\s*\)$/)
        const legacy = color.match(/^rgba\(([^)]*)\)$/)
        if (slash) alpha = slash[2] ? parseFloat(slash[1]) / 100 : parseFloat(slash[1])
        else if (legacy && legacy[1].split(',').length === 4) {
          const last = legacy[1].split(',')[3].trim()
          alpha = last.endsWith('%') ? parseFloat(last) / 100 : parseFloat(last)
        }
      }
      alphas.set(node, alpha)
    }

    // Éléments qui portent un texte en propre (nœud texte non vide), dans l'ordre du document : peinture des `maxPaints`
    // premiers rendus (couleur, taille, graisse, et couches de fond du plus proche au plus lointain, jusqu'au premier fond
    // opaque), nombre de tous ceux qui sont rendus, et clés de ceux qui ne le sont pas (display: none, visibility: hidden
    // ou collapse, ancêtre masqué), 50 au plus.
    const shown: { node: HTMLElement; ns: CSSStyleDeclaration; paint: RawPaint }[] = []
    const hiddenTexts: string[] = []
    let total = 0
    for (const node of [el, ...inside]) {
      const own = Array.from(node.childNodes).some(
        (child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '',
      )
      if (!own) continue
      const key = keys.get(node) ?? ''
      const ns = getComputedStyle(node)
      if (ns.display === 'none' || ns.visibility !== 'visible' || node.getClientRects().length === 0) {
        if (hiddenTexts.length < 50) hiddenTexts.push(key)
        continue
      }
      total++
      if (shown.length >= maxPaints) continue
      const layers: { color: string; image: string }[] = []
      for (let a: HTMLElement | null = node; a; a = a.parentElement) {
        const as = getComputedStyle(a)
        const alpha = alphas.get(a) ?? 1
        if (alpha > 0 || as.backgroundImage !== 'none') layers.push({ color: as.backgroundColor, image: as.backgroundImage })
        if (alpha >= 1) break
      }
      shown.push({
        node,
        ns,
        paint: {
          key,
          text: (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
          color: ns.color,
          fontSize: parseFloat(ns.fontSize),
          fontWeight: ns.fontWeight,
          layers,
        },
      })
    }
    const textPaints: RawPaints = { texts: shown.map((entry) => entry.paint), total }
    if (state || !full.includes(rank)) {
      zones.push(textPaints)
      continue
    }

    // Un plafond du relevé des lignes recouvertes est atteint (ou celui des règles de la page, plus haut) : l'avertissement
    // dira que le relevé est partiel.
    let partial = capped
    const style = getComputedStyle(el)
    const rect = el.getBoundingClientRect()

    // Boîte de contenu du parent : sa boîte moins bordures et marges intérieures, à gauche et à droite.
    let parent: RawZone['parent'] = null
    if (el.parentElement) {
      const ps = getComputedStyle(el.parentElement)
      const pr = el.parentElement.getBoundingClientRect()
      const start = (parseFloat(ps.borderLeftWidth) || 0) + (parseFloat(ps.paddingLeft) || 0)
      const end = (parseFloat(ps.borderRightWidth) || 0) + (parseFloat(ps.paddingRight) || 0)
      parent = { left: pr.left + start, width: pr.width - start - end }
    }

    // Éléments de la zone visés par une règle d'état de la page (:hover, :focus, :focus-visible, :focus-within, :active) qui
    // pose un fond, une image de fond ou une largeur de bordure (sélecteur lu sans son état). La capture ne survole ni ne
    // sélectionne rien : un élément qui ne peint rien au repos peut peindre dans ces états, il compte alors comme peint.
    // Seulement les @media qui s'appliquent à cette largeur ; une feuille illisible (autre origine) est ignorée, un sélecteur
    // illisible fait compter toute la zone comme peinte. Limite connue (décision 17) : un transform d'état n'est pas lu ; le
    // soulèvement au survol (translateY de --space-1 ou --space-2, 8 px au plus) d'un élément qui peint peut toucher les
    // jambages de la ligne au-dessus sans être relevé.
    const stateTargets = new Set<Element>()
    let stateAll = false
    for (const { rule, applies } of styles) {
      if (!applies || !/:(hover|focus|active)/i.test(rule.selectorText)) continue
      let paints = false
      for (let k = 0; k < rule.style.length; k++) {
        if (/^background-(color|image)$|^border-.*width$/.test(rule.style[k])) paints = true
      }
      if (!paints) continue
      try {
        const rest = rule.selectorText.replace(/:(hover|focus-visible|focus-within|focus|active)/gi, ':is(*)')
        for (const target of Array.from(el.querySelectorAll(rest))) stateTargets.add(target)
      } catch {
        stateAll = true
      }
    }

    // Éléments de la zone (racine exclue) dont la boîte peut cacher un texte : ceux qui peignent au repos (fond, image de
    // fond, bordure) ou dans un état, et ceux en ligne dont le padding vertical déborde de leurs lettres ; 50 au plus, et
    // leurs fragments (getClientRects, padding et bordure compris), 200 au plus, en px depuis le coin haut gauche de la page.
    // La grille de chaque ligne sonde aussi les bords et le milieu de ceux qui la chevauchent : une bande plus étroite que
    // l'écart entre deux abscisses (un mot court rapetissé, avec fond et padding) ne passe plus entre deux points.
    // Chaque fragment garde aussi son cœur (sans padding ni bordure, en hauteur) et dit si son élément est de niveau ligne
    // (inline, inline-block…) : posé sur la même ligne qu'un texte de son bloc, il est à côté de lui, pas dessus.
    const edges: {
      node: HTMLElement
      inline: boolean
      left: number
      top: number
      right: number
      bottom: number
      coreTop: number
      coreBottom: number
    }[] = []
    let edged = 0
    for (const node of inside) {
      const ns = getComputedStyle(node)
      const border =
        (parseFloat(ns.borderTopWidth) || 0) +
        (parseFloat(ns.borderRightWidth) || 0) +
        (parseFloat(ns.borderBottomWidth) || 0) +
        (parseFloat(ns.borderLeftWidth) || 0)
      // Fond d'alpha nul écrit autrement que transparent : compté comme peint, il n'ajoute que des points.
      const paints =
        !['transparent', 'rgba(0, 0, 0, 0)'].includes(ns.backgroundColor) || ns.backgroundImage !== 'none' || border > 0
      const padded = ns.display === 'inline' && (parseFloat(ns.paddingTop) || 0) + (parseFloat(ns.paddingBottom) || 0) > 0
      if (!paints && !padded && !stateAll && !stateTargets.has(node)) continue
      if (edged >= 50 || edges.length >= 200) {
        partial = true
        break
      }
      edged++
      const above = (parseFloat(ns.paddingTop) || 0) + (parseFloat(ns.borderTopWidth) || 0)
      const below = (parseFloat(ns.paddingBottom) || 0) + (parseFloat(ns.borderBottomWidth) || 0)
      for (const box of Array.from(node.getClientRects())) {
        if (box.width <= 0 || box.height <= 0) continue
        if (edges.length >= 200) {
          partial = true
          break
        }
        edges.push({
          node,
          inline: ns.display.startsWith('inline'),
          left: box.left + window.scrollX,
          top: box.top + window.scrollY,
          right: box.right + window.scrollX,
          bottom: box.bottom + window.scrollY,
          coreTop: box.top + above + window.scrollY,
          coreBottom: box.bottom - below + window.scrollY,
        })
      }
    }

    // Textes relevés en entier : les `maxTexts` premiers rendus (même de taille nulle : drapeau collapsed, son texte déborde
    // ou disparaît), avec leur peinture, leurs lignes et leurs lignes recouvertes.
    const texts: RawZone['texts'] = []
    // Élément de chaque texte, et pour chacune des lignes de ses propres nœuds de texte : le nœud et une grille de points
    // (abscisses × hauteurs), en px depuis le coin haut gauche de la page. Les lignes recouvertes se cherchent à la fin, en
    // faisant défiler la page.
    const owners: HTMLElement[] = []
    // `later` : fragments suivants de l'élément du texte, en ligne sur plusieurs lignes, qui peuvent recouvrir cette ligne.
    type Edge = { left: number; top: number; right: number; bottom: number }
    const probes: { node: Node; xs: number[]; ys: number[]; later: Edge[] }[][] = []
    for (const { node, ns, paint } of shown.slice(0, maxTexts)) {
      const nr = node.getBoundingClientRect()

      // Lignes : rectangles non vides du contenu, 200 au plus, regroupés côté Node (countRows).
      const range = document.createRange()
      range.selectNodeContents(node)
      const rects: { top: number; bottom: number }[] = []
      for (const line of Array.from(range.getClientRects())) {
        if (rects.length >= 200) break
        if (line.width > 0 && line.height > 0) rects.push({ top: line.top, bottom: line.bottom })
      }

      // Rangées de tous les textes du bloc qui porte les lignes de l'élément (lui-même, ou pour un élément de niveau ligne
      // comme le mot mis en avant, en ligne ou en pastille inline-block, son premier ancêtre qui ne l'est pas), descendants
      // compris : rectangles des nœuds de texte seulement (la boîte d'un élément, padding compris, n'est pas une ligne de
      // texte), 1 000 au plus. Elles bornent la bande de chaque ligne : les lignes du titre au-dessus et au-dessous d'une
      // pastille comptent, comme pour un mot mis en avant en ligne.
      let block: HTMLElement = node
      while (block.parentElement) {
        const display = getComputedStyle(block).display
        if (display !== 'contents' && !display.startsWith('inline')) break
        block = block.parentElement
      }
      const rows: { top: number; bottom: number }[] = []
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
      for (let text = walker.nextNode(); text && rows.length < 1000; text = walker.nextNode()) {
        if ((text.textContent ?? '').trim() === '') continue
        const whole = document.createRange()
        whole.selectNodeContents(text)
        for (const box of Array.from(whole.getClientRects())) {
          if (box.width > 0 && box.height > 0) rows.push({ top: box.top, bottom: box.bottom })
        }
      }

      // Lignes de ses propres nœuds de texte (Range sur chaque nœud, pas sur tout le contenu : le texte d'un descendant,
      // mot mis en avant compris, a son propre relevé), 200 au plus, chacune avec sa grille de points :
      // - abscisses : quart gauche, centre et quart droit (décision 15), plus une tous les demi-corps (256 au plus), pour
      //   qu'aucun recouvrement plus large qu'un demi-caractère ne passe entre deux points, plus les bords (à 1 px) et le
      //   milieu de chaque fragment de `edges` qui chevauche la ligne, et autant de hauteurs dans sa bande ;
      // - hauteurs : mi-hauteur (décision 15), plus 5, 20, 35, 50, 65, 80 et 95 % de la bande de la ligne, du haut des
      //   capitales au bas des jambages : le fond d'un mot mis en avant agrandi par padding mord sur la ligne voisine par
      //   son bord, bien avant d'atteindre sa mi-hauteur. La bande est le rectangle de la ligne, moins ce qu'il partage
      //   avec les rangées voisines (interligne serré : deux lignes s'y chevauchent sans se cacher, et le point y
      //   tomberait sur l'autre ligne), jamais plus, de chaque côté, que le chevauchement de deux lignes de ce texte
      //   (hauteur du rectangle moins l'interligne) et 1 px : une rangée voisine plus grande n'efface pas la bande. Quand le
      //   rectangle du texte ne dépasse la boîte propre de l'élément que de cet interligne (pastille inline-block, 1re ou
      //   dernière ligne d'un titre à interligne serré), la bande est bornée à la boîte : ce débord n'est pas une ligne.
      const step = Math.max(4, (parseFloat(ns.fontSize) || 16) / 2)
      const leading = parseFloat(ns.lineHeight)
      const lines: (typeof probes)[number] = []
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType !== Node.TEXT_NODE || (child.textContent ?? '').trim() === '') continue
        const part = document.createRange()
        part.selectNodeContents(child)
        for (const line of Array.from(part.getClientRects())) {
          if (lines.length >= 200) break
          if (line.width <= 0 || line.height <= 0) continue
          // Interligne « normal » : les lignes ne se chevauchent pas, 1 px seulement.
          const excess = Math.max(0, line.height - (Number.isNaN(leading) ? line.height : leading))
          const trim = excess + 1
          let top = line.top
          let bottom = line.bottom
          for (const row of rows) {
            const shared = Math.min(row.bottom, line.bottom) - Math.max(row.top, line.top)
            // Même rangée (chevauchement d'au moins la moitié de la plus petite hauteur, comme countRows) ou aucune part.
            if (shared <= 0 || shared >= Math.min(row.bottom - row.top, line.height) / 2) continue
            if (row.top < line.top) top = Math.max(top, Math.min(row.bottom, line.top + trim))
            else bottom = Math.min(bottom, Math.max(row.top, line.bottom - trim))
          }
          if (line.top < nr.top && nr.top - line.top <= excess + 0.5) top = Math.max(top, nr.top)
          if (line.bottom > nr.bottom && line.bottom - nr.bottom <= excess + 0.5) bottom = Math.min(bottom, nr.bottom)
          const ys = [line.top + line.height / 2 + window.scrollY]
          if (bottom - top >= 1) {
            for (const share of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) ys.push(top + (bottom - top) * share + window.scrollY)
          }
          const xs: number[] = []
          for (const share of [0.25, 0.5, 0.75]) xs.push(line.left + line.width * share + window.scrollX)
          const columns = Math.min(256, Math.max(1, Math.ceil(line.width / step)))
          for (let k = 0; k < columns; k++) xs.push(line.left + (line.width * (k + 0.5)) / columns + window.scrollX)
          // Sauf l'élément du texte et ses ancêtres : leur fond est peint sous ce texte. Sauf aussi un fragment qui chevauche
          // la bande de la ligne de moins de 1 px (arrondi sous le pixel : à interligne serré, le fragment de la rangée
          // suivante touche le rectangle de la ligne sans toucher sa bande), et un fragment d'un élément de niveau ligne du
          // même bloc dont le cœur est sur la même rangée que la ligne : il est posé à côté du texte, pas dessus.
          for (let e = 0; e < edges.length; e++) {
            const edge = edges[e]
            if (edge.node.contains(node)) continue
            const left = Math.max(edge.left, line.left + window.scrollX)
            const right = Math.min(edge.right, line.right + window.scrollX)
            const high = Math.max(edge.top, top + window.scrollY)
            const low = Math.min(edge.bottom, bottom + window.scrollY)
            if (right <= left || low - high < 1) continue
            const shared =
              Math.min(edge.coreBottom, line.bottom + window.scrollY) - Math.max(edge.coreTop, line.top + window.scrollY)
            if (edge.inline && block.contains(edge.node) && shared >= Math.min(edge.coreBottom - edge.coreTop, line.height) / 2) {
              continue
            }
            if (xs.length >= 350) {
              partial = true
              break
            }
            const inset = Math.min(1, (right - left) / 4)
            xs.push(left + inset, (left + right) / 2, right - inset)
            if (ys.length >= 60) {
              partial = true
              continue
            }
            const margin = Math.min(1, (low - high) / 4)
            ys.push(high + margin, (high + low) / 2, low - margin)
          }
          // Un élément en ligne sur plusieurs lignes peint le fond de chaque fragment avant le texte de sa ligne : le fond d'un
          // fragment suivant (sur une rangée plus bas), agrandi par padding-block, recouvre ses lignes précédentes, alors
          // qu'elementFromPoint y renvoie l'élément lui-même. Seulement s'il peint (fond, bordure, état) ou porte un padding
          // vertical, comme les autres fragments de `edges`.
          const later: Edge[] = []
          for (const edge of edges) {
            if (edge.node === node && edge.coreTop > line.top + line.height / 2 + window.scrollY) later.push(edge)
          }
          lines.push({ node: child, xs, ys, later })
        }
      }

      texts.push({
        ...paint,
        rects,
        // Moins d'un demi-pixel : rien ne se voit de la boîte (flex: 1 1 0 avec min-width: 0).
        collapsed: nr.width < 0.5 || nr.height < 0.5,
        ownLines: lines.length,
        coveredLines: [],
      })
      owners.push(node)
      probes.push(lines)
    }

    // Éléments de la zone (racine comprise) déplacés par position: relative, 20 au plus : Blink rend le décalage utilisé
    // dans top et left (bottom: 96px donne top: -96px ; static donne auto, lu 0). Même clé que les textes.
    const offsets: RawZone['offsets'] = []
    for (const node of [el, ...inside]) {
      if (offsets.length >= 20) break
      const ns = getComputedStyle(node)
      if (ns.position !== 'relative') continue
      const top = parseFloat(ns.top) || 0
      const left = parseFloat(ns.left) || 0
      if (top === 0 && left === 0) continue
      offsets.push({ key: keys.get(node) ?? '', top, left })
    }

    // Étendue du contenu (texte et éléments, même débordant de la boîte de la zone), en px depuis le coin haut gauche de la
    // page : un contenu poussé à gauche ou en haut de la page y disparaît sans défilement. Tous les rectangles, sans
    // plafond : le dernier élément d'une longue zone ne doit pas échapper au relevé.
    const all = document.createRange()
    all.selectNodeContents(el)
    let content: RawZone['content'] = null
    for (const part of Array.from(all.getClientRects())) {
      if (part.width === 0 || part.height === 0) continue
      const left = part.left + window.scrollX
      const top = part.top + window.scrollY
      const right = part.right + window.scrollX
      content = content
        ? { left: Math.min(content.left, left), top: Math.min(content.top, top), right: Math.max(content.right, right) }
        : { left, top, right }
    }

    const children: RawZone['children'] = []
    for (const child of Array.from(el.children)) {
      const cr = child.getBoundingClientRect()
      if (cr.width > 0 && cr.height > 0) children.push({ left: cr.left, top: cr.top, width: cr.width, height: cr.height })
    }

    // Lignes recouvertes : une ligne l'est dès qu'un point de sa grille n'est pas vu : le fond d'un voisin de flex peint
    // par-dessus un texte qui déborde, le fond d'un mot mis en avant agrandi par padding sur les lignes voisines, un ancêtre
    // qui la coupe, hors de la page. Un point est vu si elementFromPoint renvoie l'élément du texte, ou, dans ses lettres,
    // un de ses descendants qui ne peint rien (le mot mis en avant sans fond, plus grand, qui déborde), et si
    // caretPositionFromPoint (ou caretRangeFromPoint) retombe dans son nœud de texte (ou dans le texte de ce descendant).
    // Les deux : Chrome résout le caret d'un élément en ligne par les lignes de son bloc, pas par ce qui est peint au-dessus
    // (sous le fond agrandi d'un <em>, il renvoie encore le texte du titre). Ces API ne voient que l'écran : la page défile
    // jusqu'au point au besoin, sans animation, après tous les autres relevés (qui dépendent du défilement), puis revient
    // où elle était.
    const scrollLeft = window.scrollX
    const scrollTop = window.scrollY
    const viewWidth = document.documentElement.clientWidth
    const viewHeight = document.documentElement.clientHeight
    const caretPosition = typeof document.caretPositionFromPoint === 'function'
    const caretRange = typeof document.caretRangeFromPoint === 'function'
    const inlineTags = 'A ABBR B CITE CODE EM I Q S SMALL SPAN STRONG SUB SUP TIME U'.split(' ')
    for (let i = 0; i < texts.length; i++) {
      for (let j = 0; j < probes[i].length; j++) {
        const probe = probes[i][j]
        let seen = true
        for (let a = 0; seen && a < probe.ys.length; a++) {
          for (let b = 0; seen && b < probe.xs.length; b++) {
            const px = probe.xs[b]
            const py = probe.ys[a]
            if (
              px - window.scrollX < 0 ||
              py - window.scrollY < 0 ||
              px - window.scrollX >= viewWidth ||
              py - window.scrollY >= viewHeight
            ) {
              window.scrollTo({ left: px - viewWidth / 2, top: py - viewHeight / 2, behavior: 'instant' })
            }
            // Hors de la page (à gauche ou en haut), le point reste hors de l'écran : rien n'y est, la ligne ne se voit pas.
            const x = px - window.scrollX
            const y = py - window.scrollY
            const hit = document.elementFromPoint(x, y)
            // Un descendant de l'élément du texte qui ne peint rien jusqu'à lui (balise de texte en ligne, sans fond, image de
            // fond ni bordure, au repos comme dans un état) laisse voir le texte dessous, mais seulement dans ses lettres (les
            // rectangles de ses propres nœuds de texte) : un mot mis en avant plus grand déborde sans cacher. Son padding et
            // sa bordure recouvrent : un état peut y poser un fond que la capture ne voit pas. Toute autre balise (image,
            // svg…) compte comme peinte.
            let clear = hit === owners[i]
            if (!clear && hit && owners[i].contains(hit)) {
              clear = true
              for (let up: Element | null = hit; clear && up && up !== owners[i]; up = up.parentElement) {
                if (!inlineTags.includes(up.tagName) || stateAll || stateTargets.has(up)) {
                  clear = false
                  break
                }
                const us = getComputedStyle(up)
                const alpha = alphas.get(up) ?? 1
                const border =
                  (parseFloat(us.borderTopWidth) || 0) +
                  (parseFloat(us.borderRightWidth) || 0) +
                  (parseFloat(us.borderBottomWidth) || 0) +
                  (parseFloat(us.borderLeftWidth) || 0)
                // Alpha illisible (NaN) : compte comme peint. Un pseudo-élément (::before, ::after) aussi.
                if (alpha !== 0 || us.backgroundImage !== 'none' || border > 0) clear = false
                if (getComputedStyle(up, '::before').content !== 'none' || getComputedStyle(up, '::after').content !== 'none') {
                  clear = false
                }
              }
              let glyphs = false
              for (const part of Array.from(hit.childNodes)) {
                if (!clear || glyphs || part.nodeType !== Node.TEXT_NODE) continue
                const letters = document.createRange()
                letters.selectNodeContents(part)
                for (const box of Array.from(letters.getClientRects())) {
                  // 1 px de marge : le test de elementFromPoint arrondit la boîte au pixel près.
                  if (x >= box.left - 1 && x <= box.right + 1 && y >= box.top - 1 && y <= box.bottom + 1) glyphs = true
                }
              }
              if (!glyphs) clear = false
            }
            // Sous un fragment suivant du même élément (son fond agrandi par padding-block) : recouvert.
            for (const box of probe.later) {
              if (px >= box.left && px <= box.right && py >= box.top && py <= box.bottom) clear = false
            }
            if (!clear) {
              seen = false
              continue
            }
            const caret = caretPosition
              ? (document.caretPositionFromPoint(x, y)?.offsetNode ?? null)
              : caretRange
                ? (document.caretRangeFromPoint(x, y)?.startContainer ?? null)
                : probe.node
            // Sur un descendant qui ne peint rien, le caret retombe dans son texte à lui (ses lettres débordent sur la ligne).
            const through = hit !== null && hit !== owners[i] && caret !== null && hit.contains(caret)
            if (caret !== probe.node && !through) seen = false
          }
        }
        if (!seen) texts[i].coveredLines.push(j)
      }
    }
    window.scrollTo({ left: scrollLeft, top: scrollTop, behavior: 'instant' })

    zones.push({
      box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      // Aucune boîte : zone non rendue (ancêtre masqué, display: contents) ; une boîte de taille nulle reste rendue.
      boxes: el.getClientRects().length,
      parent,
      margins: {
        top: parseFloat(style.marginTop) || 0,
        right: parseFloat(style.marginRight) || 0,
        bottom: parseFloat(style.marginBottom) || 0,
        left: parseFloat(style.marginLeft) || 0,
      },
      offsets,
      content,
      pageWidth: document.documentElement.clientWidth,
      style: {
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        maxWidth: style.maxWidth,
        color: style.color,
        opacity: style.opacity,
        display: style.display,
        textAlign: style.textAlign,
        gridTemplateColumns: style.gridTemplateColumns,
      },
      // Mots mis en avant réellement rendus (décision 20) : un <em> masqué n'est pas relevé, ni le texte masqué qu'il
      // contient (innerText, pas textContent).
      accents: Array.from(el.querySelectorAll<HTMLElement>('em'))
        .filter((node) => node.getClientRects().length > 0 && node.innerText.trim() !== '')
        .map((node) => ({ text: node.innerText, color: getComputedStyle(node).color })),
      children,
      texts,
      hiddenTexts,
      occurrences: instances.length,
      partial,
      paints: textPaints,
      // États forcés (décision 16) : relevés par la capture, après la capture d'écran au repos.
      states: [],
    })
  }
  if (state) return { zones, rules: [], free: false }

  // Zone à contenu libre : une balise de bloc sans classe sous la racine d'une occurrence relevée.
  let free = false
  for (const rank of ranks) {
    const el = instances[rank]
    if (!el) continue
    for (const node of Array.from(el.querySelectorAll(freeTags))) {
      if ((node.getAttribute('class') ?? '').trim() === '') free = true
    }
  }

  // Règles qui peignent un texte, un sélecteur de leur liste (virgules hors parenthèses) et un groupe de peinture
  // (`groups` : PAINT_GROUPS) à la fois. Chacun est identifié par son contexte, ce sélecteur et les seules déclarations du
  // groupe (raccourcis compris : `background: var(--x)` ne se lit que sur le raccourci) : une règle dont seules d'autres
  // propriétés changent (marges), ou un autre groupe, garde cette identité. Son effet se juge après la modification
  // (TOGGLE_RULES).
  const rules: RawRule[] = []
  for (const { rule, context, applies, path } of styles) {
    const list = rule.selectorText
    const selectors: string[] = []
    let depth = 0
    let start = 0
    for (let c = 0; c < list.length; c++) {
      if (list[c] === '(') depth++
      else if (list[c] === ')') depth--
      else if (list[c] === ',' && depth === 0) {
        selectors.push(list.slice(start, c).trim())
        start = c + 1
      }
    }
    selectors.push(list.slice(start).trim())
    for (const [group, names] of groups) {
      const properties: string[] = []
      const declarations: string[] = []
      for (const property of names) {
        const value = rule.style.getPropertyValue(property)
        if (!value) continue
        properties.push(property)
        declarations.push(`${property}: ${value}${rule.style.getPropertyPriority(property) ? ' !important' : ''}`)
      }
      if (!properties.length) continue
      for (let i = 0; i < selectors.length; i++) {
        rules.push({
          rule: `${context}${selectors[i]} { ${declarations.join('; ')} }`,
          selector: selectors[i],
          group,
          properties,
          applies,
          at: { path, list },
          effect: false,
        })
      }
    }
  }
  return { zones, rules: capped ? null : rules, free }
}

/**
 * READ_ZONE au repos, pour chaque occurrence de `ranks` (null : introuvable) : en entier (RawZone) pour celles de `full`,
 * la peinture de ses textes (RawPaints) pour les autres ; les règles de la page qui peignent un texte ; et si la zone est à
 * contenu libre (FREE_CONTENT_TAGS).
 */
const readZones = async (page: Page, zone: string, ranks: number[], full: number[]) =>
  (await page.evaluate(READ_ZONE, {
    selected: zone,
    ranks,
    full,
    maxTexts: MAX_TEXTS,
    maxPaints: MAX_PAINTS,
    maxRules: MAX_RULES,
    groups: Object.entries(PAINT_GROUPS) as [PaintGroup, readonly string[]][],
    freeTags: FREE_CONTENT_TAGS,
    state: false,
  })) as { zones: (RawZone | RawPaints | null)[]; rules: RawRule[] | null; free: boolean }

/**
 * READ_ZONE réduit à la peinture des textes, dans l'état forcé du moment ou avec les règles désactivées ou remplacées
 * (TOGGLE_RULES), pour chaque occurrence demandée.
 */
const readPaints = async (page: Page, zone: string, ranks: number[]) =>
  (
    (await page.evaluate(READ_ZONE, {
      selected: zone,
      ranks,
      full: [],
      maxTexts: MAX_TEXTS,
      maxPaints: MAX_PAINTS,
      maxRules: MAX_RULES,
      groups: [],
      freeTags: FREE_CONTENT_TAGS,
      state: true,
    })) as { zones: (RawPaints | null)[] }
  ).zones

/** Groupe de peinture d'un sélecteur d'une règle de la page, désactivé (`replacement` vide) ou remplacé (valeur témoin). */
export type Toggle = RawRule['at'] & { selector: string; properties: string[]; replacement: string }

/**
 * Réunit les bascules d'un même sélecteur d'une même règle (même chemin, même liste) : leurs propriétés et leurs valeurs
 * témoins, à la place de la première. TOGGLE_RULES insère une copie par bascule : deux copies d'un même sélecteur, chacune
 * sans un seul groupe, garderaient ensemble les deux (5e relecture : la couleur et le fond d'une même règle désactivés pour
 * juger seule une autre règle).
 */
export function mergeToggles(toggles: Toggle[]): Toggle[] {
  const merged: Toggle[] = []
  for (const toggle of toggles) {
    const same = merged.find(
      (entry) => entry.path.join() === toggle.path.join() && entry.list === toggle.list && entry.selector === toggle.selector,
    )
    if (!same) {
      merged.push({ ...toggle, properties: [...toggle.properties] })
      continue
    }
    for (const property of toggle.properties) if (!same.properties.includes(property)) same.properties.push(property)
    same.replacement = [same.replacement, toggle.replacement].filter(Boolean).join(' ')
  }
  return merged
}

/** Règle de la page touchée par TOGGLE_RULES : son chemin, sa liste de sélecteurs, ses déclarations, et ses copies. */
type Toggled = { path: number[]; list: string; text: string; copies: number }

// Désactive (`saved` null) ou restaure (`saved` : ce que la désactivation a rendu) des groupes de peinture de sélecteurs
// de règles de la page (décision 19), retrouvées par leur chemin (RawRule.at) et le texte de leur liste de sélecteurs.
// Pour chaque règle, dans l'ordre inverse du document (une insertion ne décale ainsi que des règles déjà traitées) :
// chacun de ses sélecteurs en cause reçoit une copie de la règle pour lui seul, insérée juste avant elle (même place
// dans la cascade), sans les propriétés du groupe, ou avec les valeurs témoins `replacement` ; la règle perd ces
// sélecteurs (ou toutes ses déclarations, s'ils y étaient tous). Les autres sélecteurs de la liste gardent la règle
// entière. La restauration défait tout dans l'ordre inverse (copies retirées, liste et déclarations rendues), et
// vérifie chaque règle. Le style est recalculé aussitôt (READ_ZONE mène ensuite à leur fin les transitions qu'il
// déclenche). Une règle introuvable, ou mal restaurée, fait échouer la capture : rien ne se juge sur une page que la mesure
// aurait changée. Aucune fonction nommée ici (voir READ_ZONE).
const TOGGLE_RULES = ({ toggles, saved }: { toggles: Toggle[]; saved: Toggled[] | null }): Toggled[] => {
  if (saved !== null) {
    for (let d = saved.length - 1; d >= 0; d--) {
      const { path, list, text, copies } = saved[d]
      let parent: CSSStyleSheet | CSSGroupingRule = document.styleSheets[path[0]]
      for (let k = 1; k < path.length - 1; k++) parent = parent.cssRules[path[k]] as CSSGroupingRule
      const at = path[path.length - 1]
      for (let c = 0; c < copies; c++) parent.deleteRule(at)
      const rule = parent.cssRules[at]
      if (!(rule instanceof CSSStyleRule)) throw new Error(`Rule not found: ${list}`)
      rule.selectorText = list
      rule.style.cssText = text
      if (rule.selectorText !== list || rule.style.cssText !== text) throw new Error(`Rule not restored correctly: ${list}`)
    }
    void document.documentElement.getBoundingClientRect()
    return saved
  }
  // Règles en cause, retrouvées avant toute modification, et leurs sélecteurs à désactiver ou à remplacer.
  const entries: { rule: CSSStyleRule; path: number[]; list: string; own: Toggle[] }[] = []
  for (const toggle of toggles) {
    let entry = entries.find((candidate) => candidate.path.join() === toggle.path.join())
    if (!entry) {
      let parent: CSSStyleSheet | CSSGroupingRule = document.styleSheets[toggle.path[0]]
      for (let k = 1; k < toggle.path.length - 1; k++) parent = parent.cssRules[toggle.path[k]] as CSSGroupingRule
      const rule = parent.cssRules[toggle.path[toggle.path.length - 1]]
      if (!(rule instanceof CSSStyleRule) || rule.selectorText !== toggle.list) {
        throw new Error(`Rule not found: ${toggle.list}`)
      }
      entry = { rule, path: toggle.path, list: toggle.list, own: [] }
      entries.push(entry)
    }
    entry.own.push(toggle)
  }
  entries.sort((a, b) => {
    for (let k = 0; k < Math.min(a.path.length, b.path.length); k++) if (a.path[k] !== b.path[k]) return b.path[k] - a.path[k]
    return b.path.length - a.path.length
  })
  const done: Toggled[] = []
  for (const { rule, path, list, own } of entries) {
    const parent = (rule.parentRule as CSSGroupingRule | null) ?? (rule.parentStyleSheet as CSSStyleSheet)
    const at = Array.prototype.indexOf.call(parent.cssRules, rule)
    const text = rule.style.cssText
    // Sélecteurs de la liste (virgules hors parenthèses), comme READ_ZONE les a lus.
    const selectors: string[] = []
    let depth = 0
    let start = 0
    for (let c = 0; c < list.length; c++) {
      if (list[c] === '(') depth++
      else if (list[c] === ')') depth--
      else if (list[c] === ',' && depth === 0) {
        selectors.push(list.slice(start, c).trim())
        start = c + 1
      }
    }
    selectors.push(list.slice(start).trim())
    for (const toggle of own) {
      parent.insertRule(`${toggle.selector} { ${text} }`, at)
      const copy = parent.cssRules[at] as CSSStyleRule
      for (const property of toggle.properties) copy.style.removeProperty(property)
      if (toggle.replacement) copy.style.cssText = `${copy.style.cssText} ${toggle.replacement}`
    }
    const rest = selectors.filter((selector) => !own.some((toggle) => toggle.selector === selector))
    if (rest.length) {
      rule.selectorText = rest.join(', ')
      if (rule.selectorText === list) throw new Error(`Selector not removed from its list: ${list}`)
    } else rule.style.cssText = ''
    done.push({ path, list, text, copies: own.length })
  }
  void document.documentElement.getBoundingClientRect()
  return done
}

// Portée d'une règle sur des textes relevés (décision 19, 4e relecture) : pour chaque texte (rang de l'occurrence, clé),
// la règle (`selector`, sans ses états) le vise-t-elle de près ? Oui si elle vise son élément, ou l'élément qui porte en
// propre le texte dont il fait partie en ligne (le mot mis en avant d'un titre, un <strong> dans un intertitre), et si son
// sujet a une classe, ou une balise d'un élément qui n'est pas en ligne (la taille d'un <strong> dépend de son bloc). Non
// pour un texte atteint par héritage d'un élément sans texte à lui (la zone, un conteneur), ou par un sujet sans classe ni
// balise (`:nth-child(2)` seul) : ailleurs, sur une autre page ou avec un autre contenu du CMS, elle peindrait d'autres
// textes que ceux de la page. Un sélecteur illisible compte comme large. Aucune fonction nommée ici (voir READ_ZONE).
const REACH_SCOPE = ({
  selected,
  selector,
  subject,
  targets,
}: {
  selected: string
  selector: string
  subject: 'class' | 'tag' | 'none'
  targets: { rank: number; key: string }[]
}): boolean[] => {
  const instances = Array.from(document.querySelectorAll<HTMLElement>('[data-edit]')).filter(
    (node) => node.getAttribute('data-edit') === selected,
  )
  const precise: boolean[] = []
  for (const { rank, key } of targets) {
    // Élément du texte : rang de chaque ancêtre parmi les enfants de son parent, depuis la racine de la zone (READ_ZONE).
    let node: Element | null = instances[rank] ?? null
    if (key !== '') for (const part of key.split('.')) node = node ? (node.children[Number(part)] ?? null) : null
    let matched: Element | null = null
    try {
      for (let current = node; current;) {
        if (current.matches(selector)) {
          matched = current
          break
        }
        if (!getComputedStyle(current).display.startsWith('inline')) break
        const up: Element | null = current.parentElement
        let own = false
        for (const child of Array.from(up?.childNodes ?? [])) {
          if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '') own = true
        }
        current = own ? up : null
      }
    } catch {
      matched = null
    }
    precise.push(
      matched !== null && (subject === 'class' || (subject === 'tag' && !getComputedStyle(matched).display.startsWith('inline'))),
    )
  }
  return precise
}

// Sélecteurs (états remplacés par :is(*)) qui s'appliquent à la racine de la zone dans chacune des occurrences `ranks` : une
// règle de toute la zone, qui peint partout où la zone s'affiche (5e relecture : rulesApart). Un sélecteur illisible, ou
// aucune occurrence trouvée, compte comme non. Aucune fonction nommée ici (voir READ_ZONE).
const ZONE_WIDE = ({ selected, ranks, selectors }: { selected: string; ranks: number[]; selectors: string[] }): boolean[] => {
  const instances = Array.from(document.querySelectorAll<HTMLElement>('[data-edit]')).filter(
    (node) => node.getAttribute('data-edit') === selected,
  )
  const roots: HTMLElement[] = []
  for (const rank of ranks) if (instances[rank]) roots.push(instances[rank])
  const wide: boolean[] = []
  for (const selector of selectors) {
    let all = roots.length > 0
    try {
      for (const root of roots) if (!root.matches(selector)) all = false
    } catch {
      all = false
    }
    wide.push(all)
  }
  return wide
}

/**
 * Jugement des règles de peinture par leur effet (décision 19), dans la capture d'après : `known`, les identités (sans
 * hachage) des règles relevées avant la modification, à toutes les largeurs ; `proven`, celles des règles dont l'effet est
 * mesuré (à une largeur précédente, au repos ou dans un état déjà relevé) ; `exposures`, les textes qu'elles peignent, ou
 * peindraient sans une règle plus précise de la même modification, sous le minimum (4e relecture) ; `scopes`, la portée
 * déjà lue de chaque règle sur chaque texte (REACH_SCOPE), par largeur ; `roots`, pour chaque sélecteur et chaque liste
 * d'occurrences, s'il vise toute la zone (ZONE_WIDE, 5e relecture).
 */
type Judge = {
  known: Set<string>
  proven: Set<string>
  exposures: RuleExposure[]
  scopes: Map<string, boolean>
  roots: Map<string, boolean>
}

/**
 * Lecture de la capture d'après : largeur, occurrences de la zone sur la page, état forcé (null : repos), et si la zone est
 * à contenu libre (READ_ZONE, FREE_CONTENT_TAGS).
 */
type Moment = { viewport: number; occurrences: number; kind: StateKind | null; free: boolean }

// Minimum WCAG d'un texte courant (4,5) : celui d'une règle large, qui peindrait ailleurs des textes de toute taille.
const BODY_CONTRAST = requiredContrast(16, 400)

/**
 * Valeurs témoins d'un groupe de peinture, propriété par propriété : improbables dans le site, et changées si la règle
 * s'en sert déjà (valeur en dur accordée par le client).
 */
const WITNESSES: Record<string, [string, string]> = {
  color: ['rgb(1, 2, 3)', 'rgb(3, 2, 1)'],
  background: ['rgb(1, 2, 3)', 'rgb(3, 2, 1)'],
  'background-color': ['rgb(1, 2, 3)', 'rgb(3, 2, 1)'],
  'background-image': ['linear-gradient(rgb(1, 2, 3), rgb(1, 2, 3))', 'linear-gradient(rgb(3, 2, 1), rgb(3, 2, 1))'],
  font: ['100 7px serif', '900 9px serif'],
  'font-size': ['7px', '9px'],
  'font-weight': ['100', '900'],
}

/**
 * Déclarations témoins d'une règle : chaque propriété du groupe qu'elle pose, avec une valeur qu'elle n'a pas. Une valeur
 * témoin change la peinture de tout texte relevé que la règle peint, même quand sa valeur égale celle qui s'appliquerait
 * sans elle (C01 : `.footer { color: var(--color-ink) }`, la couleur du body).
 */
const witnessOf = ({ rule, properties }: Pick<RawRule, 'rule' | 'properties'>) =>
  properties
    .map((property) => {
      const [value, other] = WITNESSES[property]
      return `${property}: ${rule.includes(value) ? other : value};`
    })
    .join(' ')

/**
 * Juge, dans l'état du moment (repos ou état forcé), chaque règle de `candidates` (décision 19), sur la peinture des
 * occurrences `ranks` (`baseline` : la lecture de ce moment, toutes les règles actives). Chaque lecture se fait le temps
 * d'un TOGGLE_RULES, défait dans un finally.
 * - Effet : le groupe de peinture de la règle est remplacé par des valeurs témoins (witnessOf) ; s'il change la propriété
 *   de son groupe sur un texte relevé (reachedTexts), sa valeur atteint ce texte (`proven`). Une valeur égale à celle qui
 *   s'appliquerait sans elle (C01) le montre aussi.
 * - Règles qui la rattrapent (4e relecture) : les autres règles ajoutées ou modifiées de son groupe (`rules`) sont
 *   désactivées le temps d'une lecture ; les textes que sa valeur atteint alors (valeur témoin), et pas avec elles, lui
 *   sont repris par une règle plus précise de la même modification : ils se jugent sur cette lecture, sans elles.
 * - Zone à contenu libre (`moment.free`, 5e relecture), pour une couleur ou un fond : la règle est aussi relue seule, sans
 *   les autres règles ajoutées ou modifiées de tout groupe, hors celles du même sélecteur et celles de toute la zone
 *   (rulesApart, ZONE_WIDE) ; les textes que sa valeur atteint alors se jugent sur cette lecture (`apart`). Une couleur
 *   lisible sur les seules balises de la page grâce au fond d'une autre règle (ou l'inverse, ou une taille qui abaisse le
 *   seuil) peindrait seule ailleurs : une liste, une citation ou un sous-titre d'un autre article.
 * - Minimum : un texte repris, ou atteint par la règle seule, doit passer son seuil ; un texte atteint par une règle large
 *   (REACH_SCOPE : par héritage, ou sans classe ni balise de bloc) doit passer 4,5, quelle que soit sa taille, pour une
 *   couleur ou un fond. Sinon, il est noté (`exposures`), une fois par texte. Un texte atteint de près est jugé par
 *   contrastCheck ; un fond inconnu ne compte pas.
 */
async function judgeRules(
  page: Page,
  zone: string,
  ranks: number[],
  baseline: (RawPaints | null)[],
  candidates: RawRule[],
  rules: RawRule[],
  judge: Judge,
  moment: Moment,
): Promise<void> {
  const toggleOf = (rule: RawRule, replacement: string): Toggle => ({
    ...rule.at,
    selector: rule.selector,
    properties: [...PAINT_GROUPS[rule.group]],
    replacement,
  })
  const read = async (list: Toggle[]) => {
    const toggles = mergeToggles(list)
    const saved = await page.evaluate(TOGGLE_RULES, { toggles, saved: null })
    try {
      return await readPaints(page, zone, ranks)
    } finally {
      await page.evaluate(TOGGLE_RULES, { toggles, saved })
    }
  }
  // Sélecteurs de ces règles qui visent toute la zone (ZONE_WIDE), lus une fois par liste d'occurrences.
  const wideOf = async (list: RawRule[]) => {
    const rootKey = (selector: string) => `${ranks.join()}|${selector}`
    const unknown = [...new Set(list.map((rule) => rule.selector))].filter((selector) => !judge.roots.has(rootKey(selector)))
    if (unknown.length) {
      const found = await page.evaluate(ZONE_WIDE, {
        selected: zone,
        ranks,
        selectors: unknown.map((selector) => selector.replace(STATE_CLASS, ':is(*)')),
      })
      unknown.forEach((selector, i) => judge.roots.set(rootKey(selector), found[i]))
    }
    return new Set(list.map((rule) => rule.selector).filter((selector) => judge.roots.get(rootKey(selector))))
  }
  const paintAt = (reads: (RawPaints | null)[], { index, key }: { index: number; key: string }) =>
    reads[index]?.texts.find((text) => text.key === key)
  for (const candidate of candidates) {
    const key = withoutHash(candidate.rule)
    const witness = toggleOf(candidate, witnessOf(candidate))
    const reached = reachedTexts(candidate.group, baseline, await read([witness]))
    if (reached.length) judge.proven.add(key)

    // Textes que les autres règles ajoutées ou modifiées de son groupe lui reprennent, et leur peinture sans elles.
    const siblings = rules
      .filter((other) => other !== candidate && other.group === candidate.group)
      .map((other) => toggleOf(other, ''))
    let without = baseline
    let masked: { index: number; key: string }[] = []
    if (siblings.length) {
      without = await read(siblings)
      if (reachedTexts(candidate.group, baseline, without).length) {
        const direct = new Set(reached.map((text) => `${text.index}|${text.key}`))
        masked = reachedTexts(candidate.group, without, await read([...siblings, witness])).filter(
          (text) => !direct.has(`${text.index}|${text.key}`),
        )
      }
    }

    // Zone à contenu libre (5e relecture) : une couleur ou un fond relus seuls, sans les autres règles de la modification
    // qui peuvent ne pas l'accompagner ailleurs (rulesApart) ; seulement s'il y en a d'un autre groupe (sinon, c'est la
    // lecture sans les règles de son groupe, ci-dessus).
    const strict = candidate.group !== 'font'
    let alone = baseline
    let apart: { index: number; key: string }[] = []
    if (moment.free && strict) {
      const others = rulesApart(
        candidate,
        rules,
        await wideOf(rules.filter((other) => other !== candidate && other.group !== candidate.group)),
      )
      if (others.some((other) => other.group !== candidate.group)) {
        const toggles = others.map((other) => toggleOf(other, ''))
        alone = await read(toggles)
        apart = reachedTexts(candidate.group, alone, await read([...toggles, witness]))
      }
    }

    // Textes sous le minimum qu'une règle large, reprise ou seule peut exiger (4,5 pour une couleur ou un fond, sinon leur
    // seuil).
    type Way = 'reached' | 'masked' | 'apart'
    const pending: { index: number; key: string; paint: RawPaint; way: Way; ratio: number; required: number }[] = []
    for (const [list, reads, way] of [
      [reached, baseline, 'reached'],
      [masked, without, 'masked'],
      [apart, alone, 'apart'],
    ] as const) {
      for (const text of list) {
        const paint = paintAt(reads, text)
        if (!paint) continue
        const { ratio, required } = textContrast(paint)
        if (ratio === null || ratio >= Math.max(required, strict ? BODY_CONTRAST : 0)) continue
        if (way === 'reached' && !strict) continue
        pending.push({ ...text, paint, way, ratio, required })
      }
    }
    if (!pending.length) continue

    // Portée de la règle sur ces textes (REACH_SCOPE), lue une fois par largeur.
    const scopeKey = (text: { index: number; key: string }) => `${moment.viewport}|${key}|${ranks[text.index]}|${text.key}`
    const unknown = pending.filter((text) => strict && !judge.scopes.has(scopeKey(text)))
    if (unknown.length) {
      const precise = await page.evaluate(REACH_SCOPE, {
        selected: zone,
        selector: candidate.selector.replace(STATE_CLASS, ':is(*)'),
        subject: selectorSubject(candidate.selector),
        targets: unknown.map((text) => ({ rank: ranks[text.index], key: text.key })),
      })
      unknown.forEach((text, i) => judge.scopes.set(scopeKey(text), precise[i]))
    }
    // Un texte noté une fois par règle et par moment : large ou repris d'abord, seule ensuite.
    const exposed = new Set<string>()
    for (const text of pending) {
      const broad = strict && judge.scopes.get(scopeKey(text)) === false
      const minimum = broad ? Math.max(text.required, BODY_CONTRAST) : text.required
      if ((text.way === 'reached' && !broad) || text.ratio >= minimum) continue
      const id = `${text.index}|${text.key}`
      if (text.way === 'apart' && exposed.has(id)) continue
      exposed.add(id)
      judge.exposures.push({
        rule: ruleName(candidate),
        viewport: moment.viewport,
        occurrence: ranks[text.index],
        occurrences: moment.occurrences,
        kind: moment.kind,
        key: text.key,
        text: text.paint.text,
        ratio: text.ratio,
        required: minimum,
        masked: text.way === 'masked',
        apart: text.way === 'apart',
        broad,
      })
    }
  }
}

/**
 * Relève la peinture des textes de chaque occurrence de `ranks` dans chaque état forcé (planStates, sur l'arbre DOM du
 * protocole Chrome), par CSS.forcePseudoState, qui ne force que les nœuds nommés : les états relevés, par rang
 * d'occurrence. Seuls les nœuds dont les pseudo-classes changent d'un état au suivant sont renvoyés au navigateur.
 * `ranks` : les occurrences dont un texte au moins est rendu au repos (une occurrence masquée ou introuvable n'a pas
 * d'état). Dans la capture d'après, chaque état juge aussi les règles de peinture ajoutées ou modifiées (`judge`, avec
 * la sorte d'état, ses occurrences et leur lecture : judgeRules). Une erreur du protocole fait échouer la capture : rien ne
 * passe sans avoir été mesuré.
 */
async function readStates(
  page: Page,
  zone: string,
  ranks: number[],
  judge: ((kind: StateKind, ranks: number[], painted: (RawPaints | null)[]) => Promise<void>) | null,
): Promise<Map<number, RawState[]>> {
  const states = new Map<number, RawState[]>()
  if (!ranks.length) return states
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    let current = new Map<number, string[]>()
    for (const plan of planStates(root, zone, ranks)) {
      for (const nodeId of current.keys()) {
        if (!plan.forced.has(nodeId)) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
      }
      for (const [nodeId, classes] of plan.forced) {
        if (current.get(nodeId)?.join() === classes.join()) continue
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: classes })
      }
      current = plan.forced
      const painted = await readPaints(page, zone, plan.ranks)
      plan.ranks.forEach((rank, i) => {
        const paints = painted[i]
        if (!paints) return
        const list = states.get(rank) ?? []
        list.push({ kind: plan.kind, hover: plan.hover, focus: plan.focus, ...paints })
        states.set(rank, list)
      })
      if (judge) await judge(plan.kind, plan.ranks, painted)
    }
  } finally {
    await cdp.detach().catch(() => {})
  }
  return states
}

async function capture(
  browser: Browser,
  settings: VisualSettings,
  pagePath: string,
  viewport: number,
  zone: string,
  index: number,
  judge: Judge | null,
): Promise<Capture> {
  const context = await openContext(browser, settings, viewport)
  try {
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const response = await page.goto(previewUrl(settings, pagePath), {
      waitUntil: 'networkidle',
      timeout: 90_000,
    })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    if (settings.settle) await settings.settle(page)

    // Pas de fonction nommée dans ce callback : il est sérialisé vers le navigateur, et certains
    // transpileurs (tsx/esbuild) les enveloppent dans un utilitaire __name qui n'y existe pas.
    const info = await page.evaluate(
      ({ selected, properties }) => {
        const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-edit]'))
        const targets = elements.filter((el) => el.getAttribute('data-edit') === selected)
        const counters = new Map<string, number>()
        const zones = elements.map((el) => {
          const id = el.getAttribute('data-edit') ?? ''
          const index = counters.get(id) ?? 0
          counters.set(id, index + 1)
          const rect = el.getBoundingClientRect()
          const computed = getComputedStyle(el)
          return {
            key: `${id}#${index}`,
            zone: id,
            index,
            x: Math.round(rect.left + window.scrollX),
            y: Math.round(rect.top + window.scrollY),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            // Texte visible de la zone, moins celui de ses zones intérieures directes (une zone plus profonde est dans le
            // texte de sa zone parente) : une carte article garde son chapô et sa date, l'en-tête n'a rien à lui (logo et
            // menu sont des zones). innerText : le texte rendu, sans le texte masqué ; un élément SVG ou MathML n'en a pas
            // (undefined) : son textContent, sinon rien.
            text: Array.from(el.querySelectorAll<HTMLElement>('[data-edit]'))
              .filter((inner) => inner.parentElement?.closest('[data-edit]') === el)
              .reduce(
                (rest, inner) => rest.replace(inner.innerText ?? inner.textContent ?? '', ' '),
                el.innerText ?? el.textContent ?? '',
              )
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 150),
            relation: (targets.includes(el)
              ? 'self'
              : targets.some((target) => target.contains(el))
                ? 'child'
                : targets.some((target) => el.contains(target))
                  ? 'ancestor'
                  : 'other') as ZoneRelation,
            own: properties.map((property) => computed.getPropertyValue(property)),
            fingerprint: [el, ...Array.from(el.querySelectorAll<HTMLElement>('*')).slice(0, 300)]
              .map((node) => {
                const style = getComputedStyle(node)
                const box = node.getBoundingClientRect()
                const values = properties.map((property) => style.getPropertyValue(property)).join('|')
                return `${values}|${Math.round(box.width)}x${Math.round(box.height)}`
              })
              .join('\n'),
          }
        })
        // Le panneau d'erreur de Next.js en dev vit dans un shadow DOM.
        const portal = document.querySelector('nextjs-portal')?.shadowRoot
        const nextError = portal?.querySelector('[data-nextjs-dialog], [data-nextjs-toast-errors-parent]')
          ? 'Next.js error displayed'
          : null
        return { zones, overflow: document.documentElement.scrollWidth - window.innerWidth, nextError }
      },
      { selected: zone, properties: FINGERPRINT_PROPERTIES },
    )

    // Relevé de chaque occurrence de la zone (décision 18), dont l'occurrence sélectionnée : mesure d'avant
    // (startVisualSession) et d'après (verify). En entier pour les MAX_OCCURRENCES premières (cadre, texte recouvert) ; la
    // peinture de leurs textes (contraste) pour les MAX_PAINTED_OCCURRENCES premières ; et les règles de la page qui
    // peignent un texte.
    const total = info.zones.filter((box) => box.zone === zone).length
    const ranks = occurrenceRanks(total, index)
    const painted = paintedRanks(total, index)
    const read = await readZones(page, zone, painted, ranks)

    const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' })
    const paintsOf = (raw: RawZone | RawPaints | null) => (raw && 'box' in raw ? raw.paints : raw)
    // Capture d'après (décision 19) : règles de peinture ajoutées ou modifiées (absentes avant) qui s'appliquent à cette
    // largeur, jugées au repos, puis dans chaque état forcé : celles qui n'ont encore montré aucun effet, et celles qui
    // visent un état (leurs textes n'y sont peints que là). Après la capture d'écran, comme les états.
    const candidates = judge
      ? (read.rules ?? []).filter((entry) => entry.applies && !judge.known.has(withoutHash(entry.rule)))
      : []
    const moment = { viewport, occurrences: total, free: read.free }
    if (judge) {
      await judgeRules(page, zone, painted, read.zones.map(paintsOf), candidates, candidates, judge, { ...moment, kind: null })
    }
    const judgeState =
      judge && candidates.length
        ? async (kind: StateKind, ranks: number[], paints: (RawPaints | null)[]) => {
            const pending = candidates.filter(
              (entry) => !judge.proven.has(withoutHash(entry.rule)) || entry.selector.replace(STATE_CLASS, '') !== entry.selector,
            )
            if (pending.length) await judgeRules(page, zone, ranks, paints, pending, candidates, judge, { ...moment, kind })
          }
        : null
    // États forcés (décision 16), après la capture d'écran : la page reste au repos pour elle et pour le relevé ci-dessus.
    // Seulement pour les occurrences dont un texte au moins est rendu.
    const states = await readStates(
      page,
      zone,
      painted.filter((_, i) => (paintsOf(read.zones[i])?.total ?? 0) > 0),
      judgeState,
    )
    const whole = new Map<number, ZoneMeasure>()
    const measures = painted.map((rank, i): PaintedMeasure => {
      const raw = read.zones[i]
      const forced = states.get(rank) ?? []
      if (!ranks.includes(rank)) return toPaintedMeasure(viewport, raw as RawPaints | null, rank, total, forced)
      const measure = toZoneMeasure(viewport, raw && { ...(raw as RawZone), states: forced }, rank)
      whole.set(rank, measure)
      return measure
    })
    if (info.nextError) errors.push(info.nextError)
    return {
      viewport,
      status: response?.status() ?? 0,
      errors,
      overflow: info.overflow,
      zones: info.zones,
      png: PNG.sync.read(screenshot),
      measure: whole.get(index)!,
      occurrences: ranks.map((rank) => whole.get(rank)!),
      painted: measures,
      rules:
        read.rules && read.rules.map((entry) => ({ ...entry, effect: !!judge && judge.proven.has(withoutHash(entry.rule)) })),
    } satisfies Capture
  } finally {
    await context.close()
  }
}

/** Rendu réel de l'élément sélectionné, sur une page fraîche du brouillon : ce que Claude ne voit pas autrement. */
async function measureZone(
  browser: Browser,
  settings: VisualSettings,
  pagePath: string,
  viewport: number,
  zone: string,
  index: number,
): Promise<ZoneMeasure> {
  const context = await openContext(browser, settings, viewport)
  try {
    const page = await context.newPage()
    await page.goto(previewUrl(settings, pagePath), { waitUntil: 'networkidle', timeout: 90_000 })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    if (settings.settle) await settings.settle(page)
    const { zones } = await readZones(page, zone, [index], [index])
    return toZoneMeasure(viewport, zones[0] as RawZone | null, index)
  } finally {
    await context.close()
  }
}

export type VisualVerdict = {
  render: { ok: boolean; detail?: string }
  responsive: { ok: boolean; detail?: string }
  /** `placement` : zones intérieures seulement replacées (marges, alignement, ordre), signalées sans refus. */
  isolation: { ok: boolean; detail?: string; zones: string[]; placement?: string }
  /** Relevé de la zone dans le brouillon modifié, dans l'ordre des largeurs. */
  after: ZoneMeasure[]
  /** Relevé de chaque occurrence de la zone dans le brouillon modifié, par largeur puis dans l'ordre du document. */
  occurrences: ZoneMeasure[]
  /**
   * Relevé de peinture de chaque occurrence de la zone dans le brouillon modifié (contraste : 100 au plus, plus l'occurrence
   * sélectionnée), par largeur puis dans l'ordre du document.
   */
  painted: PaintedMeasure[]
  /**
   * Règles de peinture ajoutées ou modifiées sans effet sur les textes relevés de la zone (unmeasuredRules, décision 19),
   * écrites comme dans le CSS Module avec les propriétés en cause (« .content { color } ») ; null quand les règles de la
   * page n'ont pas toutes été lues (plus de MAX_RULES).
   */
  unmeasured: string[] | null
  /**
   * Textes que ces règles peignent sous le minimum là où elles peuvent s'appliquer (4e relecture) : un texte qu'une règle
   * plus précise de la même modification leur reprend, jugé sans elle ; un texte qu'une règle large peint sous 4,5.
   */
  unreadable: RuleExposure[]
}

export type VisualSession = {
  /** Relevé de la zone avant modification, tiré des captures d'avant, dans l'ordre des largeurs. */
  before: ZoneMeasure[]
  /** Textes des autres zones de la page (état d'avant, plus grande largeur), en lecture seule pour Claude. */
  pageTexts: PageText[]
  /**
   * Relevé de chaque occurrence de la zone avant modification (12 au plus, plus l'occurrence sélectionnée), par largeur
   * puis dans l'ordre du document.
   */
  occurrences: ZoneMeasure[]
  /**
   * Relevé de peinture de chaque occurrence de la zone avant modification (contraste : 100 au plus, plus l'occurrence
   * sélectionnée), par largeur puis dans l'ordre du document.
   */
  painted: PaintedMeasure[]
  /** Mesure l'élément dans le brouillon tel qu'il est maintenant, à chaque largeur. */
  measure: () => Promise<ZoneMeasure[]>
  /** Recapture le brouillon modifié et le compare à l'état d'avant. */
  verify: () => Promise<VisualVerdict>
  /** Enregistre les captures avant/après de la zone modifiée, pour l'admin. */
  saveShots: (dir: string) => Promise<string[]>
  close: () => Promise<void>
}

/** Ouvre le navigateur et capture l'état d'avant, à chaque largeur. */
export async function startVisualSession(
  settings: VisualSettings,
  pagePath: string,
  zone: string,
  index: number,
): Promise<VisualSession> {
  // Avant d'ouvrir le navigateur : une page d'une autre origine est refusée (previewUrl).
  previewUrl(settings, pagePath)
  const browser = await openBrowser(settings.channel)
  const before = new Map<number, Capture>()
  let after = new Map<number, Capture>()

  try {
    for (const viewport of settings.viewports) {
      before.set(viewport, await capture(browser, settings, pagePath, viewport, zone, index, null))
    }
  } catch (err) {
    await browser.close()
    throw err
  }
  // Règles de peinture relevées avant la modification, à toutes les largeurs : les autres sont ajoutées ou modifiées, et
  // jugées sur leur effet dans chaque capture d'après (décision 19).
  const known = new Set(
    settings.viewports.flatMap((viewport) => before.get(viewport)!.rules ?? []).map((entry) => withoutHash(entry.rule)),
  )
  // Relevés une seule fois, sur l'état d'avant, à la plus grande largeur.
  const pageTexts = pageTextsOf(before.get(Math.max(...settings.viewports))?.zones ?? [])

  return {
    pageTexts,
    before: settings.viewports.map((viewport) => before.get(viewport)!.measure),
    occurrences: settings.viewports.flatMap((viewport) => before.get(viewport)!.occurrences),
    painted: settings.viewports.flatMap((viewport) => before.get(viewport)!.painted),

    async measure() {
      const measures: ZoneMeasure[] = []
      for (const viewport of settings.viewports) {
        measures.push(await measureZone(browser, settings, pagePath, viewport, zone, index))
      }
      return measures
    },

    async verify() {
      after = new Map()
      // Effet mesuré à une largeur : inutile de le chercher encore aux suivantes, dans les états.
      const judge: Judge = { known, proven: new Set<string>(), exposures: [], scopes: new Map(), roots: new Map() }
      for (const viewport of settings.viewports) {
        after.set(viewport, await capture(browser, settings, pagePath, viewport, zone, index, judge))
      }

      const renderProblems: string[] = []
      const overflowing: string[] = []
      const changed = new Map<string, Set<number>>()
      const placed = new Map<string, { viewports: Set<number>; properties: Set<string> }>()

      for (const viewport of settings.viewports) {
        const was = before.get(viewport)!
        const now = after.get(viewport)!
        if (now.status >= 400) renderProblems.push(`HTTP ${now.status} at ${viewport} px`)
        for (const error of now.errors) renderProblems.push(`${error} (${viewport} px)`)
        if (now.overflow > 1 && now.overflow > was.overflow) overflowing.push(`${viewport} px (+${now.overflow} px)`)
        for (const change of compareZones(was, now)) {
          if (change.reason === 'placement') {
            const entry = placed.get(change.zone) ?? { viewports: new Set<number>(), properties: new Set<string>() }
            entry.viewports.add(viewport)
            for (const property of change.properties ?? []) entry.properties.add(property)
            placed.set(change.zone, entry)
          } else {
            changed.set(change.zone, (changed.get(change.zone) ?? new Set()).add(viewport))
          }
        }
      }

      return {
        after: settings.viewports.map((viewport) => after.get(viewport)!.measure),
        occurrences: settings.viewports.flatMap((viewport) => after.get(viewport)!.occurrences),
        painted: settings.viewports.flatMap((viewport) => after.get(viewport)!.painted),
        unmeasured: unmeasuredRules(
          settings.viewports.map((viewport) => before.get(viewport)!.rules),
          settings.viewports.map((viewport) => after.get(viewport)!.rules),
        ),
        unreadable: judge.exposures,
        render: { ok: renderProblems.length === 0, detail: renderProblems.join('; ') || undefined },
        responsive: {
          ok: overflowing.length === 0,
          detail: overflowing.length ? `Horizontal overflow at ${overflowing.join(', ')}` : undefined,
        },
        isolation: {
          ok: changed.size === 0,
          zones: [...changed.keys()],
          detail: changed.size
            ? [...changed].map(([id, viewports]) => `${id} (${[...viewports].join(', ')} px)`).join(', ')
            : undefined,
          placement: placed.size
            ? [...placed]
                .map(([id, { viewports, properties }]) => {
                  return `${id} (${[...viewports].join(', ')} px: ${[...properties].join(', ')})`
                })
                .join(', ')
            : undefined,
        },
      }
    },

    async saveShots(dir) {
      await mkdir(dir, { recursive: true })
      const saved: string[] = []
      for (const viewport of settings.viewports) {
        for (const [moment, captures] of [['before', before], ['after', after]] as const) {
          const shot = captures.get(viewport)
          const box = shot?.zones.find((z) => z.zone === zone && z.width > 0 && z.height > 0)
          const image = shot && box ? crop(shot.png, box) : null
          if (!image) continue
          const name = `${viewport}-${moment}.png`
          await writeFile(path.join(dir, name), PNG.sync.write(image))
          saved.push(name)
        }
      }
      return saved
    },

    async close() {
      await browser.close()
    },
  }
}
