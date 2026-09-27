import type { StegaBranded } from 'next-sanity'

import { Button } from '@/components/ui/Button/Button'
import { Eyebrow } from '@/components/ui/Eyebrow/Eyebrow'
import { editAttrs } from '@/lib/editor/preview'
import { HOME_DOCUMENT_ID } from '@/lib/site'
import type { CustomerStorySection } from '@/sanity/types'

import styles from './CustomerStory.module.css'

// Étude de cas de la page Dock Scheduling (Figma 269:305). Une seule grille, dans l'ordre
// de lecture : sur-titre et titre, lien vers l'étude, illustration, résumé, chiffres clés,
// résultats. Textes : Sanity (onglet Étude de cas) ; l'illustration est un décor du code.
// Chiffres clés en <dl> : le chiffre (dt) d'abord, sa légende (dd) ensuite, comme à l'écran.
export function CustomerStory({ data }: { data: StegaBranded<CustomerStorySection> }) {
  const { eyebrow, title, cta, summary, stats, results } = data

  return (
    <section
      className={styles.customerStory}
      aria-labelledby="customerStory-title"
      {...editAttrs('customerStory', { doc: HOME_DOCUMENT_ID })}
    >
      <hgroup className={styles.heading}>
        <Eyebrow className={styles.eyebrow} edit={editAttrs('customerStory.eyebrow')}>
          {eyebrow}
        </Eyebrow>
        <h2 id="customerStory-title" className={styles.title} {...editAttrs('customerStory.title')}>
          {title}
        </h2>
      </hgroup>
      {cta && (
        <Button href={cta.href ?? '#'} variant="secondary" className={styles.cta} edit={editAttrs('customerStory.cta')}>
          {cta.label}
        </Button>
      )}
      {/* Cadre vide en attendant l'illustration, qui viendra s'y loger. */}
      <div className={styles.illustration} {...editAttrs('customerStory.illustration')} />
      <p className={styles.summary} {...editAttrs('customerStory.summary')}>
        {summary}
      </p>
      {stats && stats.length > 0 && (
        <dl className={styles.stats}>
          {stats.map((stat) => (
            <div key={stat._key} className={styles.stat} {...editAttrs('customerStory.stat', { key: stat._key })}>
              <dt className={styles.value} {...editAttrs('customerStory.stat.value', { key: stat._key })}>
                {stat.value}
              </dt>
              <dd className={styles.label} {...editAttrs('customerStory.stat.label', { key: stat._key })}>
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {results && results.length > 0 && (
        // role="list" : Safari retire la sémantique de liste quand list-style vaut none.
        <ul className={styles.results} role="list">
          {results.map((result) => (
            <li key={result._key} className={styles.result} {...editAttrs('customerStory.result', { key: result._key })}>
              {result.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
