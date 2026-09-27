import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from '../utils/cx'
import styles from './DetailRow.module.css'

export type DetailRowLayout = 'stacked' | 'inline'

export type DetailRowProps = Omit<HTMLAttributes<HTMLDListElement>, 'children'> & {
  /** Libellé (Label, text/primary) : « Published by ». */
  label: ReactNode
  /** Valeur (Body, text/tertiary) : « Andrea (Kuartz) ». */
  value: ReactNode
  /** stacked : libellé au-dessus (gap 2) ; inline : libellé 120 px à gauche (gap 12). */
  layout?: DetailRowLayout
  ref?: Ref<HTMLDListElement>
}

/**
 * Paire libellé / valeur (Figma « Detail row » 337:1498). Rendue en <dl> autonome (dt + dd) : une
 * suite de lignes reste une liste de descriptions valide. 360 px dans Figma, fluide ici. Composant pur.
 */
export function DetailRow({ label, value, layout = 'stacked', className, ref, ...rest }: DetailRowProps) {
  return (
    <dl ref={ref} data-layout={layout} className={cx(styles.row, styles[layout], className)} {...rest}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </dl>
  )
}
