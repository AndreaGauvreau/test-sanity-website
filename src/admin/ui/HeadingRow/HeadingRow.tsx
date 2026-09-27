import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { Icon } from '../icons'
import { cx } from '../utils/cx'
import styles from './HeadingRow.module.css'

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export type HeadingRowProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  /** Niveau du titre (retrait 8 / 24 / 40 / 56 px ; H5-H6 continuent de 16 en 16). */
  level: HeadingLevel
  /** Texte du titre (Body, text/secondary). */
  text: ReactNode
  /** warning : fond bg/tint/warning + note à droite (« Level skipped »). */
  status?: 'ok' | 'warning'
  /** Message d'alerte (Caption, interactive/warning), affiché en status=warning. */
  note?: ReactNode
  /** Élément rendu : `li` dans une liste (<ul> fournie par l'appelant), `div` sinon. */
  as?: 'div' | 'li'
  ref?: Ref<HTMLElement>
}

/**
 * Ligne de l'arbre des titres (Figma « Heading row » 338:1337) : H gap 8, pad 4 8, radius/sm ; pastille de
 * niveau (Label Small, bg/subtle) ; retrait selon le niveau. 520 px dans Figma, fluide ici. Composant pur.
 */
export function HeadingRow({ level, text, status = 'ok', note, as: Tag = 'div', className, style, ref, ...rest }: HeadingRowProps) {
  const warning = status === 'warning'
  return (
    <Tag
      ref={ref as Ref<HTMLDivElement & HTMLLIElement>}
      data-status={status}
      className={cx(styles.row, warning && styles.warning, className)}
      style={{ paddingLeft: 8 + (level - 1) * 16, ...style }}
      {...rest}
    >
      <span className={styles.level} aria-hidden="true">
        H{level}
      </span>
      <span className="kz-visually-hidden">{`Heading level ${level}: `}</span>
      <span className={styles.text}>{text}</span>
      {warning && note != null ? (
        <span className={styles.note}>
          <Icon name="warning" size={12} />
          <span>{note}</span>
        </span>
      ) : null}
    </Tag>
  )
}
