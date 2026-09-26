import Image, { type StaticImageData } from 'next/image'
import type { StegaBranded } from 'next-sanity'

import { Button } from '@/components/ui/Button/Button'
import { Eyebrow } from '@/components/ui/Eyebrow/Eyebrow'
import type { IntegrationsSection } from '@/sanity/types'

import styles from './Integrations.module.css'
import americanAirlines from './logo-american-airlines.svg'
import deloitte from './logo-deloitte.svg'
import figma from './logo-figma.svg'
import kraftHeinz from './logo-kraft-heinz.svg'
import netflix from './logo-netflix.svg'
import pfizer from './logo-pfizer.svg'
import uber from './logo-uber.svg'

type Logo = { key: string; src: StaticImageData; alt: string; className?: string }

// Logos des intégrations : fixes, dans l'ordre du Figma (le logo Figma y figure deux fois).
// Le texte alternatif nomme la marque ; les SVG gardent leur taille d'origine.
const logos: Logo[] = [
  { key: 'figma', src: figma, alt: 'Figma' },
  { key: 'uber', src: uber, alt: 'Uber' },
  { key: 'netflix', src: netflix, alt: 'Netflix' },
  { key: 'figma-2', src: figma, alt: 'Figma' },
  { key: 'pfizer', src: pfizer, alt: 'Pfizer', className: styles.pfizer },
  { key: 'american-airlines', src: americanAirlines, alt: 'American Airlines', className: styles.americanAirlines },
  { key: 'deloitte', src: deloitte, alt: 'Deloitte' },
  { key: 'kraft-heinz', src: kraftHeinz, alt: 'Kraft Heinz' },
]

// Intégrations de la page Dock Scheduling (Figma 269:347). Dans l'ordre de lecture : titre,
// texte, lien, puis le chiffre clé et la grille de logos. Textes : Sanity (onglet
// Intégrations) ; les logos restent dans le code.
export function Integrations({ data }: { data: StegaBranded<IntegrationsSection> }) {
  const { eyebrow, title, body, cta, statValue, statLabel } = data

  return (
    <section className={styles.integrations} aria-labelledby="integrations-title">
      <hgroup className={styles.heading}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id="integrations-title" className={styles.title}>
          {title}
        </h2>
      </hgroup>
      <p className={styles.body}>{body}</p>
      {cta && (
        <p className={styles.action}>
          <Button href={cta.href ?? '#'} variant="secondary">
            {cta.label}
          </Button>
        </p>
      )}
      {/* Une phrase : « 160+ WMS, TMS, ERP, and EDI integrations ». */}
      <p className={styles.stat}>
        <span className={styles.statValue}>{statValue}</span>{' '}
        <span className={styles.statLabel}>{statLabel}</span>
      </p>
      <ul className={styles.logos}>
        {logos.map((logo) => (
          <li key={logo.key} className={styles.logo}>
            <Image src={logo.src} alt={logo.alt} className={logo.className} />
          </li>
        ))}
      </ul>
    </section>
  )
}
