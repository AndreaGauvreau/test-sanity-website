'use client'

import type { Ref } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import { duration, ease } from '../motion-presets'
import { useMotionTransition } from '../motion'
import { cx } from '../utils/cx'
import styles from './Scrim.module.css'

export type ScrimProps = Omit<HTMLMotionProps<'div'>, 'ref'> & {
  /** fixed (défaut) : couvre l'écran ; absolute : couvre le parent positionné (galerie, zone locale). */
  position?: 'fixed' | 'absolute'
  /** Durée du fondu (s) : la même que la fenêtre posée dessus (éléments appariés). */
  enterDuration?: number
  ref?: Ref<HTMLDivElement>
}

/**
 * Voile bg/scrim (noir 60 %) derrière une Modal ou un Drawer (Figma « Scrim » 336:825). Fondu ease-out ;
 * dans un <AnimatePresence>, la sortie est ~20 % plus rapide. Décoratif (aria-hidden) : le clic est géré
 * par la fenêtre qui le pose.
 */
export function Scrim({ position = 'fixed', enterDuration = duration.base, className, ref, ...rest }: ScrimProps) {
  const enter = useMotionTransition({ duration: enterDuration, ease: ease.out })
  const exit = useMotionTransition({ duration: enterDuration * 0.8, ease: ease.out })
  return (
    <motion.div
      ref={ref}
      aria-hidden="true"
      data-position={position}
      className={cx(styles.scrim, className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: enter }}
      exit={{ opacity: 0, transition: exit }}
      {...rest}
    />
  )
}
