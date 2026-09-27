'use client'

import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { buttonClassName, ButtonContent } from '../Button'
import { Icon, type IconName } from '../icons'
import { IconButton } from '../IconButton'
import { cx } from '../utils/cx'
import styles from './Toast.module.css'

export type ToastType = 'success' | 'error' | 'info' | 'loading'

export type ToastAction = {
  label: string
  /** Lien : rendu en <a> (target _blank + icône external si `external`). */
  href?: string
  external?: boolean
  onClick?: () => void
}

const ICONS: Record<ToastType, IconName> = { success: 'success', error: 'error', info: 'info', loading: 'loader' }

export type ToastProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  type?: ToastType
  children: ReactNode
  action?: ToastAction
  /** Bouton ✕ (Icon button ghost xsmall). */
  onDismiss?: () => void
  ref?: Ref<HTMLDivElement>
}

/**
 * Notification (Figma « Toast » 323:412) : bg/elevated, border/strong, radius/md, Elevation/Popover,
 * pad 8 8 8 12, gap 10 ; icône 16 selon le type, message Body, action ghost small, ✕ xsmall.
 * Affichage seul : la pile, la durée et l'annonce sont gérées par <ToastProvider>.
 */
export function Toast({ type = 'success', children, action, onDismiss, className, ref, ...rest }: ToastProps) {
  return (
    <div ref={ref} data-type={type} className={cx(styles.toast, styles[type], className)} {...rest}>
      <Icon name={ICONS[type]} size={16} set={18} spin={type === 'loading'} className={styles.icon} />
      <div className={styles.message}>{children}</div>
      {action ? (
        action.href ? (
          <a
            href={action.href}
            target={action.external ? '_blank' : undefined}
            rel={action.external ? 'noopener noreferrer' : undefined}
            className={buttonClassName({ variant: 'ghost', size: 'small' })}
            onClick={action.onClick}
          >
            <ButtonContent size="small" iconRight={action.external ? 'external' : undefined}>
              {action.label}
            </ButtonContent>
            {action.external ? <span className="kz-visually-hidden"> (opens in a new tab)</span> : null}
          </a>
        ) : (
          <button type="button" className={buttonClassName({ variant: 'ghost', size: 'small' })} onClick={action.onClick}>
            <ButtonContent size="small">{action.label}</ButtonContent>
          </button>
        )
      ) : null}
      {onDismiss ? <IconButton icon="close" label="Dismiss notification" size="xsmall" tooltip={false} onClick={onDismiss} /> : null}
    </div>
  )
}
