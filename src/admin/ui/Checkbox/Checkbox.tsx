'use client'

import { useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Icon } from '../icons'
import { cx } from '../utils/cx'
import { mergeRefs } from '../utils/refs'
import { useControllableState } from '../utils/useControllableState'
import styles from './Checkbox.module.css'

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'defaultChecked' | 'onChange' | 'children'> & {
  /** Libellé (Body, text/secondary). Sans libellé visible, passer aria-label. */
  label?: ReactNode
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  /** État mixte (sélection partielle) : trait blanc ; propriété native indeterminate (lue « mixed »). */
  indeterminate?: boolean
  className?: string
  ref?: Ref<HTMLInputElement>
}

/**
 * Case à cocher 16 px (Figma « Checkbox » 330:283) : unchecked (bg/input + border/strong), checked et
 * indeterminate (interactive/primary + coche / trait 12 on-accent), disabled (opacité 0.4).
 * <input type="checkbox"> natif, visuellement remplacé : clavier (Espace) et formulaires natifs.
 */
export function Checkbox({
  label,
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  indeterminate = false,
  className,
  disabled,
  id: idProp,
  ref,
  ...rest
}: CheckboxProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [checked, setChecked] = useControllableState(checkedProp, defaultChecked, onCheckedChange)

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  }, [indeterminate])

  const on = checked || indeterminate
  return (
    <label htmlFor={id} className={cx(styles.checkbox, disabled && styles.disabled, className)} data-state={indeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked'}>
      <input
        ref={mergeRefs(inputRef, ref)}
        id={id}
        type="checkbox"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(event) => setChecked(event.target.checked)}
        {...rest}
      />
      <span className={cx(styles.box, on && styles.on)} aria-hidden="true">
        {on ? <Icon name={indeterminate ? 'minus' : 'check'} size={12} className={styles.mark} /> : null}
      </span>
      {label != null ? <span className={styles.label}>{label}</span> : null}
    </label>
  )
}
