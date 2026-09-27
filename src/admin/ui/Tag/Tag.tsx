import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { cx } from '../utils/cx'
import styles from './Tag.module.css'

export type TagTone = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'inverse'

export type TagProps = HTMLAttributes<HTMLSpanElement> & {
  /** neutral ; info = KUARTZ (bleu) ; success = CLIENT, Ready ; warning = Draft ; error = Failed ; inverse = Live. */
  tone?: TagTone
  /** Point de couleur 6 px avant le libellé. */
  dot?: boolean
  /** Icône 10 px avant le libellé. */
  icon?: IconName
  children: ReactNode
  ref?: Ref<HTMLSpanElement>
}

/** Statut court (Figma « Tag » 142:38) : Label Small, pad 2 6, radius/sm, fond teinté selon le ton. */
export function Tag({ tone = 'neutral', dot, icon, className, children, ref, ...rest }: TagProps) {
  return (
    <span ref={ref} data-tone={tone} className={cx(styles.tag, styles[tone], className)} {...rest}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {icon ? <Icon name={icon} size={10} set={18} /> : null}
      <span className={styles.label}>{children}</span>
    </span>
  )
}
