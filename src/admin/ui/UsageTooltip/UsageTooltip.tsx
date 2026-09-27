'use client'

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { ButtonContent, buttonClassName } from '../Button'
import { Icon } from '../icons'
import { Popover, type Placement } from '../Popover'
import { cx } from '../utils/cx'
import { mergeRefs } from '../utils/refs'
import { useControllableState } from '../utils/useControllableState'
import styles from './UsageTooltip.module.css'

/** Un emplacement où le média est utilisé. */
export type UsagePlace = {
  id?: string
  /** « Home › Hero — background ». */
  label: ReactNode
  /** Capture de la section (miniature 278 × 124, recadrée). Absente : placeholder. */
  image?: string
  /** Cadre rouge sur l'emplacement exact du média, en fractions (0-1) de la miniature. */
  highlight?: { x: number; y: number; width: number; height: number }
  /** Lien « View ↗ » (nouvel onglet). */
  href?: string
}

type TriggerProps = {
  ref?: Ref<HTMLElement>
  'aria-haspopup'?: 'dialog'
  'aria-expanded'?: boolean
  'aria-controls'?: string
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void
  onClick?: (event: MouseEvent<HTMLElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
  onBlur?: (event: FocusEvent<HTMLElement>) => void
}

export type UsageTooltipProps = {
  /** Titre : « hero-truck.jpg · used in 2 places ». */
  title: ReactNode
  places: readonly UsagePlace[]
  /** Déclencheur : un seul élément focalisable (bouton « Used ×2 »…) qui accepte une ref. */
  children: ReactElement<TriggerProps>
  placement?: Placement
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Délai d'ouverture au survol (ms). */
  openDelay?: number
  /** Délai de fermeture après la sortie du pointeur (ms) : laisse le temps d'atteindre la fenêtre. */
  closeDelay?: number
  /** Libellé du lien de chaque emplacement (défaut « View »). */
  viewLabel?: string
  className?: string
}

/**
 * Info-bulle d'usage d'un média (Figma « Usage tooltip » 336:1082) : 300 px, pad 10, gap 10, une miniature
 * par emplacement avec le média entouré en rouge, et un lien « View ↗ ». Contient des liens : c'est une
 * petite fenêtre non modale (role="dialog"), pas un role="tooltip". S'ouvre au survol (délai) et au clic /
 * Entrée (focus dans la fenêtre), se ferme à la sortie du pointeur, à Échap, au clic extérieur.
 */
export function UsageTooltip({
  title,
  places,
  children,
  placement = 'bottom-start',
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  openDelay = 300,
  closeDelay = 150,
  viewLabel = 'View',
  className,
}: UsageTooltipProps) {
  const id = useId()
  const titleId = `${id}-title`
  const anchorRef = useRef<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useControllableState(openProp, defaultOpen, onOpenChange)
  // Ouverte par le clavier ou un clic : le focus entre dans la fenêtre (ses liens restent atteignables).
  const [focusInside, setFocusInside] = useState(false)

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = undefined
  }
  const schedule = (next: boolean, delay: number) => {
    clear()
    timer.current = setTimeout(() => setOpen(next), delay)
  }
  useEffect(() => clear, [])

  if (!isValidElement(children)) return children
  const childProps = children.props

  const trigger = cloneElement(children, {
    ref: mergeRefs(anchorRef, childProps.ref),
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      childProps.onPointerEnter?.(event)
      if (event.pointerType !== 'mouse') return
      if (open) clear()
      else {
        setFocusInside(false)
        schedule(true, openDelay)
      }
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      childProps.onPointerLeave?.(event)
      if (event.pointerType !== 'mouse') return
      if (open && !focusInside) schedule(false, closeDelay)
      else if (!open) clear()
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      childProps.onClick?.(event)
      clear()
      setFocusInside(!open)
      setOpen(!open)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      childProps.onKeyDown?.(event)
      if (event.key === 'ArrowDown' && !open) {
        event.preventDefault()
        setFocusInside(true)
        setOpen(true)
      }
    },
  })

  return (
    <>
      {trigger}
      <Popover
        open={open}
        onClose={() => {
          clear()
          setOpen(false)
        }}
        anchorRef={anchorRef}
        placement={placement}
        offset={6}
        id={id}
        role="dialog"
        aria-labelledby={titleId}
        initialFocus={focusInside ? 'panel' : 'none'}
        closeOnFocusOut={focusInside}
        className={cx(styles.panel, className)}
        onPointerEnter={clear}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse' && !focusInside) schedule(false, closeDelay)
        }}
      >
        <p id={titleId} className={styles.title}>
          {title}
        </p>
        {places.map((place, i) => (
          <div key={place.id ?? i} className={styles.place}>
            <div className={styles.miniature}>
              {place.image ? (
                <img src={place.image} alt="" className={styles.image} />
              ) : (
                <Icon name="image" size={18} className={styles.placeholder} />
              )}
              {place.highlight ? (
                <span
                  className={styles.highlight}
                  style={{
                    left: `${place.highlight.x * 100}%`,
                    top: `${place.highlight.y * 100}%`,
                    width: `${place.highlight.width * 100}%`,
                    height: `${place.highlight.height * 100}%`,
                  }}
                />
              ) : null}
            </div>
            <div className={styles.where}>
              <span className={styles.label}>{place.label}</span>
              {place.href ? (
                <a
                  href={place.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClassName({ variant: 'ghost', size: 'small', className: styles.view })}
                >
                  <ButtonContent size="small" iconRight="external">
                    {viewLabel}
                  </ButtonContent>
                  <span className="kz-visually-hidden"> (opens in a new tab)</span>
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </Popover>
    </>
  )
}
