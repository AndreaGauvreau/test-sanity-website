import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/admin/ui'
import styles from './Step.module.css'

export type StepKindView = 'log' | 'change' | 'done' | 'validated' | 'stopped' | 'error'

const ICONS: Partial<Record<StepKindView, { name: IconName; color: string }>> = {
  done: { name: 'check', color: 'success' },
  validated: { name: 'success', color: 'success' },
  stopped: { name: 'stop', color: 'default' },
  error: { name: 'error', color: 'danger' },
}

/**
 * Étape du fil (Figma « Step ») : log (puce grise), change (plus clair), done ✓, validated, stopped ■, error ✕.
 * `trailing` : consommation d'une demande repliée (« Done · 24 s » + tokens et coût). Pur.
 */
export function Step({
  kind,
  children,
  trailing,
  label,
}: {
  kind: StepKindView
  children: ReactNode
  trailing?: ReactNode
  /** Nom accessible quand le texte visible contient des symboles (« Checks: contrast ✓ … »). */
  label?: string
}) {
  const icon = ICONS[kind]
  return (
    <div className={styles.step} data-kind={kind} data-icon-color={icon?.color}>
      {icon ? (
        <Icon name={icon.name} size={12} className={styles.icon} />
      ) : (
        <span className={styles.bulletWrap} aria-hidden="true">
          <span className={styles.bullet} />
        </span>
      )}
      <span className={styles.text}>
        {label ? (
          <>
            <span aria-hidden="true">{children}</span>
            <span className="kz-visually-hidden">{label}</span>
          </>
        ) : (
          children
        )}
      </span>
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
    </div>
  )
}
