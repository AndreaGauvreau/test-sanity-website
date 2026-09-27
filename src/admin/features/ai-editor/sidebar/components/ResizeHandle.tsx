'use client'

import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import styles from './ResizeHandle.module.css'

export const SIDEBAR_MIN = 260
export const SIDEBAR_MAX = 480
export const SIDEBAR_DEFAULT = 320
const KEY_STEP = 16

export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width)))
}

/**
 * Poignée de redimensionnement du bord droit (G2 : 260 → 480 px, double-clic → 260 ; question 14).
 * Motif APG « window splitter » : role=separator focalisable, ← → (16 px), Maj + ← → (64 px), Home (260), End (480).
 * Le glisser suit le pointeur sans animation (réponse directe) ; `onCommit` à la fin (mémorisation).
 */
export function ResizeHandle({
  width,
  onWidthChange,
  onCommit,
  controls,
}: {
  width: number
  onWidthChange: (width: number) => void
  onCommit?: (width: number) => void
  /** id de la sidebar redimensionnée (aria-controls). */
  controls?: string
}) {
  const drag = useRef<{ startX: number; startWidth: number; last: number } | null>(null)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, startWidth: width, last: width }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const next = clampWidth(d.startWidth + event.clientX - d.startX)
    if (next !== d.last) {
      d.last = next
      onWidthChange(next)
    }
  }
  const end = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    onCommit?.(d.last)
  }
  const set = (next: number) => {
    const w = clampWidth(next)
    onWidthChange(w)
    onCommit?.(w)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP
    if (event.key === 'ArrowLeft') set(width - step)
    else if (event.key === 'ArrowRight') set(width + step)
    else if (event.key === 'Home') set(SIDEBAR_MIN)
    else if (event.key === 'End') set(SIDEBAR_MAX)
    else return
    event.preventDefault()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the Claude sidebar"
      aria-controls={controls}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      aria-valuetext={`${width} px`}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      className={styles.handle}
      data-dragging={drag.current ? '' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => set(SIDEBAR_MIN)}
      onKeyDown={onKeyDown}
    />
  )
}
