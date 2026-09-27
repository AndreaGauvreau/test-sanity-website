import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { Icon } from '../icons'
import { cx } from '../utils/cx'
import styles from './SearchPreview.module.css'

export type SearchPreviewProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  /** Nom du site : « Conduit ». */
  siteName: ReactNode
  /** URL affichée : « https://conduit.com ». */
  url: ReactNode
  /** Titre (text/link, Body Large, une ligne « … » comme Google). */
  title: ReactNode
  /** Description (Body Small, deux lignes au plus). */
  description?: ReactNode
  /** Favicon (24 px, rond). Absent : globe. */
  favicon?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * Aperçu Google (Figma « Search preview » 338:1231) : 560 px dans Figma, fluide ici (max 560) ; bg/elevated,
 * border/default, radius/lg, pad 16, gap 4. Illustration : non interactive. Composant pur.
 */
export function SearchPreview({ siteName, url, title, description, favicon, className, ref, ...rest }: SearchPreviewProps) {
  return (
    <div ref={ref} className={cx(styles.card, className)} {...rest}>
      <div className={styles.site}>
        <span className={styles.favicon}>
          {favicon ? <img src={favicon} alt="" className={styles.faviconImage} /> : <Icon name="globe" size={12} />}
        </span>
        <span className={styles.siteText}>
          <span className={styles.siteName}>{siteName}</span>
          <span className={styles.url}>{url}</span>
        </span>
      </div>
      <div className={styles.title}>{title}</div>
      {description != null ? <div className={styles.description}>{description}</div> : null}
    </div>
  )
}
