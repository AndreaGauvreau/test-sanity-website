import type { ElementType, HTMLAttributes, Ref } from 'react'
import { cx } from '../utils/cx'
import styles from './ContentArea.module.css'

export type ContentAreaProps = HTMLAttributes<HTMLElement> & {
  /** Écart vertical entre les blocs (Figma : 24 Overview, 20 CMS / Publish, 16 Media). */
  gap?: 16 | 20 | 24
  /** Marges (Figma : 28 40 40 par défaut ; 24 40 pour les pages avec onglets C1 / C2). */
  padding?: 'default' | 'tabs'
  as?: ElementType
  ref?: Ref<HTMLElement>
}

/**
 * Zone de contenu d'un écran de la coque (Figma : cadre « content » sous la Top bar, B1, C3, C5, E1) : colonne,
 * pad 28 40 40 40, défilement vertical à la charge de la coque. Composant pur.
 * TOUTE LA LARGEUR : le Figma plafonnait à 1 120 px utiles (écran de 1 440) ; l'utilisatrice a demandé le plein écran
 * sur tous les écrans (2026-09-28), l'ancienne propriété `width` ('default' | 'full') a disparu avec ce plafond.
 */
export function ContentArea({ gap = 20, padding = 'default', as, className, ref, ...rest }: ContentAreaProps) {
  const Comp: ElementType = as ?? 'div'
  return <Comp ref={ref} data-gap={gap} data-padding={padding} className={cx(styles.content, className)} {...rest} />
}
