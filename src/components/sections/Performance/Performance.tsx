import Image from 'next/image'
import { stegaClean, type StegaBranded } from 'next-sanity'

import { Eyebrow } from '@/components/ui/Eyebrow/Eyebrow'
import { editAttrs } from '@/lib/editor/preview'
import { HOME_DOCUMENT_ID } from '@/lib/site'
import type { PerformanceSection } from '@/sanity/types'

import styles from './Performance.module.css'
import warehouse from './warehouse.jpg'

// Performance (Figma 269:272). Titre en haut, trois atouts en bas, sur une photo d'entrepôt
// assombrie que traversent deux flèches (dégradés et flèches : pseudo-éléments du CSS).
// Textes : Sanity (onglet Performance) ; stegaClean() sur ce qui choisit une classe.
export function Performance({ data }: { data: StegaBranded<PerformanceSection> }) {
  const { eyebrow, title, benefits } = data

  return (
    <section
      className={styles.performance}
      aria-labelledby="performance-title"
      {...editAttrs('performance', { doc: HOME_DOCUMENT_ID })}
    >
      {/* Photo décorative : le titre et les atouts portent le sens. Sa boîte (la scène) est
          réglée dans le CSS ; recadrée en « cover », elle est plus large que l'écran tant que
          la scène est plus haute que la proportion du Figma : 1082 px (608 de haut) sur
          mobile, 1139 px (640 de haut) de 810 à 1140, toute la largeur ensuite. */}
      <Image
        src={warehouse}
        alt=""
        sizes="(min-width: 1140px) 100vw, (min-width: 810px) 1139px, 1082px"
        className={styles.photo}
      />
      <hgroup className={styles.heading}>
        <Eyebrow tone="inverse" className={styles.eyebrow} edit={editAttrs('performance.eyebrow')}>
          {eyebrow}
        </Eyebrow>
        <h2 id="performance-title" className={styles.title} {...editAttrs('performance.title')}>
          {title}
        </h2>
      </hgroup>
      {benefits?.length > 0 && (
        // role="list" : Safari retire la sémantique de liste quand list-style vaut none.
        <ul className={styles.benefits} role="list">
          {benefits.map((benefit) => (
            // stegaClean : la valeur choisit le pictogramme, elle ne s'affiche pas.
            <li
              key={benefit._key}
              className={`${styles.benefit} ${styles[stegaClean(benefit.icon)]}`}
              {...editAttrs('performance.benefit', { key: benefit._key })}
            >
              <h3 className={styles.benefitTitle} {...editAttrs('performance.benefit.title', { key: benefit._key })}>
                {benefit.title}
              </h3>
              <p className={styles.benefitText} {...editAttrs('performance.benefit.text', { key: benefit._key })}>
                {benefit.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
