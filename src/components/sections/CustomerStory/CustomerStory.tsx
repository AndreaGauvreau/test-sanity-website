import type { StegaBranded } from 'next-sanity'

import { Button } from '@/components/ui/Button/Button'
import { Eyebrow } from '@/components/ui/Eyebrow/Eyebrow'
import type { CustomerStorySection } from '@/sanity/types'

import styles from './CustomerStory.module.css'

// Étude de cas de la page Dock Scheduling (Figma 269:305). Une seule grille, dans l'ordre
// de lecture : sur-titre et titre, lien vers l'étude, illustration, résumé, chiffres clés,
// résultats. Textes : Sanity (onglet Étude de cas) ; l'illustration est un décor du code.
// Chiffres clés en <dl> : le chiffre (dt) d'abord, sa légende (dd) ensuite, comme à l'écran.
export function CustomerStory({ data }: { data: StegaBranded<CustomerStorySection> }) {
  const { eyebrow, title, cta, summary, stats, results } = data

  return (
    <section className={styles.customerStory} aria-labelledby="customerStory-title">
      <hgroup className={styles.heading}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id="customerStory-title" className={styles.title}>
          {title}
        </h2>
      </hgroup>
      {cta && (
        <Button href={cta.href ?? '#'} variant="secondary">
          {cta.label}
        </Button>
      )}
      {/* Cadre vide en attendant l'illustration, qui viendra s'y loger. */}
      <div className={styles.illustration} />
      <p className={styles.summary}>{summary}</p>
      {stats && stats.length > 0 && (
        <dl className={styles.stats}>
          {stats.map((stat) => (
            <div key={stat._key} className={styles.stat}>
              <dt className={styles.value}>{stat.value}</dt>
              <dd className={styles.label}>{stat.label}</dd>
            </div>
          ))}
        </dl>
      )}
      {results && results.length > 0 && (
        // role="list" : Safari retire la sémantique de liste quand list-style vaut none.
        <ul className={styles.results} role="list">
          {results.map((result) => (
            <li key={result._key} className={styles.result}>
              {result.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
