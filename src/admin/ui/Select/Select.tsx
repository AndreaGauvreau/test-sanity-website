'use client'

import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { Field, type FieldLayout } from '../Field'
import { Icon } from '../icons'
import { firstEnabled, flattenOptions, nextEnabled, OptionList, typeahead, type ListItems } from '../OptionList'
import { Popover, type Placement } from '../Popover'
import { cx } from '../utils/cx'
import { mergeRefs } from '../utils/refs'
import { useControllableState } from '../utils/useControllableState'
import styles from './Select.module.css'

export type SelectProps<V extends string = string> = {
  label?: ReactNode
  hideLabel?: boolean
  helper?: ReactNode
  error?: ReactNode | boolean
  layout?: FieldLayout
  /** Options à plat ou en groupes ({ label, options }). */
  options: ListItems<V>
  value?: V | null
  defaultValue?: V | null
  onValueChange?: (value: V) => void
  /** Texte quand rien n'est choisi (text/muted). */
  placeholder?: string
  disabled?: boolean
  required?: boolean
  /** Nom du champ : un <input type="hidden"> porte la valeur dans les formulaires. */
  name?: string
  id?: string
  className?: string
  /** Largeur de la liste au moins égale au champ (défaut) ; placement « bottom-start ». */
  placement?: Placement
  /** Rendu personnalisé de la valeur choisie dans le champ. */
  renderValue?: (value: V, label: string) => ReactNode
  'aria-label'?: string
  ref?: Ref<HTMLButtonElement>
}

/**
 * Liste déroulante (Figma « Select » 327:520) : champ 34 px (empty, filled, open = border/focus + chevron-up,
 * disabled) et liste en popover au style Menu. Motif APG « combobox select-only » : le focus reste sur
 * le champ (aria-activedescendant) ; ↑ ↓ Home End PageUp PageDown, Entrée / Espace, Échap, Tab, recherche par lettres.
 */
export function Select<V extends string = string>({
  label,
  hideLabel,
  helper,
  error,
  layout,
  options,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  placeholder = 'Select…',
  disabled,
  required,
  name,
  id: idProp,
  className,
  placement = 'bottom-start',
  renderValue,
  'aria-label': ariaLabel,
  ref,
}: SelectProps<V>) {
  const autoId = useId()
  const id = idProp ?? autoId
  const labelId = `${id}-label`
  const listId = `${id}-list`
  const helperId = `${id}-helper`
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const flat = useMemo(() => flattenOptions(options), [options])
  const [value, setValue] = useControllableState<V | null>(valueProp, defaultValue, (v) => {
    if (v != null) onValueChange?.(v)
  })
  const [open, setOpen] = useState(false)
  const [instant, setInstant] = useState(false)
  const [active, setActive] = useState(-1)
  const search = useRef({ query: '', at: 0 })

  const selectedIndex = flat.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? flat[selectedIndex] : null
  const optionId = useCallback((i: number) => `${id}-opt-${i}`, [id])
  const invalid = error != null && error !== false && error !== ''
  const hasHelper = (invalid && error !== true) || helper != null

  const openList = (viaKeyboard: boolean, at?: number) => {
    if (disabled) return
    setInstant(viaKeyboard)
    setActive(at ?? (selectedIndex >= 0 ? selectedIndex : firstEnabled(flat)))
    setOpen(true)
  }

  const close = () => setOpen(false)

  const choose = (v: V) => {
    setValue(v)
    close()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    const key = event.key
    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        event.preventDefault()
        const at = key === 'ArrowUp' && selectedIndex < 0 ? firstEnabled(flat, true) : undefined
        openList(true, at)
        return
      }
      if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const i = findByTyping(key)
        if (i >= 0) openList(true, i)
      }
      return
    }
    switch (key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((i) => nextEnabled(flat, i, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        if (event.altKey) {
          if (active >= 0) choose(flat[active].value)
          else close()
        } else setActive((i) => nextEnabled(flat, i, -1))
        break
      case 'Home':
        event.preventDefault()
        setActive(firstEnabled(flat))
        break
      case 'End':
        event.preventDefault()
        setActive(firstEnabled(flat, true))
        break
      case 'PageDown':
        event.preventDefault()
        setActive((i) => stepBy(i, 10))
        break
      case 'PageUp':
        event.preventDefault()
        setActive((i) => stepBy(i, -10))
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (active >= 0 && !flat[active]?.disabled) choose(flat[active].value)
        break
      case 'Tab':
        if (active >= 0 && !flat[active]?.disabled) setValue(flat[active].value)
        close()
        break
      case 'Escape':
        // Popover gère Échap (couche la plus haute) ; rien à faire ici.
        break
      default:
        if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const i = findByTyping(key)
          if (i >= 0) setActive(i)
        }
    }
  }

  function stepBy(from: number, delta: number): number {
    let i = from
    const step = delta > 0 ? 1 : -1
    for (let k = 0; k < Math.abs(delta); k++) i = nextEnabled(flat, i, step)
    return i
  }

  function findByTyping(char: string): number {
    const now = Date.now()
    const s = search.current
    s.query = now - s.at > 500 ? char : s.query + char
    s.at = now
    const from = open ? active : selectedIndex
    // Même lettre répétée : passe à l'option suivante qui commence par cette lettre ;
    // sinon la recherche inclut l'option courante.
    const repeated = s.query.length > 1 && s.query.split('').every((c) => c === s.query[0])
    const start = from < 0 ? -1 : repeated ? from : from - 1
    return typeahead(flat, repeated ? s.query[0] : s.query, start)
  }

  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      labelId={labelId}
      helper={helper}
      error={error}
      helperId={helperId}
      layout={layout}
      className={className}
    >
      <button
        ref={mergeRefs(triggerRef, ref)}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-labelledby={label != null ? `${labelId} ${id}` : undefined}
        aria-label={label == null ? ariaLabel : undefined}
        aria-describedby={hasHelper ? helperId : undefined}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        data-state={open ? 'open' : selected ? 'filled' : 'empty'}
        className={cx(styles.trigger, invalid && styles.invalid)}
        onClick={() => (open ? close() : openList(false))}
        onKeyDown={onKeyDown}
      >
        {selected?.icon ? <Icon name={selected.icon} size={16} set={18} className={styles.icon} /> : null}
        <span className={cx(styles.value, !selected && styles.placeholder)}>
          {selected ? (renderValue ? renderValue(selected.value, selected.label) : selected.label) : placeholder}
        </span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} set={18} className={styles.chevron} />
      </button>
      {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}
      <Popover
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        placement={placement}
        matchAnchorWidth
        instant={instant}
        closeOnFocusOut
        returnFocus
      >
        <OptionList
          id={listId}
          items={options}
          activeIndex={active}
          onActiveIndexChange={setActive}
          selected={value}
          onSelect={choose}
          optionId={optionId}
          aria-labelledby={label != null ? labelId : undefined}
          aria-label={label == null ? ariaLabel : undefined}
        />
      </Popover>
    </Field>
  )
}
