import Link from 'next/link'
import { stegaClean, type StegaBranded } from 'next-sanity'

import { Button } from '@/components/ui/Button/Button'
import { Eyebrow } from '@/components/ui/Eyebrow/Eyebrow'
import type { SystemSection } from '@/sanity/types'

import styles from './ConduitSystem.module.css'

// Section « Conduit System » (Figma 269:232). Dans l'ordre de lecture : sur-titre et titre,
// chapô, bouton, l'emplacement du visuel, puis la liste des modules. Textes : Sanity (onglet
// Conduit System) ; en Draft Mode ils portent l'encodage invisible du clic-pour-éditer
// (StegaBranded) : stegaClean() avant de s'en servir ailleurs que comme texte affiché.
export function ConduitSystem({ data }: { data: StegaBranded<SystemSection> }) {
  const { eyebrow, title, lede, cta, modules } = data

  return (
    <section className={styles.system} aria-labelledby="system-title">
      <hgroup className={styles.heading}>
        {eyebrow && <Eyebrow className={styles.eyebrow}>{eyebrow}</Eyebrow>}
        <h2 id="system-title" className={styles.title}>
          {title}
        </h2>
      </hgroup>
      {lede && <p className={styles.lede}>{lede}</p>}
      {cta && (
        <Button href={cta.href ?? '#'} className={styles.cta}>
          {cta.label}
        </Button>
      )}
      {/* Surface vide et cadre pointillé (CSS) en attendant l'illustration du Conduit System. */}
      <div className={styles.visual} />
      {modules && modules.length > 0 && (
        <ul className={styles.modules}>
          {modules.map((item) => {
            // stegaClean : la clé sert d'identifiant, elle ne s'affiche pas.
            const id = `system-${stegaClean(item._key)}`
            return (
              <li key={item._key} className={styles.module}>
                <h3 id={`${id}-title`} className={styles.moduleTitle}>
                  {item.title}
                </h3>
                <p className={styles.moduleText}>{item.text}</p>
                {/* Nom accessible « See more Driver Check-in » : les trois liens ont le même
                    libellé, le titre du module les distingue hors contexte (liste des liens). */}
                {item.link && (
                  <Link
                    id={`${id}-link`}
                    href={stegaClean(item.link.href) ?? '#'}
                    className={styles.more}
                    aria-labelledby={`${id}-link ${id}-title`}
                  >
                    {item.link.label}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
