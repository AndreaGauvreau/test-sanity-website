import type { ElementType, HTMLAttributes, Ref } from 'react'
import { cx } from '../utils/cx'
import styles from './ContentArea.module.css'

export type ContentAreaProps = HTMLAttributes<HTMLElement> & {
  /** Écart vertical entre les blocs (Figma : 24 Overview, 20 CMS / Publish, 16 Media). */
  gap?: 16 | 20 | 24
  /** Marges (Figma : 28 40 40 par défaut ; 24 40 pour les pages avec onglets C1 / C2). */
  padding?: 'default' | 'tabs'
  /** Largeur : 1 120 px utiles (défaut) ou toute la place (tableau CMS large, éditeur). */
  width?: 'default' | 'full'
  as?: ElementType
  ref?: Ref<HTMLElement>
}

/**
 * Zone de contenu d'un écran de la coque (Figma : cadre « content » sous la Top bar, B1, C3, C5, E1) : colonne,
 * pad 28 40 40 40, 1 120 px utiles pour un écran de 1 440 (1 200 − 2 × 40), défilement vertical à la charge
 * de la coque. Composant pur.
 */
export function ContentArea({ gap = 20, padding = 'default', width = 'default', as, className, ref, ...rest }: ContentAreaProps) {
  const Comp: ElementType = as ?? 'div'
  return (
    <Comp
      ref={ref}
      data-gap={gap}
      data-padding={padding}
      data-width={width}
      className={cx(styles.content, className)}
      {...rest}
    />
  )
}
