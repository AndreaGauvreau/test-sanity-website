import type { ReactNode } from 'react'

import styles from './Eyebrow.module.css'

type Props = {
  children: ReactNode
  /** `accent` (orange) sur fond clair, `inverse` (blanc) sur fond sombre ou bleu. */
  tone?: 'accent' | 'inverse'
  className?: string
}

// Sur-titre des sections (« • Conduit System », « • Performance »…), calques « item » du
// Figma. Un paragraphe placé avant le titre, idéalement avec lui dans un <hgroup>.
// La pastille est décorative : un ::before.
export function Eyebrow({ children, tone = 'accent', className }: Props) {
  return <p className={[styles.eyebrow, styles[tone], className].filter(Boolean).join(' ')}>{children}</p>
}
