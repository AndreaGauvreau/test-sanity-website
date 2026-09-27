'use client'

import { useId, useRef, type ReactNode, type Ref, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '../Button'
import { IconButton } from '../IconButton'
import { duration, ease } from '../motion-presets'
import { Portal } from '../Popover'
import { Scrim } from '../Scrim'
import { cx } from '../utils/cx'
import { mergeRefs } from '../utils/refs'
import { useModalDialog } from './useModalDialog'
import styles from './Modal.module.css'

export type ModalCloseReason = 'escape' | 'scrim' | 'close' | 'cancel'

export type ModalProps = {
  open: boolean
  /** Demande de fermeture : le parent décide (ex. refuser pendant un enregistrement). */
  onClose: (reason: ModalCloseReason) => void
  /** Titre (Heading 4) : nom accessible de la fenêtre. */
  title: ReactNode
  /** Description (Body, text/tertiary) : description accessible. */
  description?: ReactNode
  /** Contenu libre (Figma « slot »). */
  children?: ReactNode
  /** Pied sur mesure. Sinon, avec `onConfirm` : Cancel (secondary) + confirmation (primary / danger). */
  footer?: ReactNode
  /** default : confirmation primary ; destructive : confirmation danger et role="alertdialog". */
  tone?: 'default' | 'destructive'
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  confirmLoading?: boolean
  confirmDisabled?: boolean
  /** Largeur (défaut 480, Figma). */
  width?: number
  /** Clic sur le voile : ferme (défaut true ; false pour une saisie longue). */
  closeOnScrimClick?: boolean
  /** Masque le bouton ✕ de l'en-tête. */
  hideClose?: boolean
  /** Élément focalisé à l'ouverture (sinon [data-autofocus], le premier champ, puis la fenêtre). */
  initialFocusRef?: RefObject<HTMLElement | null>
  className?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * Fenêtre modale (Figma « Modal » 336:820) : 480 px, radius/lg, bg/elevated, border/default, Elevation/Modal,
 * posée sur un Scrim. En-tête (pad 16 12 4 20 : titre + ✕), corps (pad 4 20 8 20, gap 16), pied (pad 12 16 16 20,
 * gap 8, à droite). APG dialog : aria-modal, titre et description liés, piège du focus, Échap, retour du focus.
 * Entrée : échelle 0.96 → 1 + fondu, 200 ms ease-out (sortie 160 ms), voile apparié ; mouvement réduit : rien.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  tone = 'default',
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  onConfirm,
  confirmLoading,
  confirmDisabled,
  width = 480,
  closeOnScrimClick = true,
  hideClose,
  initialFocusRef,
  className,
  ref,
}: ModalProps) {
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const onKeyDown = useModalDialog({ id, open, dialogRef, onEscape: () => onClose('escape'), initialFocusRef })

  const enter = reduced ? { duration: 0 } : { duration: duration.base, ease: ease.out }
  const exit = reduced ? { duration: 0 } : { duration: duration.base * 0.8, ease: ease.out }

  const footerNode =
    footer ??
    (onConfirm ? (
      <>
        <Button variant="secondary" size="small" onClick={() => onClose('cancel')}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'destructive' ? 'danger' : 'primary'}
          size="small"
          onClick={onConfirm}
          loading={confirmLoading}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </Button>
      </>
    ) : null)

  return (
    <Portal>
      <AnimatePresence>
        {open ? (
          <div key="modal" className={styles.layer}>
            <Scrim onClick={closeOnScrimClick ? () => onClose('scrim') : undefined} />
            <motion.div
              ref={mergeRefs(dialogRef, ref)}
              role={tone === 'destructive' ? 'alertdialog' : 'dialog'}
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description != null ? descriptionId : undefined}
              tabIndex={-1}
              className={cx(styles.modal, className)}
              style={{ width }}
              onKeyDown={onKeyDown}
              // `transform` en chaîne : animation WAAPI accélérée (skill motion) ; jamais depuis scale(0).
              initial={reduced ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.96)' }}
              animate={reduced ? { opacity: 1, transition: enter } : { opacity: 1, transform: 'scale(1)', transition: enter }}
              exit={reduced ? { opacity: 0, transition: exit } : { opacity: 0, transform: 'scale(0.98)', transition: exit }}
            >
              <div className={styles.header}>
                <h2 id={titleId} className={styles.title}>
                  {title}
                </h2>
                {hideClose ? null : <IconButton icon="close" label="Close" tooltip={false} onClick={() => onClose('close')} />}
              </div>
              {description != null || children != null ? (
                <div className={styles.body}>
                  {description != null ? (
                    <p id={descriptionId} className={styles.description}>
                      {description}
                    </p>
                  ) : null}
                  {children}
                </div>
              ) : null}
              {footerNode ? <div className={styles.footer}>{footerNode}</div> : null}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </Portal>
  )
}
