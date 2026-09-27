import { stegaClean, type StegaBranded } from 'next-sanity'

import { Button } from '@/components/ui/Button/Button'
import { editAttrs } from '@/lib/editor/preview'
import { HOME_DOCUMENT_ID } from '@/lib/site'
import type { HeroSection } from '@/sanity/types'

import styles from './Hero.module.css'

// Hero de la page Dock Scheduling (Figma 269:177). Une seule grille, dans l'ordre de
// lecture : titre, chapô, actions, notes, puis le visuel. Textes : Sanity (onglet Hero) ;
// en Draft Mode ils portent l'encodage invisible du clic-pour-éditer (StegaBranded) :
// stegaClean() avant de s'en servir ailleurs que comme texte affiché.
export function Hero({ data }: { data: StegaBranded<HeroSection> }) {
  const { title, lede, primaryCta, secondaryCta, ratings } = data

  return (
    <section className={styles.hero} aria-labelledby="hero-title" {...editAttrs('hero', { doc: HOME_DOCUMENT_ID })}>
      <h1 id="hero-title" className={styles.title} {...editAttrs('hero.title')}>
        {title}
      </h1>
      <p className={styles.lede} {...editAttrs('hero.lede')}>
        {lede}
      </p>
      {(primaryCta || secondaryCta) && (
        <div className={styles.actions}>
          {primaryCta && (
            <Button href={primaryCta.href ?? '#'} className={styles.primaryCta} edit={editAttrs('hero.primaryCta')}>
              {primaryCta.label}
            </Button>
          )}
          {secondaryCta && (
            <Button
              href={secondaryCta.href ?? '#'}
              variant="secondary"
              className={styles.secondaryCta}
              edit={editAttrs('hero.secondaryCta')}
            >
              {secondaryCta.label}
            </Button>
          )}
        </div>
      )}
      {ratings && ratings.length > 0 && (
        // role="list" : Safari retire la sémantique de liste quand list-style vaut none.
        <ul className={styles.ratings} role="list">
          {ratings.map((rating) => (
            <li key={rating._key}>
              {/* stegaClean : la valeur choisit une classe, elle ne s'affiche pas. */}
              <a
                href={stegaClean(rating.href) ?? '#'}
                className={`${styles.rating} ${styles[stegaClean(rating.platform)]}`}
                {...editAttrs('hero.rating', { key: rating._key })}
              >
                {rating.label}
              </a>
            </li>
          ))}
        </ul>
      )}
      {/* Fenêtre vide en attendant la capture du produit, qui viendra s'y loger. */}
      <div className={styles.visual} {...editAttrs('hero.visual')}>
        <div className={styles.window} />
      </div>
    </section>
  )
}
