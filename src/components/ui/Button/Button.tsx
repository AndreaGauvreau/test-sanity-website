import Link from 'next/link'
import { stegaClean } from 'next-sanity'
import type { ReactNode } from 'react'

import styles from './Button.module.css'

type Props = {
  href: string
  variant?: 'primary' | 'secondary'
  /** `inverse` sur fond sombre ou bleu : pavé blanc (primary), libellé blanc (secondary). */
  tone?: 'default' | 'inverse'
  /** Classe de placement fournie par la section (grille, marges). */
  className?: string
  children: ReactNode
}

// Lien au style bouton : les CTA du Figma. Le libellé s'écrit en casse normale,
// les capitales viennent du CSS (lecteurs d'écran : pas d'épellation).
// L'URL peut venir de Sanity : on retire l'encodage invisible du Draft Mode (stega).
export function Button({ href, variant = 'primary', tone = 'default', className, children }: Props) {
  return (
    <Link
      href={stegaClean(href)}
      className={[styles.button, styles[variant], tone === 'inverse' && styles.inverse, className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Link>
  )
}
