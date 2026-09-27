'use client'

import { useId, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Field, type FieldLayout } from '../Field'
import { Icon, type IconName } from '../icons'
import { cx } from '../utils/cx'
import { mergeRefs } from '../utils/refs'
import styles from './Input.module.css'

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'children'> & {
  label?: ReactNode
  hideLabel?: boolean
  /** Aide sous le champ (Body Small, text/muted). */
  helper?: ReactNode
  /** Erreur : message (remplace l'aide) ou `true` ; bordure interactive/danger, aria-invalid. */
  error?: ReactNode | boolean
  layout?: FieldLayout
  /** Icône 16 à gauche (Figma : Show icon + Icon). */
  icon?: IconName
  /** Élément à droite dans la boîte (bouton, unité…). */
  suffix?: ReactNode
  /** Affiche le compteur « n / maxLength » comme aide (si pas d'erreur ni d'aide explicite). */
  showCount?: boolean
  /** Classe du conteneur (Field) ; `inputClassName` pour l'<input>. */
  className?: string
  inputClassName?: string
  ref?: Ref<HTMLInputElement>
}

/**
 * Champ texte (Figma « Input » 327:352) : états empty, filled, focused (bordure border/focus),
 * disabled (bg/subtle, text/disabled), error (bordure et aide interactive/danger) ; stacked ou inline.
 */
export function Input({
  label,
  hideLabel,
  helper,
  error,
  layout,
  icon,
  suffix,
  showCount,
  className,
  inputClassName,
  id: idProp,
  disabled,
  maxLength,
  value,
  defaultValue,
  onChange,
  ref,
  'aria-describedby': describedByProp,
  ...rest
}: InputProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const helperId = `${id}-helper`
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [innerLength, setInnerLength] = useState(() => String(defaultValue ?? '').length)
  const length = value != null ? String(value).length : innerLength
  const invalid = error != null && error !== false && error !== ''
  const count = showCount && maxLength ? `${length} / ${maxLength}` : undefined
  const message = helper ?? count
  const hasHelper = (invalid && error !== true) || message != null
  const describedBy = [describedByProp, hasHelper ? helperId : undefined].filter(Boolean).join(' ') || undefined

  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      htmlFor={id}
      helper={message}
      error={error}
      helperId={helperId}
      layout={layout}
      className={className}
    >
      <div
        className={cx(styles.box, invalid && styles.invalid, disabled && styles.disabled)}
        data-invalid={invalid || undefined}
        onPointerDown={(event) => {
          // Un clic dans la marge intérieure de la boîte donne le focus au champ.
          if (event.target === event.currentTarget && !disabled) {
            event.preventDefault()
            inputRef.current?.focus()
          }
        }}
      >
        {icon ? <Icon name={icon} size={16} set={18} className={styles.icon} /> : null}
        <input
          ref={mergeRefs(inputRef, ref)}
          id={id}
          disabled={disabled}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cx(styles.input, inputClassName)}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            if (value == null) setInnerLength(event.target.value.length)
            onChange?.(event)
          }}
          {...rest}
        />
        {suffix}
      </div>
    </Field>
  )
}
