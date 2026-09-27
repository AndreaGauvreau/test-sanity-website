import { EDITOR_VIEWPORTS } from '../../../src/admin/core/contracts/engine'
import { formatRatio } from './contrast'
import {
  coveredCount,
  excerpt,
  MAX_OCCURRENCES,
  MAX_PAINTS,
  MAX_RULES,
  type Offset,
  type PaintedMeasure,
  type PaintText,
  type RuleExposure,
  type StateKind,
  type StateMeasure,
  type TextMeasure,
  type ZoneMeasure,
} from './measure'

/**
 * Contrôles du rendu après modification, calculés sur la mesure unique d’avant et d’après. Purs.
 */

/**
 * Contrôle du rendu tel que le POC le calcule, textes traduits en anglais (même logique, mêmes seuils) : `label` et
 * `detail` (relevé technique, pour Kuartz et le journal du moteur), `problem` = consigne renvoyée à Claude s’il échoue
 * (Claude travaille en anglais). Le client ne le voit jamais tel quel : report.ts en fait un CheckResult du contrat, au
 * libellé anglais fixe.
 */
export type RawCheck = { id: string; label: string; ok: boolean; detail?: string; problem: string }

/** Au-delà de 1 px, un dépassement n’est plus un arrondi. */
const TOLERANCE = 1

/** « the zone 96 px up », « an inner element 16 px down and 8 px to the right ». */
function describeOffset({ key, top, left }: Offset): string {
  const moves: string[] = []
  if (top) moves.push(`${Math.abs(top)} px ${top < 0 ? 'up' : 'down'}`)
  if (left) moves.push(`${Math.abs(left)} px to the ${left < 0 ? 'left' : 'right'}`)
  return `${key === '' ? 'the zone' : 'an inner element'} ${moves.join(' and ')}`
}

/**
 * Ce qui fait refuser le cadre : sortie du parent (dépassement, marge négative), taille nulle, texte devenu invisible,
 * contenu sorti de la page, décalage relatif.
 */
type FrameFault = 'escape' | 'collapse' | 'text' | 'outside' | 'offset'

/**
 * Constat et consigne à Claude pour chaque cause, par ordre de priorité : la première cause présente donne le constat
 * en tête du message, puis viennent les consignes de toutes les causes présentes, dans cet ordre.
 */
const FAULTS: { fault: FrameFault; headline: string; advice: string }[] = [
  {
    fault: 'escape',
    headline: 'The zone goes out of the frame of its parent',
    advice:
      'a negative margin or a calc() must not widen a zone beyond its container. ' +
      'If the width depends on a container outside the zone, change nothing and explain it to the client.',
  },
  {
    fault: 'collapse',
    headline: 'The zone is shrunk to nothing',
    advice: 'a zone is never hidden by a zero width or height (flex, min-width…): give it back its size.',
  },
  {
    fault: 'text',
    headline: 'A text of the zone is no longer visible',
    advice:
      'a text is never hidden: neither by a zero width or height (flex, min-width…), nor by display: none or ' +
      'visibility: give each element back its size and its place.',
  },
  {
    fault: 'outside',
    headline: 'The content of the zone goes out of the page',
    advice:
      'the content of a zone must never go out of the page, where it is no longer visible: give the zone back its width and its ' +
      'alignment (flex, min-width, justify-content…).',
  },
  {
    fault: 'offset',
    headline: 'The zone or one of its elements is moved by an offset',
    advice:
      'the top, right, bottom and left properties must move neither the zone nor its elements: remove the offset ' +
      '(or the position: relative that makes it effective); to add space, use margin or padding.',
  },
]

/**
 * Relevé d’avant de la même largeur et de la même occurrence : chaque occurrence d’une zone répétée se compare à elle-même
 * (décision 18).
 */
const twin = <T extends PaintedMeasure>(before: T[], now: T) =>
  before.find((measure) => measure.viewport === now.viewport && measure.occurrence === now.occurrence)

/** « 375 px », ou « 375 px (occurrence 3 of 3) » pour une zone répétée sur la page. */
const where = (measure: ZoneMeasure) => `${measure.viewport} px${measure.occurrences > 1 ? ` (${occurrenceOf(measure)})` : ''}`

const occurrenceOf = (measure: ZoneMeasure) => `occurrence ${measure.occurrence + 1} of ${measure.occurrences}`

/** « a », « a and b », « a, b and c » (messages à Claude). */
const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? ''))

/** Zone affichée avec une taille, à cette largeur : ni introuvable, ni masquée, ni déjà de taille nulle. */
const shown = (measure: ZoneMeasure) => measure.found && !measure.hidden && measure.width > 0 && measure.height > 0

/** Texte qui se voit, au moins en partie : ni réduit à rien, et une ligne au moins qui n’est pas recouverte. */
const readable = (text: TextMeasure) => !text.collapsed && text.coveredLines.length < text.ownLines

/** Texte rendu sans aucune ligne visible : taille nulle, ou plus aucune ligne rendue. */
const vanished = (text: TextMeasure) => text.collapsed || text.ownLines === 0

/**
 * Textes visibles avant, réduits à rien ou masqués après, dans une zone affichée des deux côtés : « “Accueil” shrunk
 * to nothing ». Un texte absent après sans être masqué (mots mis en avant retirés par set_text, texte vidé) n’est pas un
 * masquage : les contrôles du texte en répondent. Un texte recouvert par un autre élément n’est pas refusé ici : c’est un
 * avertissement (coverWarning, décision 17).
 */
function lostTexts(was: ZoneMeasure, now: ZoneMeasure): string[] {
  if (!was.found || was.hidden || !now.found || now.hidden) return []
  const lost: string[] = []
  for (const text of was.texts.filter(readable)) {
    const next = now.texts.find((candidate) => candidate.key === text.key)
    const state = next ? (vanished(next) ? 'shrunk to nothing' : null) : now.hiddenTexts.includes(text.key) ? 'hidden' : null
    if (state) lost.push(`“${excerpt(text.text, 40)}” ${state}`)
  }
  return lost
}

/**
 * Avertissement non bloquant (décision 17) : `step` pour l’activité, `client` ajouté au message final au client (null
 * quand seul le relevé est partiel, sans texte recouvert). En anglais : les deux sont lus par le client (admin en anglais).
 */
export type CoverWarning = { step: string; client: string | null }

/** « a », « a and b », « a, b and c ». */
const listEn = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? ''))

/** « occurrence 3 of 3 ». */
const occurrenceEn = (measure: ZoneMeasure) => `occurrence ${measure.occurrence + 1} of ${measure.occurrences}`

/**
 * Pourquoi le relevé est partiel : plus de MAX_OCCURRENCES occurrences (seules les premières sont relevées), ou un
 * plafond de READ_ZONE atteint (RawZone.partial).
 */
function partialReasons(after: ZoneMeasure[]): string[] {
  const reasons: string[] = []
  const total = Math.max(0, ...after.map((measure) => measure.occurrences))
  if (total > MAX_OCCURRENCES) reasons.push(`only the first ${MAX_OCCURRENCES} of ${total} occurrences`)
  const capped = [...new Set(after.filter((measure) => measure.partial).map((measure) => measure.viewport))]
  if (capped.length) reasons.push(`too many painted elements in the zone at ${listEn(capped.map(String))} px`)
  return reasons
}

/**
 * Textes recouverts après la modification, en tout ou en partie, par un autre élément (le fond d’un voisin, d’un mot mis
 * en avant agrandi par padding…), ou null. Une ligne compte quand elle est recouverte après alors qu’elle ne l’était pas
 * avant, au même rang : une ligne qui se voyait, ou une ligne nouvelle (texte allongé, ou réparti sur plus de lignes). Une
 * ligne déjà recouverte avant ne compte pas, ni un texte dont aucune ligne ne se voyait avant ; un texte nouveau (mot mis en
 * avant ajouté) ou une zone masquée avant comptent toutes leurs lignes recouvertes. Un texte réduit à rien est refusé par
 * frameCheck, pas signalé ici. Le relevé géométrique se trompe parfois d’un pixel et le client valide toujours le
 * résultat : ni refus ni 2e essai, mais une étape visible dans l’activité et une phrase obligatoire dans le message final.
 * Chaque occurrence d’une zone répétée se compare à elle-même et se nomme (décision 18). Au-delà de MAX_OCCURRENCES
 * occurrences, ou si un plafond du relevé est atteint, l’avertissement dit que le relevé est partiel.
 */
export function coverWarning(before: ZoneMeasure[], after: ZoneMeasure[]): CoverWarning | null {
  // Un groupe par texte (et par occurrence), dans l’ordre de première apparition : ses lignes recouvertes à chaque
  // largeur, et les largeurs où il est caché en entier (hidden) ou seulement en partie (covered).
  const groups = new Map<string, { label: string; at: string[]; hidden: number[]; covered: number[] }>()
  for (const now of after) {
    if (!now.found || now.hidden) continue
    const was = twin(before, now)
    const compared = was && was.found && !was.hidden ? was : null
    for (const text of now.texts) {
      if (vanished(text)) continue
      const old = compared?.texts.find((candidate) => candidate.key === text.key)
      if (old && !readable(old)) continue
      const fresh = text.coveredLines.filter((line) => !old?.coveredLines.includes(line))
      if (!fresh.length) continue
      const label = `“${excerpt(text.text, 40)}”${now.occurrences > 1 ? ` (${occurrenceEn(now)})` : ''}`
      const group = groups.get(`${now.occurrence}|${text.key}|${label}`) ?? { label, at: [], hidden: [], covered: [] }
      group.at.push(`at ${now.viewport} px (${coveredCount(text.coveredLines.length, text.ownLines, '')})`)
      ;(text.coveredLines.length >= text.ownLines ? group.hidden : group.covered).push(now.viewport)
      groups.set(`${now.occurrence}|${text.key}|${label}`, group)
    }
  }
  // Relevé partiel : l’avertissement le dit, même sans texte recouvert.
  const reasons = partialReasons(after)
  if (!groups.size) {
    if (!reasons.length) return null
    return { step: `Warning: covered-text check incomplete (${reasons.join('; ')}): check the result.`, client: null }
  }
  const found = [...groups.values()]
  // « partly » seulement si une ligne du texte reste visible à chaque largeur : les comptes de lignes suivent.
  const items = found.map((group) => `${group.label} ${group.hidden.length ? 'covered' : 'partly covered'} ${listEn(group.at)}`)
  // Libellés et largeurs d’une sorte de recouvrement : caché en entier, ou en partie.
  const kind = (pick: (group: (typeof found)[number]) => number[]) => {
    const some = found.filter((group) => pick(group).length)
    const viewports = [...new Set(some.flatMap(pick))].sort((a, b) => a - b)
    return { labels: [...new Set(some.map((group) => group.label))], at: `at ${listEn(viewports.map(String))} px` }
  }
  const hidden = kind((group) => group.hidden)
  const covered = kind((group) => group.covered)
  // Au client, la gravité exacte (décision 17 : un texte caché en entier n’est pas refusé, cette phrase est son seul signal).
  const sentences: string[] = []
  if (hidden.labels.length) {
    sentences.push(
      hidden.labels.length > 1
        ? `the texts ${listEn(hidden.labels)} are fully hidden by another element ${hidden.at}`
        : `the text ${hidden.labels[0]} is fully hidden by another element ${hidden.at}`,
    )
  }
  if (covered.labels.length) {
    const texts = covered.labels.length > 1 ? `the texts ${listEn(covered.labels)} are` : `the text ${covered.labels[0]} is`
    sentences.push(`part of ${texts} covered${hidden.labels.length ? '' : ' by another element'} ${covered.at}`)
  }
  return {
    step:
      `Warning: ${items.join('; ')}.` +
      (reasons.length ? ` Incomplete check (${reasons.join('; ')}): other texts may be covered too.` : ''),
    client: `Warning: ${sentences.join('; ')}${reasons.length ? ' (incomplete check)' : ''}. Check the result before publishing.`,
  }
}

/**
 * La zone sort-elle du cadre de son parent (ou plus qu’avant), prend-elle une marge négative, est-elle réduite à une
 * taille nulle sans display: none, un de ses textes visibles devient-il invisible (réduit à rien, masqué), son contenu
 * sort-il de la page, ou elle-même ou l’un de ses éléments est-il déplacé par un décalage relatif (top, right, bottom,
 * left), à une largeur où ce n’était pas le cas ? Un masquage hors de la page se voit ainsi, par un décalage comme par le
 * débordement d’une boîte réduite à quelques pixels, de même qu’un élément poussé hors d’une carte qui masque ce qui
 * dépasse, ou un lien écrasé à une largeur nulle. Un texte recouvert par un autre élément n’est pas refusé (coverWarning).
 * Une zone masquée ou introuvable avant compte comme dans son cadre, sans décalage ; une zone masquée après par
 * display: none (R03) n’a pas de cadre. Chaque occurrence d’une zone répétée se compare à elle-même et se nomme
 * (« 375 px (occurrence 3 of 3) ») : une règle en :last-child ne touche pas une autre carte sans être vue (décision 18).
 * Le message à Claude ne parle que des causes présentes.
 */
export function frameCheck(before: ZoneMeasure[], after: ZoneMeasure[]): RawCheck {
  const found: { where: string; detail: string }[] = []
  const faults = new Set<FrameFault>()
  let repeated = false
  for (const now of after) {
    const was = twin(before, now)
    if (!was) continue
    const parts: string[] = []
    // Encore rendue (pas display: none), mais ramenée à une largeur ou une hauteur nulle : son contenu déborde ou disparaît.
    if (shown(was) && now.found && !now.hidden && (now.width === 0 || now.height === 0)) {
      parts.push(`zone shrunk to nothing (${now.width} × ${now.height} px)`)
      faults.add('collapse')
    }
    // Un texte qui se voyait ne se voit plus, même quand la zone garde sa taille (lien écrasé sous son voisin).
    const lost = lostTexts(was, now)
    if (lost.length) {
      parts.push(`invisible text (${lost.join(', ')})`)
      faults.add('text')
    }
    if (now.frame) {
      const previous = was.frame
      // Un dépassement nouveau, ou un dépassement d’avant qui grandit de plus de 1 px.
      const { overflowLeft, overflowRight, negativeMargins, offsets, outside } = now.frame
      const escapes: string[] = []
      if (overflowLeft > (previous?.overflowLeft ?? 0) + TOLERANCE) escapes.push(`+${overflowLeft} px on the left`)
      if (overflowRight > (previous?.overflowRight ?? 0) + TOLERANCE) escapes.push(`+${overflowRight} px on the right`)
      const margins = negativeMargins.filter((side) => !previous?.negativeMargins.includes(side))
      if (margins.length) escapes.push(`negative margin (${margins.join(', ')})`)
      if (escapes.length) {
        parts.push(...escapes)
        faults.add('escape')
      }
      // Contenu poussé hors de la page (débordement d’une boîte réduite, alignement, décalage) : il n’est plus visible.
      const out = outside.filter((side) => !previous?.outside.includes(side))
      if (out.length) {
        parts.push(`content outside the page (${out.join(', ')})`)
        faults.add('outside')
      }
      const moved = offsets.filter(
        (offset) =>
          !previous?.offsets.some((old) => old.key === offset.key && old.top === offset.top && old.left === offset.left),
      )
      if (moved.length) {
        parts.push(`relative offset (${[...new Set(moved.map(describeOffset))].join(', ')})`)
        faults.add('offset')
      }
    }
    if (parts.length) {
      found.push({ where: where(now), detail: `${where(now)}: ${parts.join(', ')}` })
      repeated ||= now.occurrences > 1
    }
  }
  const detail = found.map((entry) => entry.detail).join('; ')
  const present = FAULTS.filter(({ fault }) => faults.has(fault))
  // La première consigne suit « : » ; les suivantes ouvrent une phrase.
  const advice = present.map((entry, index) => (index ? entry.advice[0].toUpperCase() + entry.advice.slice(1) : entry.advice))
  if (repeated) {
    advice.push(
      'The zone repeats on the page: each of its occurrences is checked, including those a rule targets separately ' +
        '(:first-child, :last-child, :nth-child…).',
    )
  }
  return {
    id: 'frame',
    label: 'The zone stays within the frame of its parent',
    ok: found.length === 0,
    detail: detail || undefined,
    problem:
      `${(present[0] ?? FAULTS[0]).headline} at ${found.map((entry) => entry.where).join(', ')} (${detail}): ` + advice.join(' '),
  }
}

/** Largeur où une ligne gagnée demande l’accord du client : le format Mobile de l’éditeur (375). */
const MOBILE: number = EDITOR_VIEWPORTS.mobile

/**
 * Mêmes mots, aux blancs et à la casse près : le texte relevé (innerText) suit text-transform, qu’un style seul peut
 * changer sans réécrire le texte.
 */
const sameText = (a: string, b: string) => {
  const words = (text: string) => text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr')
  return words(a) === words(b)
}

/**
 * Lignes à 375 px des textes réécrits (même clé avant/après, texte différent, nombre de lignes différent).
 * Une ligne gagnée est refusée sauf si le client a choisi une option `longer-text` (effet du contrat, « texte-plus-long »
 * dans le POC) ; aucun seuil en caractères.
 * null quand aucun texte réécrit ne change de nombre de lignes.
 */
export function linesCheck(before: ZoneMeasure[], after: ZoneMeasure[], accepted: boolean): RawCheck | null {
  const was = before.find((measure) => measure.viewport === MOBILE)
  const now = after.find((measure) => measure.viewport === MOBILE)
  if (!was || !now) return null
  const changes: { text: string; from: number; to: number }[] = []
  for (const text of now.texts) {
    const previous = was.texts.find((candidate) => candidate.key === text.key)
    if (!previous || sameText(previous.text, text.text) || previous.lines === text.lines) continue
    changes.push({ text: text.text, from: previous.lines, to: text.lines })
  }
  if (!changes.length) return null
  const gained = changes.filter((change) => change.to > change.from)
  const lines = changes.map((change) => `${change.from} → ${change.to} at ${MOBILE} px (“${excerpt(change.text)}”)`).join('; ')
  return {
    id: 'lines',
    label: 'No line gained on mobile without the client’s agreement',
    ok: gained.length === 0 || accepted,
    detail: `Lines: ${lines}${gained.length && accepted ? ', accepted by the client' : ''}`,
    problem: gained
      .map(
        (change) =>
          `The text “${excerpt(change.text)}” goes from ${change.from} to ${change.to} lines at ${MOBILE} px: shorten it, or ask the client with ask_client whether they accept this longer text (option with effect “longer-text”).`,
      )
      .join(' '),
  }
}

// Écart en dessous duquel deux ratios arrondis à 0,01 sont égaux.
const RATIO_EPSILON = 0.005

/**
 * Plancher d’un logotype, exempté du seuil WCAG (1.4.3) : sous 1,5:1, il se confond avec son fond, masqué par la
 * couleur (règle 5). Parmi les tokens, seules Nuit et Nuit claire y descendent sur les fonds du site ; le choix
 * légitime le plus sombre, Rose profond sur Nuit claire, est à 2,33.
 */
export const LOGOTYPE_FLOOR = 1.5

/** Clé de l’élément parent (« 1.0 » → « 1 », « 1 » → « »), null pour la racine. */
const parentKey = (key: string) => (key === '' ? null : key.includes('.') ? key.slice(0, key.lastIndexOf('.')) : '')

/**
 * Texte d’avant qui sert de référence : même clé, sinon l’élément le plus proche qui le contenait. Un mot mis en avant
 * ajouté par set_text (nouvel élément `<em>`) se compare au texte dont il faisait partie : ses lettres y étaient peintes.
 */
function reference<T extends { key: string }>(texts: T[], key: string): T | undefined {
  for (let current: string | null = key; current !== null; current = parentKey(current)) {
    const found = texts.find((candidate) => candidate.key === current)
    if (found) return found
  }
  return undefined
}

/** État nommé dans les messages, après le texte : « “Accueil” on hover ». */
const STATE_WORDS: Record<StateKind, string> = {
  hover: 'on hover',
  active: 'while clicked',
  'focus-visible': 'on keyboard focus',
  focus: 'on focus after a click',
  'hover-focus': 'on hover, with focus after a click',
  'hover-focus-visible': 'on hover, with keyboard focus',
  'active-focus': 'during a click that gives focus',
  'active-focus-visible': 'during a click, with keyboard focus',
}

/** États simples qui composent une combinaison : une baisse déjà vue dans l’un d’eux n’y est pas répétée. */
const COMPONENTS: Partial<Record<StateKind, StateKind[]>> = {
  'hover-focus': ['hover', 'focus'],
  'hover-focus-visible': ['hover', 'focus-visible'],
  'active-focus': ['active', 'focus', 'hover-focus'],
  'active-focus-visible': ['active', 'focus-visible', 'active-focus', 'hover-focus-visible'],
}

/** Ordre des baisses d’un même texte : repos, puis états simples, puis combinaisons. */
const STATE_RANK: (StateKind | null)[] = [
  null,
  'hover',
  'active',
  'focus-visible',
  'focus',
  'hover-focus',
  'hover-focus-visible',
  'active-focus',
  'active-focus-visible',
]

/** Baisses citées au plus dans le détail et dans la consigne ; au-delà, leur nombre. */
const MAX_CITED = 6

/**
 * Baisse de contraste d’un texte dans un état (ou au repos : kind null), ses occurrences (rangs) et ses largeurs réunies ;
 * `to` null : contraste mesuré avant, plus mesurable après (couleur ou fond que parseColor ne lit pas, image).
 */
type Drop = {
  key: string
  text: string
  kind: StateKind | null
  from: number
  to: number | null
  required: number
  ranks: number[]
  /** Nombre d’occurrences de la zone sur la page. */
  total: number
  viewports: number[]
}

/**
 * Textes d’avant qui servent de référence à un état d’après : le même état d’avant (même sorte, même profondeur survolée,
 * même profondeur focalisée) ; pour un survol plus profond que tous ceux d’avant (mot mis en avant ajouté, nouvel élément
 * plus bas), le plus profond d’avant, qui survolait déjà tous les textes ; sinon le repos d’avant (l’état n’y était pas
 * relevé).
 */
function stateReference(was: PaintedMeasure, state: StateMeasure): PaintText[] {
  let deepest: StateMeasure | undefined
  for (const other of was.states) {
    if (other.kind !== state.kind || other.focus !== state.focus) continue
    if (other.hover === state.hover) return other.texts
    if (state.hover === null || other.hover === null || other.hover > state.hover) continue
    if (!deepest || other.hover > (deepest.hover ?? -Infinity)) deepest = other
  }
  return deepest?.texts ?? was.paints.texts
}

/**
 * Relevés de peinture partiels (plus de MAX_PAINTS textes rendus dans une occurrence, au repos ou dans un état) : le plus
 * grand nombre de textes rendus et les largeurs en cause, ou null.
 */
function partialPaints(measures: PaintedMeasure[]): { total: number; viewports: number[] } | null {
  const partial = measures.filter((measure) =>
    [measure.paints, ...measure.states].some((paints) => paints.total > paints.texts.length),
  )
  if (!partial.length) return null
  return {
    total: Math.max(...partial.flatMap((measure) => [measure.paints.total, ...measure.states.map((state) => state.total)])),
    viewports: [...new Set(partial.map((measure) => measure.viewport))].sort((a, b) => a - b),
  }
}

/**
 * Occurrences de la zone sur la page qui ne sont pas toutes mesurées (plus de MAX_PAINTED_OCCURRENCES, ou introuvables),
 * dans une liste de relevés (avant, ou après) : leur nombre sur la page, le plus petit nombre d’occurrences mesurées à une
 * largeur, et les largeurs en cause ; ou null.
 */
function partialOccurrences(measures: PaintedMeasure[]): { total: number; measured: number; viewports: number[] } | null {
  const widths = new Map<number, { total: number; found: Set<number> }>()
  for (const measure of measures) {
    const width = widths.get(measure.viewport) ?? { total: 0, found: new Set<number>() }
    width.total = Math.max(width.total, measure.occurrences)
    if (measure.found) width.found.add(measure.occurrence)
    widths.set(measure.viewport, width)
  }
  const short = [...widths].filter(([, width]) => width.found.size < width.total)
  if (!short.length) return null
  return {
    total: Math.max(...short.map(([, width]) => width.total)),
    measured: Math.min(...short.map(([, width]) => width.found.size)),
    viewports: short.map(([viewport]) => viewport).sort((a, b) => a - b),
  }
}

/** « 20 000 ». */
const thousands = (value: number) => String(value).replace(/\B(?=(\d{3})+$)/g, ',')

/**
 * Contraste WCAG de chaque texte rendu de la zone (ratio connu avant et après), à chaque largeur et pour chaque
 * occurrence (décision 18), au repos puis dans chaque état forcé et chaque combinaison d’états (survol, clic, focus
 * clavier, focus après un clic, survol avec le focus, clic qui donne le focus, clic avec le focus clavier :
 * décision 16) : refus d'un texte qui passe sous son seuil, ou qui baisse encore alors qu'il y était déjà. Tous les textes
 * rendus comptent, pas seulement les MAX_TEXTS relevés en entier (ZoneMeasure.paints), et toutes les occurrences, pas
 * seulement les MAX_OCCURRENCES relevées en entier (PaintedMeasure) ; au-delà de MAX_PAINTS textes dans une occurrence,
 * ou quand des occurrences de la page ne sont pas mesurées (plus de MAX_PAINTED_OCCURRENCES, introuvables), le relevé
 * est partiel et le contrôle refuse : il ne dit jamais lisible un texte qu’il n’a pas mesuré. Les règles ajoutées ou
 * modifiées sans effet sur ces textes (décision 19) sont refusées à part, par unverifiableCheck. Un texte nouveau (mot mis
 * en avant ajouté) se compare au texte qui le contenait ; un état se compare au même état d'avant (stateReference). Une
 * baisse déjà vue au repos, ou dans un état simple qui compose une combinaison, n’est pas répétée. Les baisses sont
 * rangées par texte, puis par état ; une zone répétée nomme l'occurrence en cause. Un texte au contraste mesuré avant et
 * plus mesurable après (couleur relative que Chrome calcule en `color(srgb …)`, fond devenu une image) est refusé, jamais
 * sauté : « color not measurable after the change » (relecture de la tâche 26). null quand aucun texte n'a de ratio
 * connu avant, sans relevé partiel : un fond inconnu des deux côtés (image, couleur illisible) n'est jamais compté comme
 * lisible, ni comme illisible. Une zone exemptée (logotype) ne suit pas le seuil WCAG mais le plancher LOGOTYPE_FLOOR,
 * au repos comme dans les états : null tant qu’aucun texte n’y passe dessous ni ne devient non mesurable, sans refus
 * pour un relevé partiel.
 */
export function contrastCheck(before: PaintedMeasure[], after: PaintedMeasure[], exempt: boolean): RawCheck | null {
  // Un groupe par texte, par état et par baisse, ses occurrences et ses largeurs réunies : « “Accueil” on hover:
  // 17.06 → 1 at 375, 810 px », « “24 septembre 2026” (occurrences 1, 2 and 3 of 3): 3.75 → 3.07 at 375 px ».
  const drops = new Map<string, Drop>()
  // Rang de première apparition de chaque texte : les baisses d’un même texte se suivent.
  const order = new Map<string, number>()
  let compared = 0
  for (const now of after) {
    const was = twin(before, now)
    if (!was) continue
    const pairs: { kind: StateKind | null; texts: PaintText[]; references: PaintText[] }[] = [
      { kind: null, texts: now.paints.texts, references: was.paints.texts },
      ...now.states.map((state) => ({ kind: state.kind, texts: state.texts, references: stateReference(was, state) })),
    ]
    // Baisses déjà vues dans ce relevé, par sorte d’état (« » pour le repos) et par clé : un état qui donne la même baisse
    // que le repos, ou une combinaison la même baisse qu’un de ses états simples, ne change rien au texte.
    const seen = new Map<string, Set<string>>()
    for (const { kind, texts, references } of pairs) {
      for (const text of texts) {
        const previous = reference(references, text.key)
        if (!previous || previous.ratio === null) continue
        compared++
        // Logotype : le plancher au lieu du seuil WCAG, avant comme après.
        const required = exempt ? LOGOTYPE_FLOOR : text.required
        // Contraste d’après inconnu (ratio null) : refusé, jamais sauté. Une couleur ou un fond que parseColor ne lit pas
        // pourraient être ceux du fond, ou d’alpha nul ; aucun accord du client ne le lève, logotype compris.
        if (text.ratio !== null) {
          if (text.ratio >= required) continue
          const floor = exempt ? LOGOTYPE_FLOOR : previous.required
          if (previous.ratio < floor && text.ratio >= previous.ratio - RATIO_EPSILON) continue
        }
        const change = `${previous.ratio}|${text.ratio ?? '?'}|${required}`
        const already = [null, ...(kind ? (COMPONENTS[kind] ?? []) : [])].filter((other) => other !== kind)
        if (already.some((other) => seen.get(`${other ?? ''}|${text.key}`)?.has(change))) continue
        const mark = `${kind ?? ''}|${text.key}`
        seen.set(mark, (seen.get(mark) ?? new Set<string>()).add(change))
        const id = `${text.key}|${text.text}|${kind ?? ''}|${change}`
        const drop: Drop = drops.get(id) ?? {
          key: text.key,
          text: text.text,
          kind,
          from: previous.ratio,
          to: text.ratio,
          required,
          ranks: [],
          total: 0,
          viewports: [],
        }
        if (!order.has(text.key)) order.set(text.key, order.size)
        if (!drop.ranks.includes(now.occurrence)) drop.ranks.push(now.occurrence)
        // Survols de plusieurs profondeurs qui donnent la même baisse : une seule fois par largeur.
        if (!drop.viewports.includes(now.viewport)) drop.viewports.push(now.viewport)
        drop.total = Math.max(drop.total, now.occurrences)
        drops.set(id, drop)
      }
    }
  }
  // Logotype : rien à dire tant qu’il reste au-dessus du plancher et mesurable ; un relevé partiel ne le concerne pas (il
  // est unique).
  if (exempt && !drops.size) return null
  const partial = exempt ? null : partialPaints([...before, ...after])
  const [beforeRanks, afterRanks] = exempt ? [null, null] : [before, after].map(partialOccurrences)
  const missing = afterRanks ?? beforeRanks
  if (compared === 0 && !partial && !missing) return null
  const found = [...drops.values()].sort(
    (a, b) => order.get(a.key)! - order.get(b.key)! || STATE_RANK.indexOf(a.kind) - STATE_RANK.indexOf(b.kind),
  )
  const cited = found.slice(0, MAX_CITED)
  const more = found.length - cited.length
  const change = (drop: Drop) =>
    drop.to === null
      ? `color not measurable after the change (contrast ${formatRatio(drop.from)} before) at ${drop.viewports.join(', ')} px`
      : `${formatRatio(drop.from)} → ${formatRatio(drop.to)} at ${drop.viewports.join(', ')} px`
  const state = (drop: Drop) => (drop.kind ? ` ${STATE_WORDS[drop.kind]}` : '')
  // « “…” », suivi des occurrences en cause quand la zone se répète.
  const name = (drop: Drop) => {
    const ranks = [...drop.ranks].sort((a, b) => a - b).map((rank) => String(rank + 1))
    const where = ranks.length > 1 ? `occurrences ${list(ranks)}` : `occurrence ${ranks[0]}`
    return `“${excerpt(drop.text)}”${drop.total > 1 ? ` (${where} of ${drop.total})` : ''}`
  }
  // « and 7 other texts ».
  const others = `${more} other text${more > 1 ? 's' : ''}`
  const details = cited.map((drop) => `${name(drop)}${state(drop)}: ${change(drop)}`)
  if (more) details.push(`and ${others}`)
  const problemOf = (drop: Drop) => {
    if (drop.to === null) {
      const floor = exempt ? ` (minimum ${formatRatio(drop.required)} for a logotype)` : ''
      return (
        `The color of the text ${name(drop)}${state(drop)} is no longer measurable after the change (contrast ` +
        `${formatRatio(drop.from)} before, at ${drop.viewports.join(', ')} px): its color or its background is written in a ` +
        'syntax the editor does not read (relative color with from, color(), oklch()…), or the text goes over an image, ' +
        `and its legibility cannot be guaranteed${floor}. Write the color and the background with design system tokens, ` +
        'or do not change this point and tell the client.'
      )
    }
    if (exempt) {
      return (
        `The text ${name(drop)} blends into its background${state(drop)}: contrast ${change(drop)} (minimum ` +
        `${formatRatio(drop.required)} for a logotype, exempt from the WCAG threshold but never hidden by a color close to ` +
        'its background). Choose a design system color that stands out from the background, or do not change this point and tell the client.'
      )
    }
    return `The text ${name(drop)} becomes less legible${state(drop)}: contrast ${change(drop)} (minimum ${formatRatio(drop.required)}). Choose design system colors that keep the contrast, or do not change this point and tell the client.`
  }
  const problems = cited.map(problemOf)
  if (more) {
    problems.push(`And ${others} of the zone also ${more > 1 ? 'become' : 'becomes'} less legible.`)
  }
  if (found.some((drop) => drop.kind)) {
    problems.push(
      'The :hover, :active, :focus-visible and :focus states are measured like the resting state, alone and combined: each text ' +
        'must stay legible on its background in them.',
    )
  }
  // Ce qui n’a pas pu être mesuré passe avant les baisses : occurrences, textes au-delà du plafond.
  const unknown: { detail: string; problem: string }[] = []
  if (missing) {
    // « only 12 are measured », « only 1 is measured », « none is measured ».
    const count = missing.measured
    const measured = count === 0 ? 'none is measured' : count > 1 ? `only ${count} are measured` : 'only 1 is measured'
    unknown.push({
      detail: `Partial reading: ${missing.total} occurrences of the zone, ${measured} at ${missing.viewports.join(', ')} px`,
      problem:
        `The zone repeats ${missing.total} times on the page: the contrast is only measured on ${missing.measured} of ` +
        'them, so it cannot be guaranteed. Do not change the style of this zone and tell the client it repeats ' +
        'too often on the page to be checked by the editor.',
    })
  }
  if (partial) {
    unknown.push({
      detail:
        `Partial reading: ${partial.total} visible texts, only the first ${MAX_PAINTS} are measured at ` +
        `${partial.viewports.join(', ')} px`,
      problem:
        `The zone has ${partial.total} visible texts: the contrast is only measured on the first ${MAX_PAINTS}, so it ` +
        'cannot be guaranteed. Do not change the style of this zone and tell the client it is too long to ' +
        'be checked by the editor.',
    })
  }
  details.unshift(...unknown.map((entry) => entry.detail))
  problems.unshift(...unknown.map((entry) => entry.problem))
  return {
    id: 'contrast',
    label: exempt ? 'Logo always visible on its background' : 'Texts always legible (WCAG contrast)',
    ok: found.length === 0 && !unknown.length,
    detail: details.join('; ') || undefined,
    problem: problems.join(' '),
  }
}

/** Règle de taille ou de graisse de texte (unmeasuredRules, visual.ts : « `.content p { font-size, font-weight }` »). */
const FONT_RULE = /\{ font[\w-]*(, font[\w-]*)* \}$/

/**
 * Règles de peinture jugées sur leur effet (décision 19) : chaque règle ajoutée ou modifiée qui pose une couleur, un fond,
 * une taille ou une graisse de texte doit changer, remplacée par une valeur témoin le temps d’une lecture, la propriété de
 * son groupe (la couleur, le fond, la taille ou la graisse, pas une autre) sur au moins un texte relevé de la zone, à une
 * largeur et dans un état au moins (unmeasuredRules, visual.ts). Sans effet mesurable, elle ne peindrait
 * que des textes absents de la page : la paire « règle large sombre + règle plus précise qui rétablit les textes
 * mesurés », la couleur de la zone rétablie sur chacun de ses textes, un bloc ou une balise absents de l’article. Refus de
 * ces règles (écrites « `.content { color }` », 6 citées au plus, puis leur nombre) ; refus aussi quand les règles de la
 * page n’ont pas toutes été lues (null : plus de MAX_RULES). null s’il n’y a rien à refuser, ou pour une zone exemptée
 * (logotype).
 */
export function unverifiableCheck(unmeasured: string[] | null, exempt: boolean): RawCheck | null {
  if (exempt || (unmeasured && !unmeasured.length)) return null
  const base = { id: 'contrast-unverifiable', label: 'Each color or text size rule acts on a visible text' }
  if (unmeasured === null) {
    return {
      ...base,
      ok: false,
      detail:
        `Contrast cannot be checked: more than ${thousands(MAX_RULES)} style rules in the page, ` +
        'not all of them were read',
      problem:
        `The page has more than ${thousands(MAX_RULES)} style rules: not all of them were read, and the contrast of ` +
        'those you added cannot be checked. Do not change the style of this zone and tell the client it cannot ' +
        'be checked by the editor.',
    }
  }
  const several = unmeasured.length > 1
  const rest = unmeasured.length - MAX_CITED
  const names = unmeasured.slice(0, MAX_CITED).map((rule) => `\`${rule}\``)
  if (rest > 0) names.push(`${rest} other rule${rest > 1 ? 's' : ''}`)
  // « color » (couleur, fond), « text size » (taille, graisse), ou les deux.
  const fonts = unmeasured.filter((rule) => FONT_RULE.test(rule)).length
  const kind =
    fonts === 0 ? 'color' : fonts === unmeasured.length ? 'text size' : 'color or text size'
  return {
    ...base,
    ok: false,
    detail: `No effect on the visible texts of the zone: ${list(names)}`,
    problem: several
      ? `Rules with no measurable effect: ${list(names)}. They would only paint texts absent from this page (another page, ` +
        'content added later in the CMS), whose contrast cannot be checked. ' +
        `Your ${kind} rules change no visible text of the zone: write them on the selector of the zone or of its texts.`
      : `Rule with no measurable effect: ${list(names)}. It would only paint texts absent from this page (another page, ` +
        'content added later in the CMS), whose contrast cannot be checked. ' +
        `Your ${kind} rule changes no visible text of the zone: write it on the selector of the zone or of its texts.`,
  }
}

/** Texte qu’une règle peint sous le minimum (RuleExposure), ses occurrences, ses états et ses largeurs réunis. */
type Exposed = Omit<RuleExposure, 'viewport' | 'occurrence' | 'kind'> & {
  ranks: number[]
  kinds: (StateKind | null)[]
  viewports: number[]
}

/**
 * Règles de peinture jugées sur tous les textes qu’elles peuvent peindre (décision 19, 4e relecture ; RuleExposure,
 * visual.ts) : refus d’une règle qu’une règle plus précise de la même modification rattrape sur un texte qu’elle rendrait
 * illisible sans elle (la paire « règle large + règle plus précise qui rétablit les textes mesurés », même quand la règle
 * large peint aussi un grand texte ou un texte sur fond clair), et d’une règle large (par héritage de la zone, ou sans
 * classe ni balise de bloc) qui peint un texte sous 4,5, même grand : ailleurs, elle peindrait des textes courants que
 * personne n’a vus. Dans une zone à contenu libre (le corps d’un article, 5e relecture), refus aussi d’une couleur ou d’un
 * fond illisible jugé seul, sans les autres règles de la modification (hors même sélecteur et toute la zone), avec la
 * consigne de poser le fond et la couleur ensemble. Un texte par règle, réunissant ses occurrences, ses états (un état
 * n’est nommé que sans le repos) et ses largeurs ; 6 cités au plus, puis leur nombre. null s’il n’y a rien à refuser, ou
 * pour une zone exemptée (logotype).
 */
export function reachCheck(exposures: RuleExposure[], exempt: boolean): RawCheck | null {
  if (exempt || !exposures.length) return null
  const groups = new Map<string, Exposed>()
  for (const { viewport, occurrence, kind, ...exposure } of exposures) {
    const { rule, key, text, ratio, required, masked, apart, broad } = exposure
    const id = [rule, key, text, ratio, required, masked, apart, broad].join('|')
    const group = groups.get(id) ?? { ...exposure, ranks: [], kinds: [], viewports: [] }
    if (!group.ranks.includes(occurrence)) group.ranks.push(occurrence)
    if (!group.kinds.includes(kind)) group.kinds.push(kind)
    if (!group.viewports.includes(viewport)) group.viewports.push(viewport)
    group.occurrences = Math.max(group.occurrences, exposure.occurrences)
    groups.set(id, group)
  }
  const found = [...groups.values()]
  const cited = found.slice(0, MAX_CITED)
  const more = found.length - cited.length
  const others = `${more} other text${more > 1 ? 's' : ''}`
  // « “Paragraphe 1” (occurrences 1 and 3 of 3) on hover » : l’état n’est nommé que si le repos n’y est pas.
  const name = (group: Exposed) => {
    const ranks = [...group.ranks].sort((a, b) => a - b).map((rank) => String(rank + 1))
    const where = ranks.length > 1 ? `occurrences ${list(ranks)}` : `occurrence ${ranks[0]}`
    const kind = group.kinds.includes(null)
      ? null
      : [...group.kinds].sort((a, b) => STATE_RANK.indexOf(a) - STATE_RANK.indexOf(b))[0]
    return `“${excerpt(group.text)}”${group.occurrences > 1 ? ` (${where} of ${group.occurrences})` : ''}${kind ? ` ${STATE_WORDS[kind]}` : ''}`
  }
  const widths = (group: Exposed) => `${[...group.viewports].sort((a, b) => a - b).join(', ')} px`
  const details = cited.map(
    (group) =>
      `\`${group.rule}\` ${group.apart ? 'alone' : group.masked ? 'overridden' : 'broad'}: ${name(group)} ` +
      `${formatRatio(group.ratio)} (minimum ${formatRatio(group.required)}) at ${widths(group)}`,
  )
  if (more) details.push(`and ${others}`)
  const problems = cited.map((group) =>
    group.apart
      ? 'Without the other rules of your change (except those of the same selector or of the whole zone), ' +
        `\`${group.rule}\` would give the text ${name(group)} a contrast of ${formatRatio(group.ratio)} at ${widths(group)} ` +
        `(minimum ${formatRatio(group.required)}).`
      : group.masked
        ? `Without the more specific rule that overrides it, \`${group.rule}\` would give the text ${name(group)} a contrast of ` +
          `${formatRatio(group.ratio)} at ${widths(group)} (minimum ${formatRatio(group.required)}).`
        : `The rule \`${group.rule}\` is broad (it paints by inheritance, or without a class or a block tag): it gives the ` +
          `text ${name(group)} a contrast of ${formatRatio(group.ratio)} at ${widths(group)}, below the minimum for body ` +
          `text (${formatRatio(group.required)}).`,
  )
  if (more) problems.push(`And ${others} ${more > 1 ? 'are' : 'is'} also below the minimum.`)
  problems.push(
    'A rule overridden by a more specific rule, or a broad one, would paint without any check texts other than those of the ' +
      'page (another article, content added later in the CMS). Write each color on the selector of the texts it ' +
      'must paint (their class of the CSS Module, or, in the body of an article, their tag: `.content :global(h2)`), without ' +
      'having another rule override it, or choose a design system color that is legible on all these texts.',
  )
  if (found.some((group) => group.apart)) {
    problems.push(
      'The content of this zone comes from the CMS and changes from one page to another (lists, quotes, subheadings absent here): ' +
        'each color or background rule is judged alone there, because another rule that makes it legible here may be missing ' +
        'elsewhere. Set the background and the text color together, on the whole zone ' +
        '(`.content { background-color: …; color: … }`) or on the same selector ' +
        '(`.content :global(p) { background-color: …; color: … }`).',
    )
  }
  return {
    id: 'contrast-reach',
    label: 'Each color rule stays legible on all the texts it can paint',
    ok: false,
    detail: details.join('; '),
    problem: problems.join(' '),
  }
}
