'use client'

import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import { isTopLayer, useLayer } from '../Popover'

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true' && !el.closest('[hidden]'),
  )
}

/** Frames d'attente maximales de la fenêtre pour le focus initial (≈ 0,5 s). */
const MAX_FOCUS_WAIT_FRAMES = 30

// Verrou de défilement partagé (fenêtres empilées).
let scrollLocks = 0
let savedOverflow = ''
let savedPadding = ''

function lockScroll() {
  const root = document.documentElement
  if (scrollLocks === 0) {
    const gap = window.innerWidth - root.clientWidth
    savedOverflow = root.style.overflow
    savedPadding = root.style.paddingRight
    root.style.overflow = 'hidden'
    // Évite le saut de mise en page quand la barre de défilement disparaît.
    if (gap > 0) root.style.paddingRight = `${gap}px`
  }
  scrollLocks += 1
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1)
  if (scrollLocks === 0) {
    document.documentElement.style.overflow = savedOverflow
    document.documentElement.style.paddingRight = savedPadding
  }
}

export type ModalDialogOptions = {
  id: string
  open: boolean
  dialogRef: RefObject<HTMLElement | null>
  /** Échap (seulement si la fenêtre est la couche la plus haute). */
  onEscape?: () => void
  /** Élément focalisé à l'ouverture ; sinon [data-autofocus], puis le premier champ, puis la fenêtre. */
  initialFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Comportement commun Modal / Drawer (APG « dialog (modal) ») : couche de la pile (Échap ne ferme que la
 * plus haute, les popovers ouverts dedans passent devant), focus initial, piège du focus (Tab / Maj+Tab
 * bouclent dans la fenêtre), retour du focus au déclencheur, verrou du défilement de la page.
 * Renvoie le gestionnaire onKeyDown à poser sur la fenêtre.
 */
export function useModalDialog({ id, open, dialogRef, onEscape, initialFocusRef }: ModalDialogOptions) {
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useLayer(id, open)

  // Échap au niveau du document : fonctionne même si le focus est sorti (clic dans un vide).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopLayer(id)) return
      event.stopPropagation()
      onEscapeRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, id])

  // Focus initial et retour du focus.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    lockScroll()
    // Le portail monte la fenêtre un rendu plus tard, parfois plusieurs frames (fenêtre ouverte dès le montage,
    // page chargée par une navigation) : on attend qu'elle existe, frame après frame.
    let frame = 0
    let tries = 0
    const focusInitial = () => {
      const dialog = dialogRef.current
      if (!dialog) {
        if (tries++ < MAX_FOCUS_WAIT_FRAMES) frame = requestAnimationFrame(focusInitial)
        return
      }
      // Focus déjà placé dans la fenêtre (autoFocus, action de l'utilisateur) : on n'y touche pas.
      const active = document.activeElement
      if (active && active !== dialog && dialog.contains(active)) return
      const target =
        initialFocusRef?.current ??
        dialog.querySelector<HTMLElement>('[data-autofocus]') ??
        dialog.querySelector<HTMLElement>('input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), [contenteditable="true"]') ??
        dialog
      target.focus({ preventScroll: true })
    }
    frame = requestAnimationFrame(focusInitial)
    return () => {
      cancelAnimationFrame(frame)
      unlockScroll()
      if (previous && previous.isConnected && previous !== document.body) previous.focus({ preventScroll: true })
    }
  }, [open, dialogRef, initialFocusRef])

  /** Piège du focus : Tab et Maj+Tab bouclent entre le premier et le dernier élément focalisable. */
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const items = focusableIn(dialog)
    if (items.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }
}
