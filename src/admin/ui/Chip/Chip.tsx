'use client'

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { cx } from '../utils/cx'
import { useControllableState } from '../utils/useControllableState'
import styles from './Chip.module.css'

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onChange'> & {
  children: ReactNode
  /** Icône 12 px à gauche (Figma : Show icon + Icon, défaut « style »). */
  icon?: IconName
  /** État on/off contrôlé. */
  pressed?: boolean
  defaultPressed?: boolean
  onPressedChange?: (pressed: boolean) => void
  ref?: Ref<HTMLButtonElement>
}

/**
 * Pastille bascule (Figma « Chip » 321:421) : off, hover, on (fond inversé), disabled.
 * Plusieurs chips peuvent être actives à la fois (contrairement au Segmented control) : aria-pressed.
 */
export function Chip({
  children,
  icon,
  pressed: pressedProp,
  defaultPressed = false,
  onPressedChange,
  className,
  onClick,
  type = 'button',
  ref,
  ...rest
}: ChipProps) {
  const [pressed, setPressed] = useControllableState(pressedProp, defaultPressed, onPressedChange)
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      data-state={pressed ? 'on' : 'off'}
      className={cx(styles.chip, className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) setPressed(!pressed)
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={12} set={18} /> : null}
      <span className={styles.label}>{children}</span>
    </button>
  )
}
