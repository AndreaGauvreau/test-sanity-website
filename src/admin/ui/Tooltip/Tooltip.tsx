'use client'

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { Kbd } from '../Kbd'
import { Popover, type Placement } from '../Popover'
import { cx } from '../utils/cx'
import { mergeRefs } from '../utils/refs'
import { useControllableState } from '../utils/useControllableState'
import styles from './Tooltip.module.css'

// Tooltips « chauds » : après une première infobulle, les suivantes s'ouvrent sans délai ni animation.
let lastClosedAt = 0
let openCount = 0
const WARM_MS = 400

type TriggerProps = {
  ref?: Ref<HTMLElement>
  'aria-describedby'?: string
  'aria-label'?: string
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onFocus?: (event: FocusEvent<HTMLElement>) => void
  onBlur?: (event: FocusEvent<HTMLElement>) => void
}

export type TooltipProps = {
  /** Texte de l'infobulle (Body Small, text/primary). */
  label: ReactNode
  /** Raccourci affiché dans un <Kbd> (« ⌘ K », « / »). */
  shortcut?: string
  /** Élément déclencheur : un seul élément focalisable qui accepte une ref (Button, IconButton…). */
  children: ReactElement<TriggerProps>
  placement?: Placement
  /** Délai avant ouverture au survol, en ms (500 par défaut ; 0 au clavier et quand une infobulle vient d'être vue). */
  delay?: number
  disabled?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

/**
 * Infobulle (Figma « Tooltip » 323:189) : bg/elevated, border/strong, radius/sm, Elevation/Popover,
 * pad 4 8, Kbd optionnel. S'ouvre au survol (après délai) et au focus clavier, se ferme à la sortie,
 * au clic, au blur et à Échap. Relie le déclencheur par aria-describedby (sauf si le texte est
 * déjà son nom accessible).
 */
export function Tooltip({
  label,
  shortcut,
  children,
  placement = 'top',
  delay = 500,
  disabled,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
}: TooltipProps) {
  const id = useId()
  const anchorRef = useRef<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useControllableState(openProp, defaultOpen, onOpenChange)
  const [instant, setInstant] = useState(false)

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = undefined
  }

  const show = useCallback(
    (immediate: boolean) => {
      if (disabled) return
      clear()
      const warm = openCount > 0 || Date.now() - lastClosedAt < WARM_MS
      if (immediate || warm || delay <= 0) {
        setInstant(warm)
        setOpen(true)
      } else {
        setInstant(false)
        timer.current = setTimeout(() => setOpen(true), delay)
      }
    },
    [delay, disabled, setOpen],
  )

  const hide = useCallback(() => {
    clear()
    setOpen(false)
  }, [setOpen])

  useEffect(() => {
    if (!open) return
    openCount += 1
    return () => {
      openCount -= 1
      lastClosedAt = Date.now()
    }
  }, [open])

  useEffect(() => clear, [])

  if (!isValidElement(children)) return children

  const childProps = children.props
  const labelIsName = typeof label === 'string' && childProps['aria-label'] === label
  const describedBy = [childProps['aria-describedby'], !labelIsName && open ? id : undefined].filter(Boolean).join(' ') || undefined

  const trigger = cloneElement(children, {
    ref: mergeRefs(anchorRef, childProps.ref),
    'aria-describedby': describedBy,
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      childProps.onPointerEnter?.(event)
      if (event.pointerType === 'mouse') show(false)
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      childProps.onPointerLeave?.(event)
      hide()
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      childProps.onPointerDown?.(event)
      hide()
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(event)
      // Au clavier seulement : un clic souris donne aussi le focus, sans vouloir d'infobulle.
      let keyboard = true
      try {
        keyboard = event.currentTarget.matches(':focus-visible')
      } catch {
        keyboard = true
      }
      if (keyboard) show(true)
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(event)
      hide()
    },
  })

  return (
    <>
      {trigger}
      <Popover
        open={open && !disabled}
        onClose={hide}
        anchorRef={anchorRef}
        placement={placement}
        offset={6}
        role="tooltip"
        id={id}
        surface={false}
        inert
        instant={instant}
        closeOnOutsideClick={false}
        returnFocus={false}
        className={cx(styles.tooltip, className)}
      >
        <span className={styles.label}>{label}</span>
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </Popover>
    </>
  )
}
