'use client'

import { useId, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { Tooltip } from '../Tooltip'
import { cx } from '../utils/cx'
import { useControllableState } from '../utils/useControllableState'
import styles from './SegmentedControl.module.css'

export type SegmentItem<V extends string = string> = {
  value: V
  /** Libellé : texte du segment, ou nom accessible + infobulle d'un segment à icône seule. */
  label: string
  /** Icône 16 : segment à icône seule (Figma type=icon). */
  icon?: IconName
  disabled?: boolean
  /** Raccourci affiché dans l'infobulle (segment à icône). */
  shortcut?: string
}

// ─── Segment (visuel) ────────────────────────────────────────────────────────

export type SegmentProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string
  icon?: IconName
  selected?: boolean
  ref?: Ref<HTMLButtonElement>
}

/**
 * Segment (Figma « Segment » 332:507) : label (pad 4 10, Body Small) ou icône (pad 4 6, icône 16), radius/sm.
 * hover bg/subtle ; selected bg/input-hover, texte et icône clairs. Le rôle vient de <SegmentedControl>.
 */
export function Segment({ label, icon, selected, className, type = 'button', ref, ...rest }: SegmentProps) {
  return (
    <button
      ref={ref}
      type={type}
      data-selected={selected || undefined}
      data-type={icon ? 'icon' : 'label'}
      aria-label={icon ? label : undefined}
      className={cx(styles.segment, className)}
      {...rest}
    >
      {icon ? <Icon name={icon} size={16} set={18} /> : <span className={styles.label}>{label}</span>}
    </button>
  )
}

// ─── Groupe ──────────────────────────────────────────────────────────────────

export type SegmentedControlProps<V extends string = string> = Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> & {
  items: readonly SegmentItem<V>[]
  value?: V
  defaultValue?: V
  onValueChange?: (value: V) => void
  /** Nom du groupe (obligatoire sans titre visible) : « Viewport », « Mode ». */
  'aria-label'?: string
  disabled?: boolean
  ref?: Ref<HTMLDivElement>
}

/**
 * Groupe de segments (Figma « Segmented control » 332:522) : bg/input, border/default, radius/md, pad 2, gap 2.
 * Choix unique : role="radiogroup" + role="radio" (aria-checked), roving tabindex, ← → ↑ ↓ Home End
 * sélectionnent (sans animation), Espace sélectionne. Segments à icône : infobulle avec le libellé.
 */
export function SegmentedControl<V extends string = string>({
  items,
  value: valueProp,
  defaultValue,
  onValueChange,
  disabled,
  className,
  ref,
  ...rest
}: SegmentedControlProps<V>) {
  const id = useId()
  const groupRef = useRef<HTMLDivElement | null>(null)
  const firstEnabled = items.find((i) => !i.disabled)?.value
  const [value, setValue] = useControllableState<V | undefined>(valueProp, defaultValue ?? firstEnabled, (v) => {
    if (v !== undefined) onValueChange?.(v)
  })
  const enabled = disabled ? [] : items.filter((i) => !i.disabled)
  const tabbable = enabled.some((i) => i.value === value) ? value : enabled[0]?.value

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = (event.target as HTMLElement).dataset.value
    const index = enabled.findIndex((i) => i.value === current)
    if (index < 0) return
    let next: SegmentItem<V> | undefined
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = enabled[(index + 1) % enabled.length]
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = enabled[(index - 1 + enabled.length) % enabled.length]
        break
      case 'Home':
        next = enabled[0]
        break
      case 'End':
        next = enabled[enabled.length - 1]
        break
      default:
        return
    }
    event.preventDefault()
    setValue(next.value)
    groupRef.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus()
  }

  return (
    <div
      ref={(node) => {
        groupRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      role="radiogroup"
      aria-disabled={disabled || undefined}
      className={cx(styles.group, className)}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {items.map((item) => {
        const selected = item.value === value
        const segment = (
          <Segment
            key={item.value}
            id={`${id}-${item.value}`}
            role="radio"
            aria-checked={selected}
            data-value={item.value}
            tabIndex={item.value === tabbable ? 0 : -1}
            label={item.label}
            icon={item.icon}
            selected={selected}
            disabled={disabled || item.disabled}
            onClick={() => setValue(item.value)}
          />
        )
        return item.icon ? (
          <Tooltip key={item.value} label={item.label} shortcut={item.shortcut} placement="bottom">
            {segment}
          </Tooltip>
        ) : (
          segment
        )
      })}
    </div>
  )
}
