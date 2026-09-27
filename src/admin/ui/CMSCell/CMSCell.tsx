'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { Checkbox } from '../Checkbox'
import { Icon } from '../icons'
import { RowOpen } from '../RowOpen'
import { Tooltip } from '../Tooltip'
import { cx } from '../utils/cx'
import styles from './CMSCell.module.css'

export type CMSCellType = 'header' | 'handle' | 'text' | 'title' | 'status' | 'image'

/** Largeurs fixes par type de colonne (Figma « CMS cell » 468:2013). */
export const CMS_COLUMN_WIDTHS = { handle: 64, text: 180, title: 240, status: 120, image: 96 } as const

// La ligne dit à ses cellules si elle est l'en-tête (rôle columnheader, 40 px, pas de poignée).
const RowContext = createContext<{ header: boolean }>({ header: false })

// ─── Tableau et ligne ────────────────────────────────────────────────────────

export type CMSTableProps = HTMLAttributes<HTMLDivElement> & {
  /** Nom du tableau (« Blog posts »). */
  'aria-label'?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * Tableau façon tableur (C3) : conteneur bg/elevated, rayon 12, défilement horizontal (pad bas 14 pour la
 * barre) ; la grille garde sa largeur (somme des colonnes). Sémantique table / row / cell par défaut ; la
 * feature qui ajoute la navigation aux flèches passe role="grid" (et gère le focus des cellules).
 */
export function CMSTable({ className, children, role = 'table', ref, ...rest }: CMSTableProps) {
  return (
    <div className={cx(styles.scroller, className)}>
      <div ref={ref} role={role} className={styles.grid} {...rest}>
        {children}
      </div>
    </div>
  )
}

export type CMSRowProps = HTMLAttributes<HTMLDivElement> & {
  /** Ligne d'en-tête : 40 px, trait bas border/default, pas de survol. */
  header?: boolean
  /** Ligne cochée. */
  selected?: boolean
  /** Bouton « ouvrir dans le panneau » (Row open) au survol / focus de la ligne. */
  onOpen?: () => void
  /** Nom accessible du bouton open (« Open How to cut dock wait times »). */
  openLabel?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * Ligne : trait bas border/subtle ; survol bg/ghost-hover + Row open au bord droit (précédé d'une cellule de
 * remplissage extensible, `[data-row-filler]`, pour les tableaux plus étroits que leur conteneur).
 */
export function CMSRow({ header, selected, onOpen, openLabel, className, children, ref, ...rest }: CMSRowProps) {
  return (
    <div
      ref={ref}
      role="row"
      data-row={header ? undefined : ''}
      data-header={header || undefined}
      data-selected={selected || undefined}
      className={cx(styles.row, className)}
      {...rest}
    >
      <RowContext.Provider value={{ header: !!header }}>{children}</RowContext.Provider>
      {onOpen && !header ? (
        <>
          {/* Colonnes plus étroites que le tableau (FAQ) : le remplissage pousse Row open au bord droit ;
              tableau plus large : il ne prend aucune place et Row open reste collé (sticky) au bord visible. */}
          <span className={styles.filler} data-row-filler="" aria-hidden="true" />
          <RowOpen onOpen={onOpen} label={openLabel} />
        </>
      ) : null}
    </div>
  )
}

// ─── Cellule ─────────────────────────────────────────────────────────────────

/** Props du bouton de la poignée focalisable (type=handle). */
export type GripProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & {
  [data: `data-${string}`]: string | number | boolean | undefined
  ref?: Ref<HTMLButtonElement>
}

export type CMSCellProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  type?: CMSCellType
  /** Largeur (défaut : CMS_COLUMN_WIDTHS du type ; en-tête : 180). */
  width?: number
  /** Contenu : libellé (header, text, title), <StatusSelect> (status). */
  children?: ReactNode
  /** type=image : vignette 56 × 28 (rayon 6). */
  src?: string
  /** type=handle : case de la ligne (en-tête : tout sélectionner). */
  checked?: boolean
  indeterminate?: boolean
  onCheckedChange?: (checked: boolean) => void
  /** Nom accessible de la case (« Select How to cut dock wait times », « Select all »). */
  checkboxLabel?: string
  /** type=handle : poignée ⠿ (défaut : oui dans le corps, non dans la ligne d'en-tête). */
  grip?: boolean
  /**
   * type=handle : poignée FOCALISABLE (réordonnancement) — props du `<button>` (pointeur, clavier, `aria-pressed`,
   * `aria-disabled`, `aria-describedby`, `data-*`). Absent : poignée décorative (`aria-hidden`).
   */
  gripProps?: GripProps
  /** Nom accessible de la poignée focalisable (« Reorder How to cut dock wait times » ; défaut « Reorder »). */
  gripLabel?: string
  /** Infobulle de la poignée focalisable (« Drag to reorder »). */
  gripTooltip?: ReactNode
  /** Édition sur place (Figma state=editing) : contour interactive/primary, champ bg/input. */
  editing?: boolean
  /** Valeur de départ du champ (défaut : `children` si c'est un texte). */
  editValue?: string
  /** Entrée ou perte du focus : valide. */
  onCommit?: (value: string) => void
  /** Échap : annule. */
  onCancel?: () => void
  /** Demande d'édition : clic, Entrée ou F2 sur la cellule (types text et title). */
  onEditRequest?: () => void
  /** Nom accessible du champ en édition (défaut : « Edit »). */
  inputLabel?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * Cellule du tableau CMS (Figma « CMS cell » 468:2013) : largeur fixe par type (texte 180, titre 240,
 * statut 120, vignette 96, poignée 64), trait droit border/subtle, texte coupé « … ». En-tête 40 px
 * (Body Small, text/tertiary), corps 44 px. state=editing : champ dans la cellule (Entrée / clic ailleurs
 * valide, Échap annule).
 */
export function CMSCell({
  type = 'text',
  width,
  children,
  src,
  checked,
  indeterminate,
  onCheckedChange,
  checkboxLabel,
  grip,
  gripProps,
  gripLabel = 'Reorder',
  gripTooltip,
  editing,
  editValue,
  onCommit,
  onCancel,
  onEditRequest,
  inputLabel = 'Edit',
  className,
  style,
  onClick,
  onKeyDown,
  ref,
  ...rest
}: CMSCellProps) {
  const row = useContext(RowContext)
  const isHeader = type === 'header'
  const editable = type === 'text' || type === 'title'
  const w = width ?? (isHeader ? CMS_COLUMN_WIDTHS.text : CMS_COLUMN_WIDTHS[type as keyof typeof CMS_COLUMN_WIDTHS])
  const inHeaderRow = isHeader || row.header

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || editing || !editable || !onEditRequest) return
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault()
      onEditRequest()
    }
  }

  return (
    <div
      ref={ref}
      role={inHeaderRow ? 'columnheader' : 'cell'}
      data-type={type}
      data-editing={editing || undefined}
      className={cx(styles.cell, styles[type], editing && styles.editing, className)}
      style={{ width: w, ...style }}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented && editable && !editing) onEditRequest?.()
      }}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {type === 'handle' ? (
        <>
          {!(grip ?? !row.header) ? null : gripProps ? (
            <GripButton label={gripLabel} tooltip={gripTooltip} {...gripProps} />
          ) : (
            <Icon name="grip" size={12} className={styles.grip} />
          )}
          <Checkbox
            aria-label={checkboxLabel ?? 'Select row'}
            checked={checked ?? false}
            indeterminate={indeterminate}
            onCheckedChange={onCheckedChange}
          />
        </>
      ) : type === 'image' ? (
        <span className={styles.thumb}>{src ? <img src={src} alt="" className={styles.thumbImage} /> : null}</span>
      ) : type === 'status' ? (
        children
      ) : editing ? (
        <CellInput
          initial={editValue ?? (typeof children === 'string' ? children : '')}
          label={inputLabel}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      ) : (
        <span className={styles.label}>{children}</span>
      )}
    </div>
  )
}

/** Poignée focalisable : bouton 12 × 24 (zone de pointeur de la poignée), focus visible, infobulle facultative. */
function GripButton({ label, tooltip, className, ...props }: GripProps & { label: string; tooltip?: ReactNode }) {
  const button = (
    <button type="button" aria-label={label} className={cx(styles.gripButton, className)} {...props}>
      <Icon name="grip" size={12} />
    </button>
  )
  return tooltip ? (
    <Tooltip label={tooltip} placement="right">
      {button}
    </Tooltip>
  ) : (
    button
  )
}

function CellInput({
  initial,
  label,
  onCommit,
  onCancel,
}: {
  initial: string
  label: string
  onCommit?: (value: string) => void
  onCancel?: () => void
}) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const done = useRef(false)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    // Curseur en fin de texte (Figma : caret après le texte).
    input.setSelectionRange(input.value.length, input.value.length)
  }, [])

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    if (commit) onCommit?.(value)
    else onCancel?.()
  }

  return (
    <input
      ref={inputRef}
      aria-label={label}
      className={styles.input}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(true)
        } else if (event.key === 'Escape') {
          // Échap annule l'édition sans fermer une fenêtre parente.
          event.preventDefault()
          event.stopPropagation()
          finish(false)
        }
      }}
      onBlur={() => finish(true)}
    />
  )
}
