import {
  toZoneMeasure,
  type LineRect,
  type RawPaint,
  type RawState,
  type RawText,
  type RawZone,
  type ZoneMeasure,
} from './measure'

/**
 * Fabriques de relevés bruts pour les tests (pas un fichier de test) :
 * un texte clair (Texte) sur Nuit, d’une ligne, dans une zone de 343 px qui remplit son parent à 375 px.
 */

/** count lignes de `height` px, espacées de `step` px, à partir de `top`. */
export function lineRects(count: number, height = 20, step = 24, top = 0): LineRect[] {
  return Array.from({ length: count }, (_, index) => ({ top: top + index * step, bottom: top + index * step + height }))
}

export function rawText(partial: Partial<RawText> = {}): RawText {
  return {
    key: '',
    text: 'Texte',
    rects: lineRects(1),
    color: 'rgb(248, 250, 252)',
    fontSize: 16,
    fontWeight: '400',
    layers: [{ color: 'rgb(15, 23, 42)', image: 'none' }],
    collapsed: false,
    ownLines: 1,
    coveredLines: [],
    ...partial,
  }
}

/** Peinture d’un texte (RawText sans les lignes), telle que READ_ZONE la relève pour le contraste. */
export const paintOf = ({ key, text, color, fontSize, fontWeight, layers }: RawText): RawPaint => ({
  key,
  text,
  color,
  fontSize,
  fontWeight,
  layers,
})

/** Zone relevée ; la peinture de tous ses textes visibles (`paints`) est par défaut celle de ses textes (`texts`). */
export function rawZone(partial: Partial<RawZone> = {}): RawZone {
  const texts = partial.texts ?? [rawText()]
  return {
    box: { left: 16, top: 0, width: 343, height: 24 },
    boxes: 1,
    parent: { left: 16, width: 343 },
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    offsets: [],
    content: { left: 16, top: 0, right: 359 },
    pageWidth: 375,
    style: {
      fontSize: '16px',
      lineHeight: '24px',
      maxWidth: 'none',
      color: 'rgb(248, 250, 252)',
      opacity: '1',
      display: 'block',
      textAlign: 'start',
      gridTemplateColumns: 'none',
    },
    accents: [],
    children: [],
    texts,
    hiddenTexts: [],
    paints: { texts: texts.map(paintOf), total: texts.length },
    occurrences: 1,
    partial: false,
    states: [],
    ...partial,
  }
}

/** Textes dans un état forcé : ni survol ni focus par défaut ; `total` vaut le nombre de textes donnés. */
export function rawState(partial: Pick<RawState, 'kind'> & Partial<RawState>): RawState {
  const texts = partial.texts ?? []
  return { hover: null, focus: null, texts, total: texts.length, ...partial }
}

/** Mesures à 375, 768 et 1280 px : le relevé donné pour une largeur, sinon `fallback` (null = introuvable). */
export function measuresOf(
  byViewport: Partial<Record<number, RawZone | null>>,
  fallback: RawZone | null = rawZone(),
): ZoneMeasure[] {
  return [375, 768, 1280].map((viewport) =>
    toZoneMeasure(viewport, viewport in byViewport ? (byViewport[viewport] ?? null) : fallback),
  )
}

/**
 * Relevés de chaque occurrence d’une zone répétée à 375, 768 et 1280 px, dans l’ordre des largeurs puis des rangs :
 * `byRank[rang]` (null = introuvable) ; leur nombre sur la page vaut `total` (par défaut, celui de `byRank`).
 */
export function occurrencesOf(byRank: (RawZone | null)[], total = byRank.length): ZoneMeasure[] {
  return [375, 768, 1280].flatMap((viewport) =>
    byRank.map((raw, rank) => toZoneMeasure(viewport, raw && { ...raw, occurrences: total }, rank)),
  )
}
