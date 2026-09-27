import type { HTMLAttributes, Ref } from 'react'
import { cx } from '../utils/cx'
import styles from './VariableChip.module.css'

export type VariableChipProps = HTMLAttributes<HTMLSpanElement> & {
  /** Nom du champ (« title » pour {{title}}). */
  name: string
  /** Libellé affiché (défaut : le nom). */
  label?: string
  /** Variable inconnue de la collection : puce rouge (proposé par C6). */
  invalid?: boolean
  ref?: Ref<HTMLSpanElement>
}

/** Champ CMS dans un texte (Figma « Variable chip » 445:1898) : {{title}} affiché « title » sur bg/tint/variable, Body Small text/variable. */
export function VariableChip({ name, label, invalid, className, ref, ...rest }: VariableChipProps) {
  return (
    <span ref={ref} data-variable={name} data-invalid={invalid || undefined} className={cx(styles.chip, invalid && styles.invalid, className)} {...rest}>
      {label ?? name}
    </span>
  )
}
