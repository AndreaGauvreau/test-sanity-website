import type { Ref, SVGProps } from 'react'
import { cx } from '../utils/cx'
import { ICONS, type IconName } from './icons.generated'
import styles from './Icon.module.css'

export type IconSize = 10 | 12 | 16 | 18 | 20

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'ref'> & {
  name: IconName
  /**
   * Taille rendue en px. 18 (défaut) et 12 : tailles natives des jeux Figma ; 16, 20 (et 10) :
   * mise à l'échelle (Button medium, Input, Callout… posent l'icône 18 dans un cadre 16).
   */
  size?: IconSize
  /**
   * Jeu de tracés : 12 (trait 1,25, redessiné) ou 18 (trait 1,5). Par défaut 12 si size ≤ 12, sinon 18.
   * Certains composants Figma posent pourtant le jeu 18 réduit (Chip 12 px, Tag 10 px) : set={18}.
   */
  set?: 12 | 18
  /** Rend l'icône porteuse de sens : role="img" + <title>, sinon elle est décorative (aria-hidden). */
  title?: string
  /** Anime la rotation (icône « loader ») ; coupée par prefers-reduced-motion. */
  spin?: boolean
  ref?: Ref<SVGSVGElement>
}

/**
 * Icône duotone du Design System (Nucleo UI + custom + logos), en currentColor :
 * ton plein = currentColor, ton de fond = même couleur à 30 %. La couleur vient du parent
 * (`color: var(--k-icon-current)` + `data-icon-color`, voir tokens.css).
 */
export function Icon({ name, size = 18, set: setProp, title, spin, className, ref, ...rest }: IconProps) {
  const set = setProp ?? (size <= 12 ? 12 : 18)
  const paths = ICONS[name][set]
  const a11y = title ? { role: 'img' as const } : { 'aria-hidden': true as const }
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={`0 0 ${set} ${set}`}
      fill="none"
      focusable="false"
      data-icon={name}
      className={cx(styles.icon, spin && styles.spin, className)}
      {...a11y}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          opacity={p.opacity}
          fill={p.fill ? 'currentColor' : undefined}
          stroke={p.stroke ? 'currentColor' : undefined}
          strokeWidth={p.stroke}
          strokeLinecap={p.stroke ? 'round' : undefined}
          strokeLinejoin={p.stroke ? 'round' : undefined}
          fillRule={p.evenodd ? 'evenodd' : undefined}
          clipRule={p.evenodd ? 'evenodd' : undefined}
        />
      ))}
    </svg>
  )
}
