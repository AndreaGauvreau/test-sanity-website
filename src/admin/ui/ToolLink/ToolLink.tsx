'use client'

import type { AnchorHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { Tooltip } from '../Tooltip'
import { cx } from '../utils/cx'
import styles from './ToolLink.module.css'

export type ToolLinksProps = HTMLAttributes<HTMLDivElement> & {
  /** Nom du groupe (« File actions »). */
  'aria-label'?: string
  children: ReactNode
  ref?: Ref<HTMLDivElement>
}

/**
 * Barre d'actions icônes collées (Figma « Tool links », Kuartz hub ; fiche média de C5) : contour border/default,
 * radius/md, boutons 36 × 36 séparés par un trait de 1 px. `role="group"` nommé par `aria-label`.
 */
export function ToolLinks({ className, children, ref, ...rest }: ToolLinksProps) {
  return (
    <div ref={ref} role="group" className={cx(styles.group, className)} {...rest}>
      {children}
    </div>
  )
}

export type ToolLinkProps = {
  /** Icône 16 (jeu 18). */
  icon: IconName
  /** Nom accessible et infobulle (« Replace », « Download »). */
  label: string
  /** Lien plutôt que bouton (téléchargement, page externe). */
  href?: string
  /** Avec `href` : attribut `download` (true ou nom de fichier). */
  download?: boolean | string
  target?: AnchorHTMLAttributes<HTMLAnchorElement>['target']
  rel?: string
  onClick?: (event: MouseEvent<HTMLElement>) => void
  /** Ton : default (icon/default → active au survol) ou danger (icon/error), Figma tone. */
  tone?: 'default' | 'danger'
  /** Désactivé : `aria-disabled` (reste focalisable pour lire la raison), clic ignoré, opacité 0.4. */
  disabled?: boolean
  /** Raison affichée dans l'infobulle quand l'action est désactivée (« Used in 2 places »). */
  disabledReason?: string
  /** Infobulle (défaut : oui). */
  tooltip?: boolean
  className?: string
  ref?: Ref<HTMLElement>
}

/**
 * Action icône d'une barre `ToolLinks` (Figma « Tool link » : 36 × 36, Icon 16, state default / hover / disabled,
 * tone default / danger). Bouton, ou lien avec `href` (un lien désactivé devient un bouton `aria-disabled`).
 */
export function ToolLink({
  icon,
  label,
  href,
  download,
  target,
  rel,
  onClick,
  tone = 'default',
  disabled,
  disabledReason,
  tooltip = true,
  className,
  ref,
}: ToolLinkProps) {
  const common = {
    'aria-label': label,
    'data-tone': tone,
    className: cx(styles.link, className),
  }
  const content = <Icon name={icon} size={16} set={18} />
  const node =
    href && !disabled ? (
      <a
        {...common}
        ref={ref as Ref<HTMLAnchorElement>}
        href={href}
        download={download === true ? '' : download || undefined}
        target={target}
        rel={rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)}
        onClick={onClick}
      >
        {content}
      </a>
    ) : (
      <button
        {...common}
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        aria-disabled={disabled || undefined}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault()
            return
          }
          onClick?.(event)
        }}
      >
        {content}
      </button>
    )
  if (!tooltip) return node
  return <Tooltip label={disabled && disabledReason ? disabledReason : label}>{node}</Tooltip>
}
