'use client'

import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

/**
 * Glisser-déposer accessible des lignes (G5 ⇅, ordre manuel).
 *
 * - Pointeur : on saisit la poignée ⠿ ; la ligne suit le pointeur (sans transition), les voisines glissent
 *   d'une hauteur de ligne (transform, ease-in-out 150 ms) ; relâcher dépose, Échap annule.
 * - Clavier (motif « sortable » : pas de glisser au clavier) : Espace ou Entrée sur la poignée soulève la
 *   ligne, ↑ ↓ la déplacent (Home / End : en tête / en fin), Espace ou Entrée déposent, Échap annule.
 *   Chaque étape est annoncée dans une zone live.
 * Aucune animation au clavier (action fréquente, déclenchée au clavier).
 */

export type DragState = {
  id: string
  from: number
  to: number
  /** Décalage vertical de la ligne saisie (pointeur seulement). */
  dy: number
  mode: 'pointer' | 'keyboard'
}

export type ReorderApi = {
  drag: DragState | null
  /** Vrai une image après le dépôt : coupe les transitions pour éviter un saut. */
  settling: boolean
  announcement: string
  /** Décalage à appliquer à la ligne d'index `index` pendant un glisser au pointeur. */
  offsetFor: (index: number) => number
  gripProps: (id: string, index: number, title: string) => {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
    onPointerCancel: () => void
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
    onBlur: () => void
    'aria-pressed': boolean
  }
}

/** Ordre d'affichage pendant un déplacement au clavier (la ligne est réellement déplacée dans la liste). */
export function moveIndex<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Index d'arrivée d'après le décalage du pointeur et la hauteur d'une ligne. */
export function targetFromOffset(from: number, dy: number, rowHeight: number, count: number): number {
  if (rowHeight <= 0) return from
  return Math.max(0, Math.min(count - 1, from + Math.round(dy / rowHeight)))
}

/** Décalage d'une ligne voisine pendant un glisser (elle fait de la place à la ligne saisie). */
export function neighbourOffset(index: number, from: number, to: number, rowHeight: number): number {
  if (from < to && index > from && index <= to) return -rowHeight
  if (to < from && index >= to && index < from) return rowHeight
  return 0
}

export function useReorder(options: {
  count: number
  enabled: boolean
  /** Dépôt : l'élément `id` passe de `from` à `to` (liste affichée). */
  onDrop: (id: string, from: number, to: number) => void
  rowHeight?: number
}): ReorderApi {
  const { count, enabled, onDrop } = options
  const [drag, setDrag] = useState<DragState | null>(null)
  const [settling, setSettling] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const start = useRef<{ y: number; rowHeight: number } | null>(null)
  const titles = useRef<Record<string, string>>({})

  const settle = useCallback(() => {
    setSettling(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)))
  }, [])

  const finish = useCallback(
    (state: DragState | null, commit: boolean) => {
      setDrag(null)
      start.current = null
      if (!state) return
      settle()
      const title = titles.current[state.id] ?? 'Item'
      if (commit && state.to !== state.from) {
        onDrop(state.id, state.from, state.to)
        setAnnouncement(`${title} dropped at position ${state.to + 1} of ${count}.`)
      } else if (state.mode === 'pointer') {
        // Simple clic sur la poignée : rien à annoncer.
        return
      } else {
        setAnnouncement(commit ? `${title} dropped. Order unchanged.` : `Reorder cancelled. ${title} is back at position ${state.from + 1} of ${count}.`)
      }
    },
    [count, onDrop, settle],
  )

  const offsetFor = (index: number): number => {
    if (!drag || drag.mode !== 'pointer' || !start.current) return 0
    if (index === drag.from) return drag.dy
    return neighbourOffset(index, drag.from, drag.to, start.current.rowHeight)
  }

  const gripProps: ReorderApi['gripProps'] = (id, index, title) => {
    titles.current[id] = title
    return {
      'aria-pressed': drag?.id === id,
      onPointerDown: (event) => {
        if (!enabled || event.button !== 0) return
        // Pas de sélection de texte pendant le glisser ; le focus va quand même à la poignée (clavier ensuite).
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        const row = event.currentTarget.closest('[data-row]') as HTMLElement | null
        start.current = { y: event.clientY, rowHeight: row?.getBoundingClientRect().height ?? options.rowHeight ?? 45 }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setDrag({ id, from: index, to: index, dy: 0, mode: 'pointer' })
      },
      onPointerMove: (event) => {
        if (!drag || drag.mode !== 'pointer' || !start.current) return
        const dy = event.clientY - start.current.y
        setDrag({ ...drag, dy, to: targetFromOffset(drag.from, dy, start.current.rowHeight, count) })
      },
      onPointerUp: (event) => {
        if (!drag || drag.mode !== 'pointer') return
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        finish(drag, true)
      },
      onPointerCancel: () => {
        if (drag?.mode === 'pointer') finish(drag, false)
      },
      onKeyDown: (event) => {
        if (!enabled) return
        const lifted = drag?.id === id && drag.mode === 'keyboard' ? drag : null
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          if (lifted) finish(lifted, true)
          else {
            setDrag({ id, from: index, to: index, dy: 0, mode: 'keyboard' })
            setAnnouncement(
              `${title} picked up. Position ${index + 1} of ${count}. Use the up and down arrow keys to move it, Space to drop, Escape to cancel.`,
            )
          }
          return
        }
        if (!lifted) return
        let to = lifted.to
        if (event.key === 'ArrowUp') to = Math.max(0, to - 1)
        else if (event.key === 'ArrowDown') to = Math.min(count - 1, to + 1)
        else if (event.key === 'Home') to = 0
        else if (event.key === 'End') to = count - 1
        else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          finish(lifted, false)
          return
        } else return
        event.preventDefault()
        setDrag({ ...lifted, to })
        setAnnouncement(`Position ${to + 1} of ${count}.`)
      },
      onBlur: () => {
        // Le focus suit la ligne déplacée au clavier ; une vraie sortie (Tab) annule.
        if (drag?.mode === 'keyboard' && drag.id === id) {
          requestAnimationFrame(() => {
            const active = document.activeElement as HTMLElement | null
            // Focus perdu par le déplacement de la ligne dans le DOM (body) : ce n'est pas une sortie.
            if (active && active !== document.body && !active.closest('[data-grip]')) finish(drag, false)
          })
        }
      },
    }
  }

  return { drag, settling, announcement, offsetFor, gripProps }
}
