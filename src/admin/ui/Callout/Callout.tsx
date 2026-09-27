import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { cx } from '../utils/cx'
import styles from './Callout.module.css'

export type CalloutTone = 'neutral' | 'info' | 'success' | 'warning' | 'error'

const ICONS: Record<CalloutTone, IconName> = {
  neutral: 'info',
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
}

export type CalloutProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  tone?: CalloutTone
  /** Texte de la note (Body Small, text/secondary). */
  children: ReactNode
  /** Action sous le texte : en général <Button variant="ghost" size="small">. */
  action?: ReactNode
  /** Remplace l'icône du ton. */
  icon?: IconName
  ref?: Ref<HTMLDivElement>
}

/**
 * Note contextuelle (Figma « Callout » 323:316) : fond teinté du ton, icône 16, texte Body Small, action facultative.
 * Statique par défaut ; passer role="status" ou role="alert" quand elle apparaît en réponse à une action.
 */
export function Callout({ tone = 'neutral', children, action, icon, className, ref, ...rest }: CalloutProps) {
  return (
    <div ref={ref} data-tone={tone} className={cx(styles.callout, styles[tone], className)} {...rest}>
      <Icon name={icon ?? ICONS[tone]} size={16} set={18} className={styles.icon} />
      <div className={styles.body}>
        <div className={styles.text}>{children}</div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  )
}
