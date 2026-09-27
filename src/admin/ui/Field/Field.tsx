import type { ReactNode, Ref } from 'react'
import { cx } from '../utils/cx'
import styles from './Field.module.css'

export type FieldLayout = 'stacked' | 'inline'

export type FieldProps = {
  /** Libellé (Body Small, text/secondary). */
  label?: ReactNode
  /** Masque visuellement le libellé (Figma : Show label = false) ; il reste lu par les lecteurs d'écran. */
  hideLabel?: boolean
  /** id du contrôle : le libellé devient un <label htmlFor>. */
  htmlFor?: string
  /** id du libellé (pour aria-labelledby des contrôles qui ne sont pas des <input>). */
  labelId?: string
  /** Aide sous le contrôle (Body Small, text/muted) : compteur « 42 / 60 » ou consigne. */
  helper?: ReactNode
  /** Erreur : un message remplace l'aide ; `true` colore l'aide existante. En interactive/danger. */
  error?: ReactNode | boolean
  /** id de l'aide / de l'erreur (aria-describedby du contrôle). */
  helperId?: string
  /** stacked : libellé au-dessus (gap 6) ; inline : libellé 120 px à gauche (gap 12, décalé de 8). */
  layout?: FieldLayout
  className?: string
  /** Classe de l'aide (ex. Caption pour Variable input). */
  helperClassName?: string
  children: ReactNode
  ref?: Ref<HTMLDivElement>
}

/**
 * Gabarit commun des champs (Input, Textarea, Select, VariableInput…) : libellé, contrôle, aide / erreur,
 * mise en page empilée ou en ligne (Figma : label-wrap, control, helper).
 */
export function Field({ label, hideLabel, htmlFor, labelId, helper, error, helperId, layout = 'stacked', className, helperClassName, children, ref }: FieldProps) {
  const hasError = error != null && error !== false && error !== ''
  const message = hasError && error !== true ? error : helper
  const LabelTag = htmlFor ? 'label' : 'span'
  return (
    <div ref={ref} data-layout={layout} className={cx(styles.field, layout === 'inline' && styles.inline, className)}>
      {label != null ? (
        <div className={cx(styles.labelWrap, hideLabel && 'kz-visually-hidden')}>
          <LabelTag id={labelId} htmlFor={htmlFor} className={styles.label}>
            {label}
          </LabelTag>
        </div>
      ) : null}
      <div className={styles.control}>
        {children}
        {message != null && message !== false ? (
          <p id={helperId} className={cx(styles.helper, helperClassName, hasError && styles.error)}>
            {message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
