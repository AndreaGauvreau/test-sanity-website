import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Icon, type IconName } from '../icons'
import { cx } from '../utils/cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'ghost' | 'danger'
export type ButtonSize = 'medium' | 'small'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** primary = action principale (Publish, Apply) ; secondary = courante ; subtle = Cancel d'une modale, Upload ; ghost = discrète ; danger = suppression. */
  variant?: ButtonVariant
  /** medium : Label Large, pad 10 20, icône 16 ; small : Label, pad 6 14, icône 12. */
  size?: ButtonSize
  iconLeft?: IconName
  iconRight?: IconName
  /** En cours : loader animé à gauche, aria-busy, clics ignorés (le focus reste). */
  loading?: boolean
  /** Occupe toute la largeur du parent. */
  block?: boolean
  children?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

/** Classes d'un bouton, pour styler un lien (<a>, <Link>) comme un Button. */
export function buttonClassName({
  variant = 'primary',
  size = 'medium',
  block,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}): string {
  return cx(styles.button, styles[variant], styles[size], block && styles.block, className)
}

/** Contenu d'un bouton (icônes + libellé), réutilisable dans un lien stylé par buttonClassName. */
export function ButtonContent({
  size = 'medium',
  iconLeft,
  iconRight,
  loading,
  children,
}: Pick<ButtonProps, 'size' | 'iconLeft' | 'iconRight' | 'loading' | 'children'>) {
  const iconSize = size === 'small' ? 12 : 16
  const left = loading ? 'loader' : iconLeft
  return (
    <>
      {left ? <Icon name={left} size={iconSize} set={18} spin={loading} className={styles.icon} /> : null}
      {children != null ? <span className={styles.label}>{children}</span> : null}
      {iconRight ? <Icon name={iconRight} size={iconSize} set={18} className={styles.icon} /> : null}
    </>
  )
}

/** Bouton d'action (Figma « Button » 111:286) : 5 variantes × 2 tailles, états hover / pressed / disabled / focus-visible. */
export function Button({
  variant = 'primary',
  size = 'medium',
  iconLeft,
  iconRight,
  loading = false,
  block,
  className,
  type = 'button',
  disabled,
  onClick,
  children,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      data-loading={loading || undefined}
      className={buttonClassName({ variant, size, block, className })}
      onClick={(event) => {
        if (loading) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
      {...rest}
    >
      <ButtonContent size={size} iconLeft={iconLeft} iconRight={iconRight} loading={loading}>
        {children}
      </ButtonContent>
    </button>
  )
}
