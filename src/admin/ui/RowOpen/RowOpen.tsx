'use client'

import type { HTMLAttributes, MouseEventHandler, Ref } from 'react'
import { IconButton } from '../IconButton'
import { cx } from '../utils/cx'
import styles from './RowOpen.module.css'

export type RowOpenProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onClick'> & {
  /** Ouvre la fiche dans le panneau (Drawer). */
  onOpen: MouseEventHandler<HTMLButtonElement>
  /** Nom accessible du bouton (défaut « Open »). Préciser l'élément : « Open How to cut dock wait times ». */
  label?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * Bouton « ouvrir dans le panneau » d'une ligne CMS survolée (Figma « Row open » 468:2027) : 120 × 44,
 * collé à droite de la ligne (position absolue), Icon button secondary (open) sur un fondu de la couleur
 * de ligne survolée (bg/input-hover), du transparent au plein à 45 %. Visible au survol et au focus de la
 * ligne : le parent pose `data-row` (CMSRow le fait) ; hors ligne, toujours visible.
 */
export function RowOpen({ onOpen, label = 'Open', className, ref, ...rest }: RowOpenProps) {
  return (
    <div ref={ref} className={cx(styles.rowOpen, className)} {...rest}>
      <IconButton icon="open" label={label} variant="secondary" tooltip={false} onClick={onOpen} className={styles.button} />
    </div>
  )
}
