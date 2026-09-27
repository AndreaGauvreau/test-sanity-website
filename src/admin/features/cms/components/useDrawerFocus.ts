'use client'

import { useEffect, useRef } from 'react'

/**
 * Filet pour le focus initial d'un Drawer ouvert dès son montage (panneau C4 chargé par une navigation) :
 * le kit focalise à la frame suivante, mais son portail peut ne pas être encore monté (voir « Demandes de
 * contrat » du CLAUDE.md). On attend que le panneau existe, puis on focalise `target()` (ou le premier champ)
 * si le focus n'y est pas déjà.
 */
export function useDrawerFocus(target?: () => HTMLElement | null) {
  const ref = useRef<HTMLDivElement | null>(null)
  const targetRef = useRef(target)
  useEffect(() => {
    targetRef.current = target
  })
  useEffect(() => {
    let frames = 0
    let raf = 0
    const tick = () => {
      const dialog = ref.current
      if (!dialog) {
        if (frames++ < 30) raf = requestAnimationFrame(tick)
        return
      }
      if (dialog.contains(document.activeElement)) return
      const el =
        targetRef.current?.() ??
        dialog.querySelector<HTMLElement>('input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), [contenteditable="true"]') ??
        dialog
      el.focus({ preventScroll: true })
    }
    raf = requestAnimationFrame(() => requestAnimationFrame(tick))
    return () => cancelAnimationFrame(raf)
  }, [])
  return ref
}
