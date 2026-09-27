'use client'

import { useId, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { Switch } from '../Switch'
import { cx } from '../utils/cx'
import styles from './SettingRow.module.css'

export type SettingRowProps = Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onChange'> & {
  title: ReactNode
  description?: ReactNode
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  /** Nom de champ du Switch (formulaires). */
  name?: string
  /** Remplace le Switch par un autre contrôle (ex. Select, Button) ; il doit se nommer lui-même. */
  control?: ReactNode
  ref?: Ref<HTMLDivElement>
}

/**
 * Réglage avec Switch (Figma « Setting row » 330:341) : 560 px (fluide), pad 12 0, gap 24, trait bas border/subtle ;
 * titre Body text/primary, description Body Small text/tertiary. Le Switch est nommé par le titre et décrit par la description.
 */
export function SettingRow({
  title,
  description,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  name,
  control,
  className,
  ref,
  ...rest
}: SettingRowProps) {
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  return (
    <div ref={ref} className={cx(styles.row, className)} {...rest}>
      <div className={styles.text}>
        <span id={titleId} className={styles.title}>
          {title}
        </span>
        {description != null ? (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        ) : null}
      </div>
      {control ?? (
        <Switch
          checked={checked}
          defaultChecked={defaultChecked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          name={name}
          aria-labelledby={titleId}
          aria-describedby={description != null ? descriptionId : undefined}
        />
      )}
    </div>
  )
}
