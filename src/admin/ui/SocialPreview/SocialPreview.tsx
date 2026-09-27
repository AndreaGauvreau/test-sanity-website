import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { Icon } from '../icons'
import { cx } from '../utils/cx'
import styles from './SocialPreview.module.css'

export type SocialPreviewProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  /** « conduit.com » (Caption, text/muted). */
  domain: ReactNode
  /** Titre (Body, text/primary). */
  title: ReactNode
  /** Description (Body Small, text/tertiary). */
  description?: ReactNode
  /** Image OG (1200 × 630, recadrée au ratio 1,91 : 1). Absente : placeholder avec l'icône image. */
  image?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * Aperçu réseaux sociaux (Figma « Social preview » 338:1245) : 400 px dans Figma, fluide ici (max 400) ;
 * image au ratio 1200/630 puis texte (pad 10 12 12 12, gap 2). Composant pur.
 */
export function SocialPreview({ domain, title, description, image, className, ref, ...rest }: SocialPreviewProps) {
  return (
    <div ref={ref} className={cx(styles.card, className)} {...rest}>
      <div className={styles.image}>
        {image ? <img src={image} alt="" className={styles.img} /> : <Icon name="image" size={18} />}
      </div>
      <div className={styles.text}>
        <span className={styles.domain}>{domain}</span>
        <span className={styles.title}>{title}</span>
        {description != null ? <span className={styles.description}>{description}</span> : null}
      </div>
    </div>
  )
}
