'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Icon } from '../icons'
import { cx } from '../utils/cx'
import { isGroup, type ListItems, type ListOption } from './options'
import styles from './OptionList.module.css'

export type OptionListProps<V extends string = string> = {
  id: string
  items: ListItems<V>
  /** Index actif (focus virtuel, aria-activedescendant du contrôle). */
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  selected?: V | readonly V[] | null
  onSelect: (value: V) => void
  optionId: (index: number) => string
  'aria-labelledby'?: string
  'aria-label'?: string
  className?: string
  /** Hauteur max en px (défaut 320). */
  maxHeight?: number
  /** La liste reçoit elle-même le focus (menu ouvert par un bouton) : aria-activedescendant sur la liste. */
  focusable?: boolean
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
}

/**
 * Liste d'options (role="listbox") au style Menu / Menu item du Figma : lignes 28 px, pad 0 8, radius/sm,
 * active = bg/subtle + text/primary, sélection = coche 12 à droite. Le focus reste sur le contrôle
 * propriétaire (aria-activedescendant) ; la souris met à jour l'option active.
 */
export function OptionList<V extends string = string>({
  id,
  items,
  activeIndex,
  onActiveIndexChange,
  selected,
  onSelect,
  optionId,
  className,
  maxHeight = 320,
  focusable,
  onKeyDown,
  ...aria
}: OptionListProps<V>) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const isSelected = (value: V) => (Array.isArray(selected) ? selected.includes(value) : selected === value)

  // L'option active reste visible (sans animation : navigation clavier).
  useEffect(() => {
    if (activeIndex < 0) return
    const el = listRef.current?.ownerDocument.getElementById(optionId(activeIndex))
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, optionId])

  let index = -1
  const renderOption = (option: ListOption<V>) => {
    index += 1
    const i = index
    const sel = isSelected(option.value)
    return (
      <div
        key={`${option.value}-${i}`}
        id={optionId(i)}
        role="option"
        aria-selected={sel}
        aria-disabled={option.disabled || undefined}
        data-active={i === activeIndex || undefined}
        data-selected={sel || undefined}
        className={cx(styles.option, option.danger && styles.danger)}
        style={option.depth ? { paddingLeft: 8 + option.depth * 20 } : undefined}
        onPointerDown={(event) => event.preventDefault()}
        onPointerMove={() => {
          if (!option.disabled && i !== activeIndex) onActiveIndexChange(i)
        }}
        onClick={() => {
          if (!option.disabled) onSelect(option.value)
        }}
      >
        {option.icon ? <Icon name={option.icon} size={16} set={18} className={styles.icon} /> : null}
        <span className={styles.label}>{option.label}</span>
        {option.meta != null ? <span className={styles.meta}>{option.meta}</span> : null}
        <Icon name="check" size={12} className={styles.check} />
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      id={id}
      role="listbox"
      tabIndex={-1}
      aria-activedescendant={focusable && activeIndex >= 0 ? optionId(activeIndex) : undefined}
      onKeyDown={onKeyDown}
      className={cx(styles.list, className)}
      style={{ maxHeight: `min(${maxHeight}px, var(--k-popover-available, ${maxHeight}px))` }}
      {...aria}
    >
      {items.map((item, g) =>
        isGroup(item) ? (
          <div key={`g-${g}`} role="group" aria-labelledby={`${id}-g${g}`} className={styles.group}>
            <div id={`${id}-g${g}`} className={styles.groupLabel}>
              {item.label}
            </div>
            {item.options.map(renderOption)}
          </div>
        ) : (
          renderOption(item)
        ),
      )}
    </div>
  )
}
