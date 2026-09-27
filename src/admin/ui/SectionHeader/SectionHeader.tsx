import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from '../utils/cx'
import styles from './SectionHeader.module.css'

export type SectionHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  /** Titre (Heading 4). */
  title: ReactNode
  /** Description (Body Small, text/tertiary). */
  description?: ReactNode
  /** Action à droite (Figma : Button secondary small « + Add »). */
  action?: ReactNode
  /** Niveau du titre (défaut 2 : sous le h1 du Page header). */
  headingLevel?: 2 | 3 | 4
  /** Id du titre (pour aria-labelledby de la section). */
  titleId?: string
  ref?: Ref<HTMLDivElement>
}

/** Titre de section (Figma « Section header » 333:1433) : H gap 16 ; texte V gap 2 ; action alignée en haut. Composant pur. */
export function SectionHeader({ title, description, action, headingLevel = 2, titleId, className, ref, ...rest }: SectionHeaderProps) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4'
  return (
    <div ref={ref} className={cx(styles.header, className)} {...rest}>
      <div className={styles.text}>
        <Heading id={titleId} className={styles.title}>
          {title}
        </Heading>
        {description != null ? <p className={styles.description}>{description}</p> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
