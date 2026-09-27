import type { StegaBranded } from 'next-sanity'

import { Button } from '@/components/ui/Button/Button'
import { editAttrs } from '@/lib/editor/preview'
import { HOME_DOCUMENT_ID } from '@/lib/site'
import type { TourSection } from '@/sanity/types'

import styles from './Tour.module.css'

// Visite guidée de la page Dock Scheduling (Figma 269:420). Pas de <div> pour la carte :
// l'aplat bleu et le graphisme de lignes sont des pseudo-éléments de la section (décor pur),
// le titre, le texte et le bouton se posent dessus sur la même grille, dans l'ordre de lecture.
// Textes : Sanity (onglet Visite guidée), marqués pour le clic-pour-éditer en Draft Mode.
export function Tour({ data }: { data: StegaBranded<TourSection> }) {
  const { title, lede, cta } = data

  return (
    <section className={styles.tour} aria-labelledby="tour-title" {...editAttrs('tour', { doc: HOME_DOCUMENT_ID })}>
      <h2 id="tour-title" className={styles.title} {...editAttrs('tour.title')}>
        {title}
      </h2>
      <p className={styles.lede} {...editAttrs('tour.lede')}>
        {lede}
      </p>
      {/* Champ requis, mais un brouillon peut en être dépourvu. */}
      {cta && (
        <Button href={cta.href ?? '#'} tone="inverse" className={styles.cta} edit={editAttrs('tour.cta')}>
          {cta.label}
        </Button>
      )}
    </section>
  )
}
