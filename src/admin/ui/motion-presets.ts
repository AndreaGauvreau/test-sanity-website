/**
 * Préréglages de mouvement du kit (valeurs pures, utilisables aussi côté serveur).
 * Les hooks et composants Motion sont dans motion.ts (client). Règles : voir l'en-tête de motion.ts.
 */
import type { Transition, Variants } from 'motion/react'

/** Durées en secondes (Motion). */
export const duration = {
  /** Micro-interactions : pression, coche, bascule. */
  fast: 0.15,
  /** Popover, tooltip, liste déroulante. */
  base: 0.2,
  /** Toast, panneaux plus grands. */
  slow: 0.25,
  /** Modal, drawer (ui-composites). */
  overlay: 0.28,
} as const

/** Courbes (cubic-bezier). */
export const ease = {
  /** ease-out-quint : entrées et sorties, réponse immédiate. */
  out: [0.23, 1, 0.32, 1],
  /** ease-in-out-cubic : déplacement d'un élément déjà visible. */
  inOut: [0.645, 0.045, 0.355, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>

/** Ressorts sans rebond (interface sérieuse), interruptibles. */
export const spring = {
  /** Réordonnancement, pile de toasts, layout. */
  snappy: { type: 'spring', visualDuration: 0.25, bounce: 0 },
  /** Glissements plus amples (drawer). */
  smooth: { type: 'spring', visualDuration: 0.35, bounce: 0 },
} as const satisfies Record<string, Transition>

export const transition = {
  enter: { duration: duration.base, ease: ease.out },
  exit: { duration: duration.base * 0.8, ease: ease.out },
  move: { duration: duration.base, ease: ease.inOut },
} as const satisfies Record<string, Transition>

/** Fondu simple. */
export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transition.enter },
  exit: { opacity: 0, transition: transition.exit },
}

/** Glissé vers le haut (toast en bas de l'écran, contenu qui apparaît). */
export const slideUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } },
  exit: { opacity: 0, y: 4, transition: { duration: duration.slow * 0.8, ease: ease.out } },
}

/** Glissé vers le bas (bandeau, message sous un champ). */
export const slideDown: Variants = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0, transition: transition.enter },
  exit: { opacity: 0, y: -4, transition: transition.exit },
}

/**
 * Échelle pour popovers, menus, listes déroulantes, tooltips : 0.96 → 1 depuis le déclencheur.
 * Poser `transform-origin: var(--k-popover-origin)` (fourni par <Popover>).
 */
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: duration.fast, ease: ease.out } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.fast * 0.8, ease: ease.out } },
}

/** Liste : conteneur qui échelonne ses enfants (30 ms), à combiner avec `listItem`. */
export const list: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.03 } },
  exit: {},
}

export const listItem: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: transition.enter },
  exit: { opacity: 0, transition: transition.exit },
}
