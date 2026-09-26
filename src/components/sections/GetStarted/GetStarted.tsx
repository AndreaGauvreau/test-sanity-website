import Image from 'next/image'
import type { StegaBranded } from 'next-sanity'

import { Button } from '@/components/ui/Button/Button'
import { Eyebrow } from '@/components/ui/Eyebrow/Eyebrow'
import type { GetStartedSection } from '@/sanity/types'

import photo from './distribution-center-night.jpg'
import styles from './GetStarted.module.css'

// Appel final de la page Dock Scheduling (Figma 269:543). Pas de <div> pour la carte : son
// aplat bleu nuit est un ::before de la section, la photo une image décorative posée dessus
// (alt vide : le titre dit tout). Ordre de lecture : sur-titre, titre, texte, boutons.
// Textes : Sanity (onglet Appel final), marqués pour le clic-pour-éditer en Draft Mode.
export function GetStarted({ data }: { data: StegaBranded<GetStartedSection> }) {
  const { eyebrow, title, titleMuted, text, primaryCta, secondaryCta } = data

  return (
    <section className={styles.getStarted} aria-labelledby="getStarted-title">
      <Image src={photo} alt="" sizes="(min-width: 90rem) 80rem, 90vw" className={styles.photo} />
      <hgroup className={styles.heading}>
        <Eyebrow tone="inverse">{eyebrow}</Eyebrow>
        <h2 id="getStarted-title" className={styles.title}>
          {title}
          {titleMuted && (
            <>
              {' '}
              <span className={styles.muted}>{titleMuted}</span>
            </>
          )}
        </h2>
      </hgroup>
      <p className={styles.text}>{text}</p>
      {(primaryCta || secondaryCta) && (
        <div className={styles.actions}>
          {/* Pavé gris clair du Figma (#f9f9f9) : le ton par défaut, pas le blanc d'« inverse ». */}
          {primaryCta && <Button href={primaryCta.href ?? '#'}>{primaryCta.label}</Button>}
          {secondaryCta && (
            <Button href={secondaryCta.href ?? '#'} variant="secondary" tone="inverse">
              {secondaryCta.label}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
