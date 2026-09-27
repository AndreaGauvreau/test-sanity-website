import type { ButtonHTMLAttributes, Ref } from 'react'
import { cx } from '../utils/cx'
import styles from './RemoveBadge.module.css'

export type RemoveBadgeProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** Nom accessible (défaut « Remove image »). */
  label?: string
  /** Pose la pastille sur le coin haut droit du parent (position: relative requis), à x = largeur − 9, y = −9. */
  corner?: boolean
  ref?: Ref<HTMLButtonElement>
}

/**
 * Pastille de suppression d'une image (Figma « Remove badge » 410:1547) : 18 px, bg/strong, croix icon/default
 * (trait 1,5), deux ombres légères. Zone cliquable élargie à 28 px.
 */
export function RemoveBadge({ label = 'Remove image', corner, className, type = 'button', ref, ...rest }: RemoveBadgeProps) {
  return (
    <button ref={ref} type={type} aria-label={label} className={cx(styles.badge, corner && styles.corner, className)} {...rest}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
        <path d="M6.5 6.5L11.5 11.5M11.5 6.5L6.5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}
