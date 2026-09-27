import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { cx } from '../utils/cx'
import styles from './EmptyState.module.css'

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  /** Icône 18 dans un cercle 40 (défaut « check »). */
  icon?: IconName
  /** Action : en général <Button variant="secondary" size="small">. */
  action?: ReactNode
  /** Niveau du titre (h2 par défaut ; le style reste Heading 4). */
  headingLevel?: 2 | 3 | 4
  ref?: Ref<HTMLDivElement>
}

/** État vide (Figma « Empty state » 323:432) : 360 px, centré, pad 32 24, gap 12. */
export function EmptyState({ title, description, icon = 'check', action, headingLevel = 2, className, ref, ...rest }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4'
  return (
    <div ref={ref} className={cx(styles.empty, className)} {...rest}>
      <div className={styles.iconWrap}>
        <Icon name={icon} size={18} />
      </div>
      <Heading className={styles.title}>{title}</Heading>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
