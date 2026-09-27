'use client'

import { createContext, useContext, useId, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { cx } from '../utils/cx'
import { useControllableState } from '../utils/useControllableState'
import styles from './Radio.module.css'

type RadioGroupContextValue = {
  name: string
  value: string | null
  disabled?: boolean
  onChange: (value: string) => void
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null)

export type RadioGroupProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> & {
  /** Titre du groupe (Body Small, text/secondary) ; sinon passer aria-label / aria-labelledby. */
  label?: ReactNode
  name?: string
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string) => void
  disabled?: boolean
  orientation?: 'vertical' | 'horizontal'
  children: ReactNode
  ref?: Ref<HTMLDivElement>
}

/** Groupe de boutons radio (role="radiogroup") : radios natifs d'un même `name`, flèches du navigateur. */
export function RadioGroup({
  label,
  name: nameProp,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  disabled,
  orientation = 'vertical',
  className,
  children,
  ref,
  ...rest
}: RadioGroupProps) {
  const autoId = useId()
  const name = nameProp ?? autoId
  const labelId = `${autoId}-label`
  const [value, setValue] = useControllableState<string | null>(valueProp, defaultValue, (v) => {
    if (v != null) onValueChange?.(v)
  })
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-labelledby={label != null ? labelId : rest['aria-labelledby']}
      aria-disabled={disabled || undefined}
      aria-orientation={orientation}
      className={cx(styles.group, orientation === 'horizontal' && styles.horizontal, className)}
      {...rest}
    >
      {label != null ? (
        <span id={labelId} className={styles.groupLabel}>
          {label}
        </span>
      ) : null}
      <RadioGroupContext.Provider value={{ name, value, disabled, onChange: setValue }}>
        <div className={styles.items}>{children}</div>
      </RadioGroupContext.Provider>
    </div>
  )
}

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'children'> & {
  value: string
  label?: ReactNode
  className?: string
  ref?: Ref<HTMLInputElement>
}

/**
 * Bouton radio 16 px (Figma « Radio » 330:305) : unselected (bg/input + border/strong), selected
 * (interactive/primary + point 6 on-accent), disabled (0.4). Dans un <RadioGroup> ou autonome (name, checked).
 */
export function Radio({ value, label, className, disabled, id: idProp, checked, onChange, name, ref, ...rest }: RadioProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const group = useContext(RadioGroupContext)
  const isChecked = group ? group.value === value : checked
  const isDisabled = disabled || group?.disabled
  return (
    <label htmlFor={id} className={cx(styles.radio, isDisabled && styles.disabled, className)} data-state={isChecked ? 'selected' : 'unselected'}>
      <input
        ref={ref}
        id={id}
        type="radio"
        className={styles.input}
        name={group?.name ?? name}
        value={value}
        checked={group ? isChecked : checked}
        disabled={isDisabled}
        onChange={(event) => {
          onChange?.(event)
          if (group && event.target.checked) group.onChange(value)
        }}
        {...rest}
      />
      <span className={cx(styles.circle, isChecked && styles.on)} aria-hidden="true">
        <span className={styles.dot} />
      </span>
      {label != null ? <span className={styles.label}>{label}</span> : null}
    </label>
  )
}
