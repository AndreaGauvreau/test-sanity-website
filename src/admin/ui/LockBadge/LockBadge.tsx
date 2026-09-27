'use client'

import type { HTMLAttributes, Ref } from 'react'
import { Icon } from '../icons'
import type { Placement } from '../Popover'
import { Tooltip } from '../Tooltip'
import { cx } from '../utils/cx'
import styles from './LockBadge.module.css'

export type LockBadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  /** Explication, lue par les lecteurs d'écran et montrée en infobulle au survol / focus. */
  label: string
  /** Côté de l'infobulle (Figma : à droite). */
  placement?: Placement
  /** Posé dans le coin haut droit du parent (position: relative), à 8 px. */
  corner?: boolean
  ref?: Ref<HTMLSpanElement>
}

/**
 * Pastille cadenas 24 px (Figma « Lock badge » 453:1923) sur une image quand une action est bloquée :
 * bg/scrim, cadenas 12 ; au survol (et au focus clavier) l'infobulle donne la raison. Focalisable
 * (tabIndex 0) pour que la raison reste accessible au clavier.
 */
export function LockBadge({ label, placement = 'right', corner, className, ref, ...rest }: LockBadgeProps) {
  return (
    <Tooltip label={label} placement={placement} delay={200}>
      <span ref={ref} role="img" aria-label={label} tabIndex={0} className={cx(styles.badge, corner && styles.corner, className)} {...rest}>
        <Icon name="lock" size={12} />
      </span>
    </Tooltip>
  )
}
