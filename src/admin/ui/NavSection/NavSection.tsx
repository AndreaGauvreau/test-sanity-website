import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from '../utils/cx'
import styles from './NavSection.module.css'

export type NavSectionProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Titre de section (Label Small, text/muted, capitales) : « SITE SETTINGS ». */
  label: ReactNode
  /** Action à droite (Figma « Show action ») : `<IconButton size="xsmall" icon="plus" label="Add page">`. */
  action?: ReactNode
  /** Id du titre : à référencer par aria-labelledby sur la liste qui suit. */
  labelId?: string
  ref?: Ref<HTMLDivElement>
}

/** Titre de section de sidebar (Figma « Nav section » 332:443) : pad 16 8 4 8, gap 8. Composant pur. */
export function NavSection({ label, action, labelId, className, ref, ...rest }: NavSectionProps) {
  return (
    <div ref={ref} className={cx(styles.section, className)} {...rest}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      {action}
    </div>
  )
}
