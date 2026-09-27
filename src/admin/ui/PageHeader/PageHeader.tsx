import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from '../utils/cx'
import styles from './PageHeader.module.css'

export type PageHeaderProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'title'> & {
  /** Titre de l'écran (Heading 3, h1). */
  title: ReactNode
  /** Méta à côté du titre (Body, text/muted) : « 48 files · 312 MB ». */
  meta?: ReactNode
  /** Description sous le titre (Body Small, text/tertiary). */
  description?: ReactNode
  /** Boutons à droite (gap 12) : « Open in AI editor », « Preview ↗ ». */
  actions?: ReactNode
  /** Icônes d'outils à droite (gap 4) : +, tri, filtre, recherche. */
  tools?: ReactNode
  /** Nom de la barre d'outils (défaut « Page tools »). */
  toolsLabel?: string
  /** Onglets sous l'en-tête (`<Tabs>`), à 20 px. */
  tabs?: ReactNode
  /** Niveau du titre (défaut 1). */
  headingLevel?: 1 | 2
  ref?: Ref<HTMLElement>
}

/**
 * En-tête d'écran (Figma « Page header » 333:1416) : titre Heading 3 + méta alignés sur la ligne de base
 * (gap 10), description optionnelle (gap 4) ; actions et outils à droite, centrés sur la ligne (C1, C3) ;
 * onglets dessous (gap 20, C1 / E1). Composant pur.
 */
export function PageHeader({
  title,
  meta,
  description,
  actions,
  tools,
  toolsLabel = 'Page tools',
  tabs,
  headingLevel = 1,
  className,
  ref,
  ...rest
}: PageHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <header ref={ref} className={cx(styles.header, className)} {...rest}>
      <div className={styles.row}>
        <div className={styles.text}>
          <div className={styles.titleRow}>
            <Heading className={styles.title}>{title}</Heading>
            {meta != null ? <span className={styles.meta}>{meta}</span> : null}
          </div>
          {description != null ? <p className={styles.description}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
        {tools ? (
          <div role="toolbar" aria-label={toolsLabel} className={styles.tools}>
            {tools}
          </div>
        ) : null}
      </div>
      {tabs}
    </header>
  )
}
