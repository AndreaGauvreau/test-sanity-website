'use client'

import {
  useId,
  useRef,
  type ElementType,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { cx } from '../utils/cx'
import { useControllableState } from '../utils/useControllableState'
import styles from './Tabs.module.css'

export type TabItem<V extends string = string> = {
  value: V
  label: ReactNode
  disabled?: boolean
  /** Onglet de navigation (route) : rendu en lien, dans un <nav> (voir Tabs). */
  href?: string
}

// ─── Tab (visuel) ────────────────────────────────────────────────────────────

export type TabProps = HTMLAttributes<HTMLElement> & {
  /** État actif (Figma state=active) : libellé text/primary + soulignement 2 px. */
  active?: boolean
  as?: ElementType
  href?: string
  disabled?: boolean
  ref?: Ref<HTMLElement>
}

/**
 * Onglet (Figma « Tab » 332:459) : pad-top 8, gap 8, Body text/tertiary ; hover text/primary ; active
 * text/primary + soulignement 2 px text/primary. Élément brut : le rôle et le clavier viennent de <Tabs>.
 */
export function Tab({ active, as, href, disabled, className, children, ref, ...rest }: TabProps) {
  const Comp: ElementType = as ?? (href != null ? 'a' : 'button')
  return (
    <Comp
      ref={ref}
      {...(Comp === 'button' ? { type: 'button', disabled } : { href, 'aria-disabled': disabled || undefined })}
      data-active={active || undefined}
      className={cx(styles.tab, className)}
      {...rest}
    >
      <span className={styles.label}>{children}</span>
      <span className={styles.underline} aria-hidden="true" />
    </Comp>
  )
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

export type TabsProps<V extends string = string> = Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> & {
  items: readonly TabItem<V>[]
  value?: V
  defaultValue?: V
  onValueChange?: (value: V) => void
  /**
   * automatic (défaut) : les flèches sélectionnent ; manual : les flèches déplacent le focus, Entrée /
   * Espace sélectionnent (panneaux coûteux).
   */
  activation?: 'automatic' | 'manual'
  /** Préfixe des ids (tab : `${idBase}-tab-${value}`, panneau : `${idBase}-panel-${value}`). */
  idBase?: string
  /** Nom de la liste d'onglets (ou de la navigation) quand aucun titre visible ne la nomme. */
  'aria-label'?: string
  /** Composant de lien (next/link) pour les onglets à `href`. */
  linkAs?: ElementType
  ref?: Ref<HTMLDivElement>
}

export const tabId = (idBase: string, value: string) => `${idBase}-tab-${value}`
export const tabPanelId = (idBase: string, value: string) => `${idBase}-panel-${value}`

/**
 * Rangée d'onglets (Figma « Tabs » 332:479) : gap 20, trait bas border/subtle, largeur libre.
 * Onglets de contenu : motif APG « tabs » (role tablist / tab, aria-selected, roving tabindex, ← → Home End,
 * activation automatique ou manuelle, aria-controls vers <TabPanel>). Onglets de route (tous avec `href`,
 * ex. Content / SEO d'une page) : un <nav> de liens avec aria-current="page", sans rôle tab.
 */
export function Tabs<V extends string = string>({
  items,
  value: valueProp,
  defaultValue,
  onValueChange,
  activation = 'automatic',
  idBase: idBaseProp,
  linkAs,
  className,
  'aria-label': ariaLabel,
  ref,
  ...rest
}: TabsProps<V>) {
  const autoId = useId()
  const idBase = idBaseProp ?? autoId
  const firstEnabled = items.find((t) => !t.disabled)?.value
  const [value, setValue] = useControllableState<V | undefined>(valueProp, defaultValue ?? firstEnabled, (v) => {
    if (v !== undefined) onValueChange?.(v)
  })
  const listRef = useRef<HTMLDivElement | null>(null)
  const isNav = items.length > 0 && items.every((t) => t.href != null)

  if (isNav) {
    return (
      <nav ref={ref} aria-label={ariaLabel} className={cx(styles.tabs, className)} {...rest}>
        {items.map((item) => (
          <Tab
            key={item.value}
            as={item.disabled ? 'span' : linkAs}
            href={item.disabled ? undefined : item.href}
            active={item.value === value}
            aria-current={item.value === value ? 'page' : undefined}
            disabled={item.disabled}
          >
            {item.label}
          </Tab>
        ))}
      </nav>
    )
  }

  const enabled = items.filter((t) => !t.disabled)

  const focusTab = (v: V) => {
    const el = listRef.current?.ownerDocument.getElementById(tabId(idBase, v))
    el?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = (event.target as HTMLElement).dataset.value as V | undefined
    const index = enabled.findIndex((t) => t.value === current)
    if (index < 0) return
    let next: TabItem<V> | undefined
    switch (event.key) {
      case 'ArrowRight':
        next = enabled[(index + 1) % enabled.length]
        break
      case 'ArrowLeft':
        next = enabled[(index - 1 + enabled.length) % enabled.length]
        break
      case 'Home':
        next = enabled[0]
        break
      case 'End':
        next = enabled[enabled.length - 1]
        break
      case 'Enter':
      case ' ':
        if (activation === 'manual' && current) {
          event.preventDefault()
          setValue(current)
        }
        return
      default:
        return
    }
    event.preventDefault()
    focusTab(next.value)
    if (activation === 'automatic') setValue(next.value)
  }

  // Tab atteignable : l'onglet sélectionné (ou le premier actif).
  const tabbable = items.some((t) => t.value === value && !t.disabled) ? value : firstEnabled

  return (
    <div
      ref={(node) => {
        listRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cx(styles.tabs, className)}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {items.map((item) => {
        const selected = item.value === value
        return (
          <Tab
            key={item.value}
            id={tabId(idBase, item.value)}
            role="tab"
            data-value={item.value}
            aria-selected={selected}
            aria-controls={tabPanelId(idBase, item.value)}
            tabIndex={item.value === tabbable ? 0 : -1}
            active={selected}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) setValue(item.value)
            }}
          >
            {item.label}
          </Tab>
        )
      })}
    </div>
  )
}

export type TabPanelProps = HTMLAttributes<HTMLDivElement> & {
  idBase: string
  value: string
  /** Panneau visible (les autres restent montés mais masqués si `keepMounted`). */
  active: boolean
  keepMounted?: boolean
  ref?: Ref<HTMLDivElement>
}

/** Panneau d'un onglet : role="tabpanel", nommé par son onglet, focalisable (tabIndex 0). */
export function TabPanel({ idBase, value, active, keepMounted, children, ref, ...rest }: TabPanelProps) {
  if (!active && !keepMounted) return null
  return (
    <div
      ref={ref}
      role="tabpanel"
      id={tabPanelId(idBase, value)}
      aria-labelledby={tabId(idBase, value)}
      tabIndex={0}
      hidden={!active}
      {...rest}
    >
      {children}
    </div>
  )
}
