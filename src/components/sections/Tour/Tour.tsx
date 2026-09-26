import type { StegaBranded } from 'next-sanity'

import { Button } from '@/components/ui/Button/Button'
import type { TourSection } from '@/sanity/types'

import styles from './Tour.module.css'

// Visite guidée de la page Dock Scheduling (Figma 269:420). Pas de <div> pour la carte :
// l'aplat bleu et le graphisme de lignes sont des pseudo-éléments de la section (décor pur),
// le titre, le texte et le bouton se posent dessus sur la même grille, dans l'ordre de lecture.
// Textes : Sanity (onglet Visite guidée), marqués pour le clic-pour-éditer en Draft Mode.
export function Tour({ data }: { data: StegaBranded<TourSection> }) {
  const { title, lede, cta } = data

  return (
    <section className={styles.tour} aria-labelledby="tour-title">
      <h2 id="tour-title" className={styles.title}>
        {title}
      </h2>
      <p className={styles.lede}>{lede}</p>
      {/* Champ requis, mais un brouillon peut en être dépourvu. */}
      {cta && (
        <Button href={cta.href ?? '#'} tone="inverse" className={styles.cta}>
          {cta.label}
        </Button>
      )}
    </section>
  )
}
