'use client'

import { useId, useRef, type ReactNode, type Ref, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { IconButton } from '../IconButton'
import { useModalDialog } from '../Modal/useModalDialog'
import { duration, ease } from '../motion-presets'
import { Portal } from '../Popover'
import { Scrim } from '../Scrim'
import { cx } from '../utils/cx'
import { mergeRefs } from '../utils/refs'
import styles from './Drawer.module.css'

export type DrawerCloseReason = 'escape' | 'scrim' | 'close'

export type DrawerProps = {
  open: boolean
  onClose: (reason: DrawerCloseReason) => void
  /** Titre de l'élément (Heading 4) : nom accessible du panneau. */
  title: ReactNode
  /** Statut à côté du titre (Figma « Show status ») : `<Tag tone="warning">Draft</Tag>`. */
  status?: ReactNode
  /** Actions de l'en-tête avant ✕ (ex. `<Menu trigger={<IconButton icon="more" …/>}>`). */
  actions?: ReactNode
  /** Champs de la fiche (corps : pad 16, gap 12, défilement). */
  children?: ReactNode
  /** Pied (pad 16, trait haut) : ex. Callout « Need another field? Ask Kuartz… ». */
  footer?: ReactNode
  /** Largeur (défaut 810 : écran C4 ; la description Figma dit 440, le composant et l'écran mesurent 810). */
  width?: number
  closeOnScrimClick?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Description accessible (id d'un élément du corps). */
  'aria-describedby'?: string
  className?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * Panneau latéral (Figma « Drawer » 336:970, écran C4) : à droite, pleine hauteur, bg/elevated, trait gauche
 * border/default, Elevation/Modal, posé sur un Scrim par-dessus la liste. En-tête (pad 10 8 10 16, trait bas) :
 * titre, statut, actions, ✕ ; corps défilant ; pied optionnel. Pas de bouton Save (brouillon automatique).
 * Modal au sens APG (piège du focus, Échap, clic sur le voile, retour du focus). Glisse depuis la droite
 * (280 ms ease-out, sortie 220 ms), voile apparié ; mouvement réduit : fondu instantané.
 */
export function Drawer({
  open,
  onClose,
  title,
  status,
  actions,
  children,
  footer,
  width = 810,
  closeOnScrimClick = true,
  initialFocusRef,
  'aria-describedby': describedBy,
  className,
  ref,
}: DrawerProps) {
  const id = useId()
  const titleId = `${id}-title`
  const panelRef = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const onKeyDown = useModalDialog({ id, open, dialogRef: panelRef, onEscape: () => onClose('escape'), initialFocusRef })

  const enter = reduced ? { duration: 0 } : { duration: duration.overlay, ease: ease.out }
  const exit = reduced ? { duration: 0 } : { duration: duration.overlay * 0.8, ease: ease.out }

  return (
    <Portal>
      <AnimatePresence>
        {open ? (
          <div key="drawer" className={styles.layer}>
            <Scrim enterDuration={duration.overlay} onClick={closeOnScrimClick ? () => onClose('scrim') : undefined} />
            <motion.div
              ref={mergeRefs(panelRef, ref)}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={describedBy}
              tabIndex={-1}
              className={cx(styles.drawer, className)}
              style={{ width }}
              onKeyDown={onKeyDown}
              // `transform` en chaîne : animation WAAPI accélérée (skill motion).
              initial={reduced ? { opacity: 0 } : { transform: 'translateX(100%)' }}
              animate={reduced ? { opacity: 1, transition: enter } : { transform: 'translateX(0%)', transition: enter }}
              exit={reduced ? { opacity: 0, transition: exit } : { transform: 'translateX(100%)', transition: exit }}
            >
              <div className={styles.header}>
                <h2 id={titleId} className={styles.title}>
                  {title}
                </h2>
                {status}
                {actions}
                <IconButton icon="close" label="Close" tooltip={false} onClick={() => onClose('close')} />
              </div>
              <div className={styles.body}>{children}</div>
              {footer ? <div className={styles.footer}>{footer}</div> : null}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </Portal>
  )
}
