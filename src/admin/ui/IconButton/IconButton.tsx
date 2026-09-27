'use client'

import type { ButtonHTMLAttributes, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import type { Placement } from '../Popover'
import { Tooltip } from '../Tooltip'
import { cx } from '../utils/cx'
import styles from './IconButton.module.css'

export type IconButtonStyle = 'ghost' | 'secondary' | 'primary'
export type IconButtonSize = 'small' | 'xsmall'

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: IconName
  /** Nom accessible (aria-label), repris par l'infobulle. Obligatoire : un bouton à icône seule n'a pas de texte. */
  label: string
  /** Propriété « style » du Figma : ghost (défaut), secondary, primary. */
  variant?: IconButtonStyle
  /** small 28 px (icône 16) ; xsmall 20 px (icône 12). */
  size?: IconButtonSize
  /** Bouton bascule : aria-pressed + état « active » du Figma (fond input-hover ; contour strong en secondary). */
  pressed?: boolean
  /** Infobulle avec le libellé (défaut true, comme le demande la fiche Figma). */
  tooltip?: boolean
  /** Raccourci affiché dans l'infobulle. */
  shortcut?: string
  tooltipPlacement?: Placement
  /** Loader animé à la place de l'icône. */
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

/** Bouton à icône seule (Figma « Icon button » 321:393) : 3 styles × 2 tailles, états hover / active / disabled / focus-visible. */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'small',
  pressed,
  tooltip = true,
  shortcut,
  tooltipPlacement,
  loading,
  className,
  type = 'button',
  ref,
  ...rest
}: IconButtonProps) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      data-pressed={pressed || undefined}
      className={cx(styles.button, styles[variant], styles[size], className)}
      {...rest}
    >
      <Icon name={loading ? 'loader' : icon} size={size === 'xsmall' ? 12 : 16} set={18} spin={loading} />
    </button>
  )
  if (!tooltip || rest.disabled) return button
  return (
    <Tooltip label={label} shortcut={shortcut} placement={tooltipPlacement}>
      {button}
    </Tooltip>
  )
}
