import type { HTMLAttributes, ReactNode, Ref, TdHTMLAttributes, ThHTMLAttributes, TableHTMLAttributes } from 'react'
import { Icon, type IconName } from '../icons'
import { cx } from '../utils/cx'
import styles from './TableCell.module.css'

export type TableCellType = 'text' | 'title' | 'tag' | 'user' | 'actions' | 'model' | 'checkbox'
export type TableSort = 'ascending' | 'descending' | 'none'

export type TableProps = TableHTMLAttributes<HTMLTableElement> & { ref?: Ref<HTMLTableElement> }

/**
 * Tableau simple (listes B3, B4, E2…) : colonnes de largeur fixe via `width` sur les en-têtes,
 * lignes de 44 px, en-tête de 32 px. Pour le tableau façon tableur du CMS, voir CMSCell.
 */
export function Table({ className, ref, ...rest }: TableProps) {
  return <table ref={ref} className={cx(styles.table, className)} {...rest} />
}

export type TableRowProps = HTMLAttributes<HTMLTableRowElement> & {
  /** Ligne sélectionnée (case cochée) : fond bg/tint/info (Figma state=selected). */
  selected?: boolean
  /** Survol bg/subtle (Figma state=hover) ; défaut true pour les lignes du corps. */
  hover?: boolean
  ref?: Ref<HTMLTableRowElement>
}

export function TableRow({ selected, hover = true, className, ref, ...rest }: TableRowProps) {
  return (
    <tr
      ref={ref}
      data-selected={selected || undefined}
      data-hover={hover || undefined}
      className={cx(styles.row, className)}
      {...rest}
    />
  )
}

export type TableHeaderCellProps = Omit<ThHTMLAttributes<HTMLTableCellElement>, 'children' | 'align'> & {
  children?: ReactNode
  /** Largeur fixe de la colonne (px ou valeur CSS). */
  width?: number | string
  /** Tri de la colonne (Figma « Show sort ») : l'en-tête devient un bouton, `aria-sort` sur la cellule. */
  sort?: TableSort
  onSort?: () => void
  align?: 'start' | 'end'
  ref?: Ref<HTMLTableCellElement>
}

/** En-tête (Figma « Table cell » type=header) : 32 px, pad 0 12, Body Small text/muted, trait bas border/subtle. */
export function TableHeaderCell({ children, width, sort, onSort, align = 'start', className, style, ref, ...rest }: TableHeaderCellProps) {
  const sortable = sort !== undefined || onSort !== undefined
  const content = (
    <>
      <span className={styles.headerLabel}>{children}</span>
      {sortable ? (
        <Icon
          name="chevron-down"
          size={12}
          className={styles.sort}
          data-sort={sort ?? 'none'}
        />
      ) : null}
    </>
  )
  return (
    <th
      ref={ref}
      scope="col"
      aria-sort={sortable ? (sort ?? 'none') : undefined}
      data-align={align}
      className={cx(styles.cell, styles.header, className)}
      style={{ width, ...style }}
      {...rest}
    >
      {onSort ? (
        <button type="button" className={styles.sortButton} onClick={onSort}>
          {content}
        </button>
      ) : (
        <span className={styles.inner}>{content}</span>
      )}
    </th>
  )
}

export type TableCellProps = Omit<TdHTMLAttributes<HTMLTableCellElement>, 'children'> & {
  /** Contenu et style (Figma « type ») : text, title, tag, user, actions, model, checkbox. */
  type?: TableCellType
  children?: ReactNode
  /** type=title : vignette (URL) dans le carré 28 ; sinon l'icône. */
  thumbnail?: string
  /** type=title : icône du carré 28 (défaut « image »). */
  icon?: IconName
  /** type=user : un `<Avatar size={20}>`. */
  avatar?: ReactNode
  ref?: Ref<HTMLTableCellElement>
}

/**
 * Cellule du corps (Figma « Table cell » 337:1191) : 44 px, pad 0 12, gap 8, trait bas border/subtle.
 * Le survol et la sélection viennent de la ligne (<TableRow>) : toute la rangée change de fond.
 */
export function TableCell({ type = 'text', children, thumbnail, icon = 'image', avatar, className, ref, ...rest }: TableCellProps) {
  return (
    <td ref={ref} data-type={type} className={cx(styles.cell, styles.body, styles[type], className)} {...rest}>
      <span className={styles.inner}>
        {type === 'title' ? (
          <span className={styles.thumb} aria-hidden="true">
            {thumbnail ? <img src={thumbnail} alt="" className={styles.thumbImage} /> : <Icon name={icon} size={12} />}
          </span>
        ) : null}
        {type === 'user' ? avatar : null}
        {type === 'model' ? <Icon name="claude" size={12} className={styles.mark} /> : null}
        {type === 'text' || type === 'title' || type === 'user' || type === 'model' ? (
          <span className={styles.label}>{children}</span>
        ) : (
          children
        )}
      </span>
    </td>
  )
}
