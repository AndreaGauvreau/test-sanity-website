'use client'

import { useId, useState, type ChangeEvent, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'
import { Field, type FieldLayout } from '../Field'
import { cx } from '../utils/cx'
import styles from './Textarea.module.css'

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'children'> & {
  label?: ReactNode
  hideLabel?: boolean
  helper?: ReactNode
  error?: ReactNode | boolean
  layout?: FieldLayout
  /** Compteur « n / maxLength » en aide (Figma : « 112 / 160 »). */
  showCount?: boolean
  className?: string
  textareaClassName?: string
  ref?: Ref<HTMLTextAreaElement>
}

/** Texte multiligne (Figma « Textarea » 327:436) : 88 px, redimensionnable verticalement ; mêmes états que Input. */
export function Textarea({
  label,
  hideLabel,
  helper,
  error,
  layout,
  showCount,
  className,
  textareaClassName,
  id: idProp,
  maxLength,
  value,
  defaultValue,
  onChange,
  ref,
  'aria-describedby': describedByProp,
  ...rest
}: TextareaProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const helperId = `${id}-helper`
  const [innerLength, setInnerLength] = useState(() => String(defaultValue ?? '').length)
  const length = value != null ? String(value).length : innerLength
  const invalid = error != null && error !== false && error !== ''
  const message = helper ?? (showCount && maxLength ? `${length} / ${maxLength}` : undefined)
  const hasHelper = (invalid && error !== true) || message != null
  const describedBy = [describedByProp, hasHelper ? helperId : undefined].filter(Boolean).join(' ') || undefined

  return (
    <Field label={label} hideLabel={hideLabel} htmlFor={id} helper={message} error={error} helperId={helperId} layout={layout} className={className}>
      <textarea
        ref={ref}
        id={id}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cx(styles.textarea, invalid && styles.invalid, textareaClassName)}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
          if (value == null) setInnerLength(event.target.value.length)
          onChange?.(event)
        }}
        {...rest}
      />
    </Field>
  )
}
