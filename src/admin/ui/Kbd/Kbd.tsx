import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from '../utils/cx'
import styles from './Kbd.module.css'

export type KbdProps = HTMLAttributes<HTMLElement> & {
  /** Libellé de la touche : « ⌘ ↵ », « / », « Esc ». */
  children: ReactNode
  ref?: Ref<HTMLElement>
}

/** Touche clavier (Figma « Kbd » 323:181) : Caption, text/tertiary, bg/subtle, border/default, 16 px de haut. */
export function Kbd({ className, children, ref, ...rest }: KbdProps) {
  return (
    <kbd ref={ref} className={cx(styles.kbd, className)} {...rest}>
      {children}
    </kbd>
  )
}
