import type { StegaBranded } from 'next-sanity'

import type { FeaturesSection } from '@/sanity/types'

import styles from './Features.module.css'

// Fonctionnalités de la page Dock Scheduling (Figma 269:216) : trois cartes, chacune une
// illustration puis un titre et un texte. Le design n'a pas de titre visible : le h2 est
// masqué mais nomme la section pour les lecteurs d'écran. Textes : Sanity (onglet
// Fonctionnalités) ; l'illustration est un décor du code (::before de la carte).
export function Features({ data }: { data: StegaBranded<FeaturesSection> }) {
  const { title, items } = data

  return (
    <section className={styles.features} aria-labelledby="features-title">
      <h2 id="features-title" className="visually-hidden">
        {title}
      </h2>
      {items && items.length > 0 && (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item._key} className={styles.card}>
              <h3 className={styles.cardTitle}>{item.title}</h3>
              <p className={styles.text}>{item.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
