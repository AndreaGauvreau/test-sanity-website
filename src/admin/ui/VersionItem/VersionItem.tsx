import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Tag } from '../Tag'
import { cx } from '../utils/cx'
import styles from './VersionItem.module.css'

export type VersionStatus = 'live' | 'failed'

export type VersionItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** « Today 09:10 · Andrea » (Body). */
  label: ReactNode
  /** Tag exposé : live = « Live » (inverse), failed = « Failed » (error + ✕). */
  status?: VersionStatus
  /** Tag libre (prioritaire sur `status`). */
  tag?: ReactNode
  /** Version affichée dans le détail (Figma state=selected) : aria-current. */
  selected?: boolean
  ref?: Ref<HTMLButtonElement>
}

/**
 * Ligne de version (Figma « Version item » 337:1486) : 380 px dans Figma, fluide ici ; pad 10 12, gap 8,
 * radius/md. Bouton : hover bg/subtle, selected bg/input-hover (libellé text/primary). Composant pur.
 */
export function VersionItem({ label, status, tag, selected, className, type = 'button', ref, ...rest }: VersionItemProps) {
  const tagNode =
    tag ??
    (status === 'live' ? (
      <Tag tone="inverse">Live</Tag>
    ) : status === 'failed' ? (
      <Tag tone="error" icon="close">
        Failed
      </Tag>
    ) : null)
  return (
    <button
      ref={ref}
      type={type}
      aria-current={selected ? 'true' : undefined}
      data-selected={selected || undefined}
      className={cx(styles.item, className)}
      {...rest}
    >
      <span className={styles.label}>{label}</span>
      {tagNode}
    </button>
  )
}
