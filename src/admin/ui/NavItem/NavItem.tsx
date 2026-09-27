import type { ComponentPropsWithoutRef, ElementType, ReactNode, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { cx } from '../utils/cx'
import styles from './NavItem.module.css'

export type NavItemProps = Omit<ComponentPropsWithoutRef<'a'>, 'children'> & {
  label: ReactNode
  /** Icône 18 (Figma « Show icon » + « Icon »). */
  icon?: IconName
  /** Compteur à droite (Body Small, text/muted) : nombre d'éléments d'une collection. */
  count?: ReactNode
  /** Tag exposé : `<Tag tone="info">KUARTZ</Tag>`. */
  tag?: ReactNode
  /** Page courante : état active (bg/input-hover) + aria-current="page". */
  active?: boolean
  /** Élément rendu : `a` avec href, `button` sinon ; ou un composant de lien (next/link) passé par l'appelant. */
  as?: ElementType
  /** Niveau : 1 = page article sous sa page listing (retrait 38 px). */
  depth?: 0 | 1
  /** Page qui se déplie (Figma « Show chevron ») : chevron dans la marge de gauche, bouton séparé. */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  /** Nom accessible du chevron (défaut « Show <label> pages » / « Hide … » si label est un texte). */
  expandLabel?: string
  /** Classe de l'enveloppe (le reste des props va à l'élément cliquable). */
  wrapperClassName?: string
  ref?: Ref<HTMLElement>
}

/**
 * Entrée de sidebar (Figma « Nav item » 332:431) : 224 × 32 (fluide ici), pad 0 8 0 16, gap 8, radius/md,
 * Body. États : hover (bg/subtle, texte et icônes clairs), active (bg/input-hover), focus-visible. Chevron
 * optionnel (x 3, 10 px) pour une page listing qui se déplie. Composant pur (pas de hook).
 */
export function NavItem({
  label,
  icon,
  count,
  tag,
  active,
  as,
  depth = 0,
  expanded,
  onExpandedChange,
  expandLabel,
  className,
  wrapperClassName,
  href,
  ref,
  ...rest
}: NavItemProps) {
  const Comp: ElementType = as ?? (href != null ? 'a' : 'button')
  const expandable = expanded !== undefined
  const text = typeof label === 'string' ? label : 'section'
  const elementProps = Comp === 'button' ? { type: 'button' as const } : { href }
  return (
    <div data-depth={depth} className={cx(styles.wrap, wrapperClassName)}>
      {expandable ? (
        <button
          type="button"
          className={styles.chevron}
          aria-expanded={expanded}
          aria-label={expandLabel ?? `${expanded ? 'Hide' : 'Show'} ${text} pages`}
          data-expanded={expanded || undefined}
          onClick={() => onExpandedChange?.(!expanded)}
        >
          <Icon name="chevron-down" size={10} set={12} />
        </button>
      ) : null}
      <Comp
        ref={ref}
        {...elementProps}
        {...rest}
        aria-current={active ? 'page' : undefined}
        data-active={active || undefined}
        className={cx(styles.item, className)}
      >
        {icon ? <Icon name={icon} size={18} className={styles.icon} /> : null}
        <span className={styles.label}>{label}</span>
        {count != null ? <span className={styles.count}>{count}</span> : null}
        {tag}
      </Comp>
    </div>
  )
}
