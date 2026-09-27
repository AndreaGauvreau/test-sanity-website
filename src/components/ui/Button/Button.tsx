import Link from 'next/link'
import { stegaClean } from 'next-sanity'
import type { ReactNode } from 'react'

import type { EditAttrs } from '@/lib/editor/preview'

import styles from './Button.module.css'

type Props = {
  href: string
  variant?: 'primary' | 'secondary'
  /** `inverse` sur fond sombre ou bleu : pavé blanc (primary), libellé blanc (secondary). */
  tone?: 'default' | 'inverse'
  /** Classe de placement fournie par la section (grille, marges) ; aussi l'ancre de sa zone d'éditeur. */
  className?: string
  /** Marquage de l'éditeur IA (editAttrs), vide hors du mode aperçu. */
  edit?: EditAttrs
  children: ReactNode
}

// Lien au style bouton : les CTA du Figma. Le libellé s'écrit en casse normale,
// les capitales viennent du CSS (lecteurs d'écran : pas d'épellation).
// L'URL peut venir de Sanity : on retire l'encodage invisible du Draft Mode (stega).
export function Button({ href, variant = 'primary', tone = 'default', className, edit, children }: Props) {
  return (
    <Link
      {...edit}
      href={stegaClean(href)}
      className={[styles.button, styles[variant], tone === 'inverse' && styles.inverse, className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Link>
  )
}
