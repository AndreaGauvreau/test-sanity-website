'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { popIn, useMotionVariants } from '../motion'
import { cx } from '../utils/cx'
import { mergeRefs } from '../utils/refs'
import { computePosition, type Placement, type PositionResult, type Side } from './position'
import { Portal } from './Portal'
import styles from './Popover.module.css'

export type PopoverCloseReason = 'escape' | 'outside' | 'blur'

// Pile des couches ouvertes : seule la plus haute répond à Échap (popover dans un popover, menu dans une modale).
const layers: string[] = []

export function isTopLayer(id: string): boolean {
  return layers[layers.length - 1] === id
}

export function useLayer(id: string, active: boolean) {
  useEffect(() => {
    if (!active) return
    layers.push(id)
    return () => {
      const i = layers.lastIndexOf(id)
      if (i !== -1) layers.splice(i, 1)
    }
  }, [id, active])
}

export type PopoverProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationEnd'> & {
  open: boolean
  /** Demande de fermeture (Échap, clic extérieur, focus sorti) ; le parent décide. */
  onClose?: (reason: PopoverCloseReason) => void
  /** Élément d'ancrage (déclencheur). */
  anchorRef: RefObject<HTMLElement | null>
  /** Côté et alignement : « bottom-start » par défaut. Retourné automatiquement si la place manque. */
  placement?: Placement
  /** Écart avec l'ancre, en px (4 par défaut). */
  offset?: number
  /** Largeur minimale = largeur de l'ancre (listes déroulantes). */
  matchAnchorWidth?: boolean
  closeOnEscape?: boolean
  closeOnOutsideClick?: boolean
  /** Ferme quand le focus quitte l'ancre et le panneau (menus, listes). */
  closeOnFocusOut?: boolean
  /**
   * Focus à l'ouverture : « panel » (le panneau, tabIndex -1), « first » (premier élément focalisable),
   * « none » (le focus reste sur l'ancre : combobox, tooltip).
   */
  initialFocus?: 'panel' | 'first' | 'none'
  /** Rend le focus à l'ancre à la fermeture si le focus était dans le panneau. */
  returnFocus?: boolean
  /** Ne réagit pas au pointeur (tooltip). */
  inert?: boolean
  /** Coupe l'animation (tooltips suivants, ouverture au clavier répétée). */
  instant?: boolean
  /** Classe de la surface (fond, bordure, ombre sont à la charge du consommateur ou de `surface`). */
  className?: string
  /** Surface standard du kit : bg/elevated, border/default, radius/md, Elevation/Popover. */
  surface?: boolean
  style?: CSSProperties
  children: ReactNode
  ref?: Ref<HTMLDivElement>
  /** Appelé quand la position change (côté retenu après retournement, place disponible). */
  onPositionChange?: (position: PositionResult) => void
}

/**
 * Primitive commune des éléments flottants (Tooltip, Select, Menu, FilterPopover…) : portail,
 * ancrage et placement avec retournement, fermeture Échap / clic extérieur, gestion du focus,
 * animation d’échelle depuis l’ancre (motion.popIn), mouvement réduit respecté.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  placement = 'bottom-start',
  offset = 4,
  matchAnchorWidth,
  closeOnEscape = true,
  closeOnOutsideClick = true,
  closeOnFocusOut = false,
  initialFocus = 'none',
  returnFocus = true,
  inert,
  instant,
  className,
  surface = true,
  style,
  children,
  ref,
  onPositionChange,
  id: idProp,
  ...rest
}: PopoverProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Le panneau est monté dans un portail (un rendu plus tard) : son apparition relance le placement.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null)
  const setRefs = useMemo(() => mergeRefs<HTMLDivElement>(panelRef, setPanel, ref), [ref])
  const [position, setPosition] = useState<PositionResult | null>(null)
  const [anchorWidth, setAnchorWidth] = useState<number | undefined>(undefined)
  const variants = useMotionVariants(popIn)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onPositionRef = useRef(onPositionChange)
  onPositionRef.current = onPositionChange

  useLayer(id, open)

  const update = useCallback(() => {
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (!anchor || !panel) return
    const a = anchor.getBoundingClientRect()
    const width = matchAnchorWidth ? Math.max(a.width, panel.offsetWidth) : panel.offsetWidth
    const next = computePosition(
      { top: a.top, left: a.left, width: a.width, height: a.height },
      { width, height: panel.offsetHeight },
      placement,
      { offset, viewport: { width: window.innerWidth, height: window.innerHeight } },
    )
    setAnchorWidth(matchAnchorWidth ? a.width : undefined)
    setPosition((prev) =>
      prev && prev.top === next.top && prev.left === next.left && prev.side === next.side && prev.origin === next.origin ? prev : next,
    )
    onPositionRef.current?.(next)
  }, [anchorRef, matchAnchorWidth, placement, offset])

  // Position avant la première peinture, puis suivi du défilement, du redimensionnement et des tailles.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    update()
    const onChange = () => update()
    window.addEventListener('scroll', onChange, true)
    window.addEventListener('resize', onChange)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onChange) : null
    if (ro) {
      if (anchorRef.current) ro.observe(anchorRef.current)
      if (panel) ro.observe(panel)
    }
    return () => {
      window.removeEventListener('scroll', onChange, true)
      window.removeEventListener('resize', onChange)
      ro?.disconnect()
    }
  }, [open, update, anchorRef, panel])

  // Échap et clic extérieur.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !closeOnEscape || !isTopLayer(id)) return
      event.stopPropagation()
      onCloseRef.current?.('escape')
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!closeOnOutsideClick || !isTopLayer(id)) return
      const target = event.target as Node | null
      if (!target) return
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onCloseRef.current?.('outside')
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open, closeOnEscape, closeOnOutsideClick, id, anchorRef])

  // Focus sorti de l'ancre et du panneau.
  useEffect(() => {
    if (!open || !closeOnFocusOut) return
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onCloseRef.current?.('blur')
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [open, closeOnFocusOut, anchorRef])

  // Focus initial (une fois le panneau monté), puis retour à l'ancre.
  const focused = useRef(false)
  useEffect(() => {
    if (!open) {
      focused.current = false
      return
    }
    if (panel && initialFocus !== 'none' && !focused.current) {
      focused.current = true
      const first =
        initialFocus === 'first'
          ? panel.querySelector<HTMLElement>(
              'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
            )
          : null
      ;(first ?? panel).focus({ preventScroll: true })
    }
  }, [open, panel, initialFocus])

  // Retour du focus à l'ancre à la fermeture, s'il était dans le panneau (ou perdu).
  useEffect(() => {
    if (!open || !returnFocus) return
    const anchor = anchorRef.current
    const panelNode = panelRef
    return () => {
      if (!anchor) return
      const active = document.activeElement
      if (!active || active === document.body || panelNode.current?.contains(active)) anchor.focus({ preventScroll: true })
    }
  }, [open, returnFocus, anchorRef])

  const side: Side = position?.side ?? 'bottom'

  return (
    <Portal>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="popover"
            {...rest}
            id={id}
            ref={setRefs}
            tabIndex={initialFocus === 'panel' ? -1 : rest.tabIndex}
            data-side={side}
            data-kz-popover=""
            className={cx(styles.popover, surface && styles.surface, inert && styles.inert, className)}
            style={
              {
                ...style,
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                minWidth: anchorWidth,
                visibility: position ? undefined : 'hidden',
                '--k-popover-origin': position?.origin ?? '50% 0%',
                '--k-popover-available': position ? `${position.available}px` : undefined,
              } as CSSProperties
            }
            variants={variants}
            initial={instant ? false : 'initial'}
            animate="animate"
            exit={instant ? undefined : 'exit'}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Portal>
  )
}
