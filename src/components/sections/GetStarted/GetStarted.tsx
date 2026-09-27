import Image from 'next/image'
import type { StegaBranded } from 'next-sanity'

import { Button } from '@/components/ui/Button/Button'
import { Eyebrow } from '@/components/ui/Eyebrow/Eyebrow'
import { editAttrs } from '@/lib/editor/preview'
import { HOME_DOCUMENT_ID } from '@/lib/site'
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
    <section
      className={styles.getStarted}
      aria-labelledby="getStarted-title"
      {...editAttrs('getStarted', { doc: HOME_DOCUMENT_ID })}
    >
      <Image src={photo} alt="" sizes="(min-width: 90rem) 80rem, 90vw" className={styles.photo} />
      <hgroup className={styles.heading}>
        <Eyebrow tone="inverse" className={styles.eyebrow} edit={editAttrs('getStarted.eyebrow')}>
          {eyebrow}
        </Eyebrow>
        <h2 id="getStarted-title" className={styles.title} {...editAttrs('getStarted.title')}>
          {title}
          {titleMuted && (
            <>
              {' '}
              <span className={styles.muted} {...editAttrs('getStarted.title.muted')}>
                {titleMuted}
              </span>
            </>
          )}
        </h2>
      </hgroup>
      <p className={styles.text} {...editAttrs('getStarted.text')}>
        {text}
      </p>
      {(primaryCta || secondaryCta) && (
        <div className={styles.actions}>
          {/* Pavé gris clair du Figma (#f9f9f9) : le ton par défaut, pas le blanc d'« inverse ». */}
          {primaryCta && (
            <Button href={primaryCta.href ?? '#'} className={styles.primaryCta} edit={editAttrs('getStarted.primaryCta')}>
              {primaryCta.label}
            </Button>
          )}
          {secondaryCta && (
            <Button
              href={secondaryCta.href ?? '#'}
              variant="secondary"
              tone="inverse"
              className={styles.secondaryCta}
              edit={editAttrs('getStarted.secondaryCta')}
            >
              {secondaryCta.label}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
