import type { CSSProperties, HTMLAttributes, Ref } from 'react'
import { cx } from '../utils/cx'
import styles from './ProgressBar.module.css'

export type ProgressBarProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** 0 à 100 ; absent = indéterminé (balayage). */
  value?: number
  /** primary ; danger = échec (envoi ou publication). */
  tone?: 'primary' | 'danger'
  /** Nom accessible (« Uploading og-home.jpg »). */
  label?: string
  ref?: Ref<HTMLDivElement>
}

/** Jauge 4 px (Figma « Progress bar » 323:235), 240 px par défaut, étirable : le remplissage suit la proportion. */
export function ProgressBar({ value, tone = 'primary', label, className, style, ref, ...rest }: ProgressBarProps) {
  const indeterminate = value == null || Number.isNaN(value)
  const clamped = indeterminate ? 0 : Math.min(100, Math.max(0, value))
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      data-tone={tone}
      data-indeterminate={indeterminate || undefined}
      className={cx(styles.track, tone === 'danger' && styles.danger, indeterminate && styles.indeterminate, className)}
      style={{ ...style, '--progress': `${clamped}%` } as CSSProperties}
      {...rest}
    >
      <span className={styles.fill} aria-hidden="true" />
    </div>
  )
}
