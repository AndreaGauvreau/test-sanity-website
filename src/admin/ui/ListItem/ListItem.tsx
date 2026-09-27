import type { HTMLAttributes, MouseEventHandler, ReactNode, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { cx } from '../utils/cx'
import styles from './ListItem.module.css'

export type ListItemProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title' | 'onClick'> & {
  /** Titre (Body, text/primary). */
  title: ReactNode
  /** Sous-titre (Body Small, text/tertiary). */
  subtitle?: ReactNode
  /** Méta à droite (Body Small, text/muted) : rôle, date… */
  meta?: ReactNode
  /** Tag exposé (Figma « Show tag ») : `<Tag>`. */
  tag?: ReactNode
  /** leading=avatar : un `<Avatar size={28}>`. Prioritaire sur `icon`. */
  avatar?: ReactNode
  /** leading=icon : icône 16 dans un carré 28 bg/subtle. */
  icon?: IconName
  /**
   * Écart titre / sous-titre en px : 0 (défaut, composant Figma « List item ») ou 2 (listes de l'écran E1,
   * « Pending changes » / « Versions »).
   */
  textGap?: 0 | 2
  /** Action à droite (Figma « Show action ») : `<IconButton icon="more">`, un `<Menu>`… */
  action?: ReactNode
  /** Rend la ligne entière cliquable (lien étiré sur le titre ; l'action reste au-dessus). */
  href?: string
  onClick?: MouseEventHandler<HTMLElement>
  ref?: Ref<HTMLDivElement>
}

/**
 * Ligne de liste (Figma « List item » 337:1064) : 560 px dans Figma, fluide ici. H gap 12, pad 8 8 8 12,
 * radius/md ; survol bg/subtle. Avec `href` ou `onClick`, le titre devient un lien / bouton dont la zone
 * cliquable couvre la ligne (motif « stretched link »), sans imbriquer l'action dans un élément interactif.
 */
export function ListItem({
  title,
  subtitle,
  meta,
  tag,
  avatar,
  icon,
  action,
  href,
  onClick,
  textGap = 0,
  className,
  ref,
  ...rest
}: ListItemProps) {
  const interactive = href != null || onClick != null
  const titleNode = href ? (
    <a href={href} className={styles.hit} onClick={onClick}>
      {title}
    </a>
  ) : onClick ? (
    <button type="button" className={styles.hit} onClick={onClick}>
      {title}
    </button>
  ) : (
    title
  )
  return (
    <div ref={ref} data-interactive={interactive || undefined} className={cx(styles.item, className)} {...rest}>
      {avatar ? (
        <span className={styles.leading}>{avatar}</span>
      ) : icon ? (
        <span className={styles.iconWrap}>
          <Icon name={icon} size={16} set={18} />
        </span>
      ) : null}
      <div className={styles.text} data-text-gap={textGap || undefined}>
        <div className={styles.title}>{titleNode}</div>
        {subtitle != null ? <div className={styles.subtitle}>{subtitle}</div> : null}
      </div>
      {tag}
      {meta != null ? <span className={styles.meta}>{meta}</span> : null}
      {action ? <span className={styles.action}>{action}</span> : null}
    </div>
  )
}
