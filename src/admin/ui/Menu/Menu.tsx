'use client'

import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { Icon, type IconName } from '../icons'
import { Kbd } from '../Kbd'
import { Popover, type Placement } from '../Popover'
import { cx } from '../utils/cx'
import { mergeRefs } from '../utils/refs'
import { useControllableState } from '../utils/useControllableState'
import styles from './Menu.module.css'

export type MenuCloseReason = 'select' | 'escape' | 'outside' | 'blur' | 'tab'

type MenuContextValue = { close: (reason: MenuCloseReason) => void }
const MenuContext = createContext<MenuContextValue | null>(null)

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'

function enabledItems(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter(
    (el) => el.getAttribute('aria-disabled') !== 'true' && el.closest('[role="menu"]') === panel,
  )
}

/** Roving tabindex : un seul élément du menu est dans l'ordre de tabulation, celui qui a le focus. */
function focusItem(panel: HTMLElement, item: HTMLElement | undefined) {
  if (!item) return
  for (const el of panel.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) el.tabIndex = el === item ? 0 : -1
  item.focus({ preventScroll: false })
}

// ─── Panneau ─────────────────────────────────────────────────────────────────

export type MenuPanelProps = Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'autoFocus'> & {
  /** Focus à l'ouverture : premier élément, dernier (ouverture par ↑), ou aucun (galerie, rendu statique). */
  initialFocus?: 'first' | 'last' | 'none'
  /** Largeur du menu (Figma 216). */
  width?: number | string
  ref?: Ref<HTMLDivElement>
}

/**
 * Surface du menu (Figma « Menu » 332:656) : role="menu", pad 4, éléments de 28 px. Navigation clavier
 * APG (roving tabindex) : ↑ ↓ (en boucle), Home / End, recherche par la première lettre, Entrée / Espace
 * sur l'élément. Dans un `<Menu>`, Échap et Tab referment et rendent le focus au déclencheur.
 */
export function MenuPanel({ initialFocus = 'first', width, className, style, onKeyDown, children, ref, ...rest }: MenuPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const ctx = useContext(MenuContext)

  // Premier élément atteignable par Tab, puis focus initial.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const items = enabledItems(panel)
    const initial = initialFocus === 'last' ? items[items.length - 1] : items[0]
    if (!initial) return
    if (initialFocus === 'none') {
      for (const el of panel.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) el.tabIndex = el === initial ? 0 : -1
    } else focusItem(panel, initial)
  }, [initialFocus])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    const panel = panelRef.current
    if (!panel) return
    const items = enabledItems(panel)
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLElement)
    const move = (index: number) => {
      event.preventDefault()
      focusItem(panel, items[(index + items.length) % items.length])
    }
    switch (event.key) {
      case 'ArrowDown':
        return move(current + 1)
      case 'ArrowUp':
        return move(current < 0 ? items.length - 1 : current - 1)
      case 'Home':
      case 'PageUp':
        return move(0)
      case 'End':
      case 'PageDown':
        return move(items.length - 1)
      case 'Tab':
        if (ctx) {
          event.preventDefault()
          ctx.close('tab')
        }
        return
      default:
        if (event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const char = event.key.toLowerCase()
          for (let k = 1; k <= items.length; k++) {
            const item = items[(current + k) % items.length]
            if ((item.textContent ?? '').trim().toLowerCase().startsWith(char)) {
              event.preventDefault()
              focusItem(panel, item)
              return
            }
          }
        }
    }
  }

  return (
    <div
      ref={mergeRefs(panelRef, ref)}
      role="menu"
      aria-orientation="vertical"
      data-standalone={ctx ? undefined : ''}
      className={cx(styles.panel, className)}
      style={{ width, ...style }}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  )
}

// ─── Éléments ────────────────────────────────────────────────────────────────

export type MenuItemProps = Omit<HTMLAttributes<HTMLElement>, 'onSelect' | 'role'> & {
  /** Icône 16 à gauche (Figma « Show icon »). */
  icon?: IconName
  /** Raccourci affiché dans un Kbd à droite (Figma « Show shortcut »). */
  shortcut?: string
  /**
   * Choix coché (Figma state=selected : coche à droite). Défini (true/false) : l'élément devient
   * menuitemradio (ou menuitemcheckbox avec `multiple`) avec aria-checked.
   */
  selected?: boolean
  multiple?: boolean
  disabled?: boolean
  /** Action destructrice (Figma state=danger). */
  danger?: boolean
  /** Lien (ouvre la page) plutôt qu'une action. */
  href?: string
  target?: string
  rel?: string
  /** Action ; appeler `event.preventDefault()` pour garder le menu ouvert. */
  onSelect?: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
  /** Ne referme pas le menu après l'action (choix multiples). */
  keepOpen?: boolean
  children: ReactNode
  ref?: Ref<HTMLElement>
}

/**
 * Élément de menu (Figma « Menu item » 332:585) : 28 px, pad 0 8, gap 8, radius/sm, Body. États :
 * hover / focus (bg/subtle, text/primary), selected (coche 12), disabled (text/disabled), danger.
 */
export function MenuItem({
  icon,
  shortcut,
  selected,
  multiple,
  disabled,
  danger,
  href,
  target,
  rel,
  onSelect,
  keepOpen,
  className,
  children,
  onClick,
  onKeyDown,
  ref,
  ...rest
}: MenuItemProps) {
  const ctx = useContext(MenuContext)
  const role = selected === undefined ? 'menuitem' : multiple ? 'menuitemcheckbox' : 'menuitemradio'

  const activate = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    if (disabled) {
      event.preventDefault()
      return
    }
    onSelect?.(event)
    if (!keepOpen && !event.defaultPrevented) ctx?.close('select')
  }

  const common = {
    ...rest,
    ref,
    role,
    tabIndex: -1,
    'aria-checked': selected === undefined ? undefined : selected,
    'aria-disabled': disabled || undefined,
    'data-selected': selected || undefined,
    className: cx(styles.item, danger && styles.danger, className),
    onClick: (event: MouseEvent<HTMLElement>) => {
      onClick?.(event)
      if (!event.defaultPrevented) activate(event)
    },
    // Le pointeur déplace le focus (un seul élément en surbrillance, souris et clavier confondus).
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const el = event.currentTarget
      if (disabled || document.activeElement === el) return
      const panel = el.closest<HTMLElement>('[role="menu"]')
      if (panel) focusItem(panel, el)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      onKeyDown?.(event)
      if (event.defaultPrevented) return
      // Entrée sur un lien : le navigateur suit le lien (clic natif) ; Espace et les boutons passent ici.
      if ((event.key === 'Enter' && !href) || event.key === ' ') {
        // L'action d'abord (elle peut appeler preventDefault pour garder le menu ouvert), puis on bloque le clic natif.
        if (href && event.key === ' ') (event.currentTarget as HTMLElement).click()
        else activate(event)
        event.preventDefault()
      }
    },
  }

  const content = (
    <>
      {icon ? <Icon name={icon} size={16} set={18} className={styles.icon} /> : null}
      <span className={styles.label}>{children}</span>
      {shortcut ? <Kbd className={styles.shortcut}>{shortcut}</Kbd> : null}
      <Icon name="check" size={12} className={styles.check} />
    </>
  )

  if (href && !disabled) {
    return (
      <a {...(common as HTMLAttributes<HTMLAnchorElement>)} ref={ref as Ref<HTMLAnchorElement>} href={href} target={target} rel={rel}>
        {content}
      </a>
    )
  }
  return (
    <div {...(common as HTMLAttributes<HTMLDivElement>)} ref={ref as Ref<HTMLDivElement>}>
      {content}
    </div>
  )
}

/** Trait de séparation (Figma « divider » : pad 4 0, trait border/subtle). */
export function MenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cx(styles.separator, className)} />
}

/** Groupe titré (Figma « section-label » : Caption text/muted, pad 6 8 4 8) : role="group". */
export function MenuGroup({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className={className}>
      <div id={id} className={styles.groupLabel}>
        {label}
      </div>
      {children}
    </div>
  )
}

// ─── Menu complet (déclencheur + Popover) ────────────────────────────────────

type TriggerProps = {
  ref?: Ref<HTMLElement>
  id?: string
  'aria-haspopup'?: 'menu'
  'aria-expanded'?: boolean
  'aria-controls'?: string
  onClick?: (event: MouseEvent<HTMLElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
}

export type MenuProps = {
  /** Déclencheur : un seul élément bouton qui accepte une ref (Button, IconButton…). */
  trigger: ReactElement<TriggerProps>
  /** Éléments : MenuItem, MenuGroup, MenuSeparator. */
  children: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, reason?: MenuCloseReason) => void
  placement?: Placement
  /** Largeur du menu (défaut 216, Figma). */
  width?: number | string
  /** Nom du menu (sinon : le déclencheur, via aria-labelledby). */
  'aria-label'?: string
  className?: string
  style?: CSSProperties
}

/**
 * Menu déroulant (APG « menu button ») : le déclencheur reçoit aria-haspopup="menu" et aria-expanded ;
 * clic, Entrée, Espace ou ↓ ouvrent sur le premier élément, ↑ sur le dernier. Le menu s'affiche dans un
 * Popover (échelle depuis l'ancre, sans animation quand il est ouvert au clavier). Échap, Tab, clic
 * extérieur ou choix d'un élément le referment ; le focus revient au déclencheur.
 */
export function Menu({
  trigger,
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  placement = 'bottom-start',
  width = 216,
  'aria-label': ariaLabel,
  className,
  style,
}: MenuProps) {
  const id = useId()
  const triggerId = `${id}-trigger`
  const menuId = `${id}-menu`
  const anchorRef = useRef<HTMLElement | null>(null)
  const reasonRef = useRef<MenuCloseReason | undefined>(undefined)
  const [open, setOpenState] = useControllableState(openProp, defaultOpen, (next) => onOpenChange?.(next, reasonRef.current))
  const [autoFocus, setAutoFocus] = useState<'first' | 'last'>('first')
  const [instant, setInstant] = useState(false)

  const setOpen = useCallback(
    (next: boolean, reason?: MenuCloseReason) => {
      reasonRef.current = reason
      setOpenState(next)
    },
    [setOpenState],
  )

  const close = useCallback(
    (reason: MenuCloseReason) => {
      setOpen(false, reason)
      // Rend le focus au déclencheur (Popover le fait aussi quand le focus était dans le menu) ;
      // pas après un clic extérieur ni un focus parti ailleurs.
      if (reason === 'select' || reason === 'escape' || reason === 'tab') anchorRef.current?.focus({ preventScroll: true })
    },
    [setOpen],
  )

  if (!isValidElement(trigger)) return null
  const triggerProps = trigger.props

  const openWith = (focus: 'first' | 'last', viaKeyboard: boolean) => {
    setAutoFocus(focus)
    setInstant(viaKeyboard)
    setOpen(true)
  }

  const triggerNode = cloneElement(trigger, {
    ref: mergeRefs(anchorRef, triggerProps.ref),
    id: triggerProps.id ?? triggerId,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: (event: MouseEvent<HTMLElement>) => {
      triggerProps.onClick?.(event)
      if (event.defaultPrevented) return
      if (open) close('select')
      else openWith('first', event.detail === 0)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      triggerProps.onKeyDown?.(event)
      if (event.defaultPrevented) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        openWith(event.key === 'ArrowUp' ? 'last' : 'first', true)
      }
    },
  })

  return (
    <MenuContext.Provider value={{ close }}>
      {triggerNode}
      <Popover
        open={open}
        onClose={(reason) => close(reason)}
        anchorRef={anchorRef}
        placement={placement}
        instant={instant}
        closeOnFocusOut
        returnFocus
        className={className}
        // Largeur Figma contour compris (216) : posée sur la surface du Popover.
        style={{ width, ...style }}
      >
        <MenuPanel
          id={menuId}
          initialFocus={autoFocus}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : (triggerProps.id ?? triggerId)}
        >
          {children}
        </MenuPanel>
      </Popover>
    </MenuContext.Provider>
  )
}
