'use client'

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from '../utils/cx'
import { useControllableState } from '../utils/useControllableState'
import styles from './Switch.module.css'

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'children' | 'value'> & {
  /** Libellé visible à droite (Body, text/secondary). Sans libellé : aria-label ou aria-labelledby. */
  label?: ReactNode
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  /** Nom de champ : un <input type="hidden"> envoie « on » / « off » dans les formulaires. */
  name?: string
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/**
 * Interrupteur 32 × 18 (Figma « Switch » 330:329) : off (bg/input-hover, pastille text/tertiary),
 * on (interactive/primary, pastille blanche à droite), disabled (0.4). role="switch", Espace / Entrée.
 */
export function Switch({
  label,
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  name,
  className,
  disabled,
  onClick,
  ref,
  ...rest
}: SwitchProps) {
  const [checked, setChecked] = useControllableState(checkedProp, defaultChecked, onCheckedChange)
  const control = (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-state={checked ? 'on' : 'off'}
      className={cx(styles.track, label == null && className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) setChecked(!checked)
      }}
      {...rest}
    >
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  )
  const hidden = name ? <input type="hidden" name={name} value={checked ? 'on' : 'off'} /> : null
  if (label == null) {
    return hidden ? (
      <>
        {control}
        {hidden}
      </>
    ) : (
      control
    )
  }
  // <label> englobant : le texte nomme le bouton (élément « labelable ») et le clic sur le texte bascule.
  return (
    <label className={cx(styles.switch, disabled && styles.disabled, className)}>
      {control}
      <span className={styles.label}>{label}</span>
      {hidden}
    </label>
  )
}
