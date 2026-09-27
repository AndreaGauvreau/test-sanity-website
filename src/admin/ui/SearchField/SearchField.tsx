'use client'

import { useId, useRef, type InputHTMLAttributes, type KeyboardEvent, type Ref } from 'react'
import { Icon } from '../icons'
import { IconButton } from '../IconButton'
import { Kbd } from '../Kbd'
import { cx } from '../utils/cx'
import { mergeRefs } from '../utils/refs'
import { useShortcut, useShortcutLabel, type Shortcut } from '../utils/shortcut'
import { useControllableState } from '../utils/useControllableState'
import styles from './SearchField.module.css'

export type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'defaultValue' | 'onChange' | 'type'> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Nom accessible (défaut « Search »). */
  label?: string
  /** Raccourci global qui donne le focus au champ (défaut « / ») ; false pour aucun. Affiché en <Kbd> quand le champ est vide. */
  shortcut?: Shortcut | false
  /** Appelé à l'effacement (✕ ou Échap). */
  onClear?: () => void
  className?: string
  ref?: Ref<HTMLInputElement>
}

/**
 * Recherche (Figma « Search field » 327:554) : 240 px, bg/input, border/default, radius/md, loupe 16,
 * Kbd du raccourci quand il est vide ; focused = border/focus ; filled = ✕ pour effacer (Icon button xsmall).
 * Échap efface, puis quitte le champ s'il est déjà vide.
 */
export function SearchField({
  value: valueProp,
  defaultValue = '',
  onValueChange,
  label = 'Search',
  placeholder = 'Search…',
  shortcut = { key: '/' },
  onClear,
  className,
  id: idProp,
  disabled,
  onKeyDown,
  ref,
  ...rest
}: SearchFieldProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useControllableState(valueProp, defaultValue, onValueChange)
  const shortcutLabel = useShortcutLabel(shortcut || undefined)

  useShortcut(shortcut || undefined, () => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, !disabled)

  const clear = () => {
    setValue('')
    onClear?.()
    inputRef.current?.focus()
  }

  return (
    <div
      className={cx(styles.search, value && styles.filled, disabled && styles.disabled, className)}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !disabled) {
          event.preventDefault()
          inputRef.current?.focus()
        }
      }}
    >
      <Icon name="search" size={16} set={18} className={styles.icon} />
      <input
        ref={mergeRefs(inputRef, ref)}
        id={id}
        type="search"
        role="searchbox"
        aria-label={label}
        aria-keyshortcuts={shortcut ? shortcutAria(shortcut) : undefined}
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        autoComplete="off"
        spellCheck={false}
        className={styles.input}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          onKeyDown?.(event)
          if (event.defaultPrevented || event.key !== 'Escape') return
          if (value) {
            event.preventDefault()
            event.stopPropagation()
            setValue('')
            onClear?.()
          } else {
            inputRef.current?.blur()
          }
        }}
        {...rest}
      />
      {value ? (
        <IconButton icon="close" label="Clear search" size="xsmall" tooltip={false} className={styles.clear} onClick={clear} disabled={disabled} />
      ) : shortcutLabel ? (
        <Kbd aria-hidden="true">{shortcutLabel}</Kbd>
      ) : null}
    </div>
  )
}

function shortcutAria(shortcut: Shortcut): string {
  const parts = []
  if (shortcut.mod) parts.push('Meta')
  if (shortcut.alt) parts.push('Alt')
  if (shortcut.shift) parts.push('Shift')
  parts.push(shortcut.key === '/' ? 'Slash' : shortcut.key)
  return parts.join('+')
}
