/**
 * Calcul pur de la position d'un élément flottant (popover, tooltip, liste) par rapport à son ancre,
 * en coordonnées de la fenêtre (position: fixed). Retournement si la place manque, puis décalage
 * pour rester dans la fenêtre (marge `padding`).
 */
export type Side = 'top' | 'bottom' | 'left' | 'right'
export type Align = 'start' | 'center' | 'end'
export type Placement = Side | `${Side}-${'start' | 'end'}`

export type Rect = { top: number; left: number; width: number; height: number }

export type PositionResult = {
  top: number
  left: number
  side: Side
  align: Align
  /** transform-origin du côté de l'ancre (animations d'échelle). */
  origin: string
  /** Place disponible sur l'axe principal (liste déroulante qui défile). */
  available: number
}

export function parsePlacement(placement: Placement): { side: Side; align: Align } {
  const [side, align] = placement.split('-') as [Side, 'start' | 'end' | undefined]
  return { side, align: align ?? 'center' }
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

function space(anchor: Rect, side: Side, viewport: { width: number; height: number }): number {
  switch (side) {
    case 'top':
      return anchor.top
    case 'bottom':
      return viewport.height - (anchor.top + anchor.height)
    case 'left':
      return anchor.left
    case 'right':
      return viewport.width - (anchor.left + anchor.width)
  }
}

export function computePosition(
  anchor: Rect,
  floating: { width: number; height: number },
  placement: Placement,
  options: { offset?: number; padding?: number; viewport: { width: number; height: number }; flip?: boolean },
): PositionResult {
  const offset = options.offset ?? 4
  const padding = options.padding ?? 8
  const viewport = options.viewport
  let { side, align } = parsePlacement(placement)

  const vertical = side === 'top' || side === 'bottom'
  const needed = (vertical ? floating.height : floating.width) + offset + padding
  if (options.flip !== false && space(anchor, side, viewport) < needed) {
    const other = OPPOSITE[side]
    if (space(anchor, other, viewport) > space(anchor, side, viewport)) side = other
  }

  let top = 0
  let left = 0
  if (side === 'top' || side === 'bottom') {
    top = side === 'bottom' ? anchor.top + anchor.height + offset : anchor.top - offset - floating.height
    left =
      align === 'start'
        ? anchor.left
        : align === 'end'
          ? anchor.left + anchor.width - floating.width
          : anchor.left + anchor.width / 2 - floating.width / 2
    left = clamp(left, padding, viewport.width - padding - floating.width)
  } else {
    left = side === 'right' ? anchor.left + anchor.width + offset : anchor.left - offset - floating.width
    top =
      align === 'start'
        ? anchor.top
        : align === 'end'
          ? anchor.top + anchor.height - floating.height
          : anchor.top + anchor.height / 2 - floating.height / 2
    top = clamp(top, padding, viewport.height - padding - floating.height)
  }

  // Origine de l'échelle : le bord collé à l'ancre, aligné sur le centre de l'ancre quand c'est possible.
  const originX = side === 'left' ? '100%' : side === 'right' ? '0%' : `${clamp(anchor.left + anchor.width / 2 - left, 0, floating.width)}px`
  const originY = side === 'top' ? '100%' : side === 'bottom' ? '0%' : `${clamp(anchor.top + anchor.height / 2 - top, 0, floating.height)}px`

  return {
    top: Math.round(top),
    left: Math.round(left),
    side,
    align,
    origin: `${originX} ${originY}`,
    available: Math.max(0, space(anchor, side, viewport) - offset - padding),
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}
