import type { ReactNode } from 'react'

import type { EditAttrs } from '@/lib/editor/preview'

import styles from './Eyebrow.module.css'

type Props = {
  children: ReactNode
  /** `accent` (orange) sur fond clair, `inverse` (blanc) sur fond sombre ou bleu. */
  tone?: 'accent' | 'inverse'
  /** Classe fournie par la section : placement, et ancre de sa zone d'éditeur. */
  className?: string
  /** Marquage de l'éditeur IA (editAttrs), vide hors du mode aperçu. */
  edit?: EditAttrs
}

// Sur-titre des sections (« • Conduit System », « • Performance »…), calques « item » du
// Figma. Un paragraphe placé avant le titre, idéalement avec lui dans un <hgroup>.
// La pastille est décorative : un ::before.
export function Eyebrow({ children, tone = 'accent', className, edit }: Props) {
  return (
    <p {...edit} className={[styles.eyebrow, styles[tone], className].filter(Boolean).join(' ')}>
      {children}
    </p>
  )
}
