'use client'

import type { ReactNode, Ref } from 'react'
import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from 'motion/react'
import { Button } from '../Button'
import { Checkbox } from '../Checkbox'
import { Icon } from '../icons'
import { slideDown } from '../motion-presets'
import { cx } from '../utils/cx'
import styles from './SelectionBar.module.css'

/**
 * Variantes en mouvement réduit : MÊME état initial que `slideDown` (le serveur, qui ignore la préférence, rend
 * `opacity:0; translateY(-6px)` ; un autre état initial côté client = écart d'hydratation), transitions nulles.
 */
const slideDownReduced: Variants = {
  initial: slideDown.initial,
  animate: { opacity: 1, y: 0, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
}

export type SelectionBarProps = Omit<HTMLMotionProps<'div'>, 'children' | 'ref'> & {
  /** Nombre d'éléments sélectionnés. */
  selectedCount: number
  /** Nombre total d'éléments de la liste (case « tout » : cochée, partielle ou vide). */
  totalCount: number
  /** Case « tout » : true = tout sélectionner, false = tout désélectionner. */
  onSelectAll?: (checked: boolean) => void
  onClear: () => void
  /** Téléchargement (bouton ghost « Download »). */
  onDownload?: () => void
  /** Suppression : éléments supprimables parmi la sélection (les autres sont utilisés, donc verrouillés). */
  deletableCount?: number
  onDelete?: () => void
  /** Nom des éléments pour les textes (« files ») ; au singulier via `nounSingular`. */
  noun?: string
  nounSingular?: string
  /** Actions supplémentaires (après Delete). */
  children?: ReactNode
  ref?: Ref<HTMLDivElement>
}

/**
 * Barre de sélection (Figma « Selection bar » 336:1218) : bg/subtle, radius/md, pad 4 6 4 10, gap 10 ; case
 * « tout », « 3 selected », Download, Delete (secondary) et note de verrouillage, Clear à droite.
 * delete : allowed (tout est supprimable : « Delete 2 »), partial (« Delete 1 unused » + « 2 used files are
 * locked »), blocked (Delete désactivé + « Selected files are in use »). Apparition : slideDown (ease-out) ;
 * envelopper dans <AnimatePresence> pour la sortie. Le compte est annoncé (aria-live polite).
 */
export function SelectionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClear,
  onDownload,
  deletableCount,
  onDelete,
  noun = 'files',
  nounSingular = 'file',
  children,
  className,
  ref,
  ...rest
}: SelectionBarProps) {
  const variants = useReducedMotion() ? slideDownReduced : slideDown
  const all = totalCount > 0 && selectedCount >= totalCount
  const partialSelection = selectedCount > 0 && !all
  const deletable = deletableCount ?? selectedCount
  const locked = selectedCount - deletable
  const mode: 'allowed' | 'partial' | 'blocked' = deletable === 0 ? 'blocked' : locked > 0 ? 'partial' : 'allowed'
  const deleteLabel = mode === 'allowed' ? `Delete ${deletable}` : mode === 'partial' ? `Delete ${deletable} unused` : 'Delete'
  const lockNote =
    mode === 'partial'
      ? `${locked} used ${locked === 1 ? `${nounSingular} is` : `${noun} are`} locked`
      : mode === 'blocked'
        ? `Selected ${noun} are in use`
        : null

  return (
    <motion.div
      ref={ref}
      role="region"
      aria-label="Selection"
      data-delete={mode}
      className={cx(styles.bar, className)}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      {...rest}
    >
      <Checkbox
        aria-label={all ? 'Deselect all' : 'Select all'}
        checked={selectedCount > 0}
        indeterminate={partialSelection}
        onCheckedChange={() => onSelectAll?.(!all)}
      />
      <span className={styles.count} aria-live="polite">
        {selectedCount} selected
      </span>
      {onDownload ? (
        <Button variant="ghost" size="small" iconLeft="download" onClick={onDownload}>
          Download
        </Button>
      ) : null}
      {onDelete ? (
        <Button variant="secondary" size="small" iconLeft="trash" onClick={onDelete} disabled={mode === 'blocked'}>
          {deleteLabel}
        </Button>
      ) : null}
      {onDelete && lockNote ? (
        <span className={styles.lockNote}>
          <Icon name="lock" size={12} />
          <span>{lockNote}</span>
        </span>
      ) : null}
      {children}
      <span className={styles.spacer} />
      <Button variant="ghost" size="small" onClick={onClear}>
        Clear
      </Button>
    </motion.div>
  )
}
