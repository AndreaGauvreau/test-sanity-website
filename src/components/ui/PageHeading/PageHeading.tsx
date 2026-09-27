import type { ReactNode } from 'react'

import { Eyebrow } from '@/components/ui/Eyebrow/Eyebrow'

import styles from './PageHeading.module.css'

type Props = {
  /** id du h1 : la section de la page s'y rattache (aria-labelledby). */
  id: string
  eyebrow?: ReactNode
  title: ReactNode
  lede?: ReactNode
  className?: string
}

// En-tête des pages listing (/testimonials, /faq) et des pages article de ces collections : sur-titre, titre
// h1 et chapeau dans un <hgroup>, avec les styles de texte des sections de la page d'accueil (Eyebrow,
// --text-title-xl, texte atténué). Pas de maquette : composé des briques existantes.
export function PageHeading({ id, eyebrow, title, lede, className }: Props) {
  return (
    <hgroup className={[styles.heading, className].filter(Boolean).join(' ')}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 id={id} className={styles.title}>
        {title}
      </h1>
      {lede && <p className={styles.lede}>{lede}</p>}
    </hgroup>
  )
}
