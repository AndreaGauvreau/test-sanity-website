'use client'

import type { ButtonHTMLAttributes, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { Menu, MenuItem } from '../Menu'
import type { Placement } from '../Popover'
import { cx } from '../utils/cx'
import styles from './StatusSelect.module.css'

/** Statut d'un élément CMS : live = publié sans brouillon ; draft = jamais publié ; changed = publié + brouillon différent. */
export type CmsStatus = 'live' | 'draft' | 'changed'

export type StatusAction = {
  id: string
  label: string
  icon?: IconName
  danger?: boolean
  disabled?: boolean
}

const LABELS: Record<CmsStatus, string> = { live: 'Live', draft: 'Draft', changed: 'Changed' }

/** Actions proposées par le Figma (C3) selon l'état. */
export const DEFAULT_STATUS_ACTIONS: Record<CmsStatus, StatusAction[]> = {
  live: [{ id: 'unpublish', label: 'Unpublish', icon: 'eye-off' }],
  draft: [{ id: 'delete-draft', label: 'Delete draft', icon: 'trash', danger: true }],
  changed: [{ id: 'discard', label: 'Discard changes', icon: 'history', danger: true }],
}

export type StatusSelectProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onSelect'> & {
  status: CmsStatus
  /** Libellé affiché (défaut Live / Draft / Changed). */
  label?: string
  /** Actions du menu (défaut : DEFAULT_STATUS_ACTIONS[status]). Vide : simple pastille, sans chevron. */
  actions?: readonly StatusAction[]
  onAction?: (id: string) => void
  placement?: Placement
  ref?: Ref<HTMLButtonElement>
}

/**
 * Statut modifiable dans le tableau CMS (Figma « Status select » 468:1971) : pastille teintée (pad 2 6 2 8,
 * gap 4, rayon 5, Body Small) + chevron 12, qui ouvre un menu d'actions selon l'état (Changed → Discard
 * changes ; Live → Unpublish ; Draft → Delete draft). Bouton de menu APG (voir <Menu>).
 */
export function StatusSelect({
  status,
  label,
  actions,
  onAction,
  placement = 'bottom-start',
  className,
  disabled,
  ref,
  ...rest
}: StatusSelectProps) {
  const text = label ?? LABELS[status]
  const list = actions ?? DEFAULT_STATUS_ACTIONS[status]

  if (list.length === 0) {
    return (
      <span data-status={status} className={cx(styles.pill, styles[status], styles.static, className)}>
        <span className={styles.label}>{text}</span>
      </span>
    )
  }

  return (
    <Menu
      placement={placement}
      width={180}
      aria-label={`${text} status`}
      trigger={
        <button
          ref={ref}
          type="button"
          data-status={status}
          disabled={disabled}
          aria-label={`Status: ${text}`}
          className={cx(styles.pill, styles[status], className)}
          {...rest}
        >
          <span className={styles.label}>{text}</span>
          <Icon name="chevron-down" size={12} className={styles.chevron} />
        </button>
      }
    >
      {list.map((action) => (
        <MenuItem
          key={action.id}
          icon={action.icon}
          danger={action.danger}
          disabled={action.disabled}
          onSelect={() => onAction?.(action.id)}
        >
          {action.label}
        </MenuItem>
      ))}
    </Menu>
  )
}
