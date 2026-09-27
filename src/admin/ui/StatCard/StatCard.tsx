import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { cx } from '../utils/cx'
import styles from './StatCard.module.css'

export type StatCardProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Libellé (Body Small, text/tertiary) : « Total cost this month ». */
  label: ReactNode
  /** Chiffre clé (Heading 2) : « $4.80 », « Ready ». */
  value: ReactNode
  /** Aide sous le chiffre (Body Small, text/muted). */
  hint?: ReactNode
  /** Icône 16 avant le libellé (Figma « Show icon » + « Icon »). */
  icon?: IconName
  ref?: Ref<HTMLDivElement>
}

/**
 * Chiffre clé (Figma « Stat card » 338:1177) : 260 px dans Figma, fluide ici (les cartes remplissent
 * leur rangée, B1). bg/elevated, border/default, radius/lg, pad 16, gap 8. Composant pur.
 */
export function StatCard({ label, value, hint, icon, className, ref, ...rest }: StatCardProps) {
  return (
    <div ref={ref} className={cx(styles.card, className)} {...rest}>
      <div className={styles.labelRow}>
        {icon ? <Icon name={icon} size={16} set={18} /> : null}
        <span className={styles.label}>{label}</span>
      </div>
      <div className={styles.value}>{value}</div>
      {hint != null ? <div className={styles.hint}>{hint}</div> : null}
    </div>
  )
}
