'use client'

/**
 * Mouvement du kit : durées, courbes, ressorts et variantes partagées (skills web-animation-design et motion).
 *
 * Règles :
 * - Entrée / sortie (popover, tooltip, toast, menu) : ease-out, 150-250 ms ; la sortie ~20 % plus rapide.
 * - Élément déjà à l'écran qui bouge : ease-in-out. Survol / couleur : `ease` 150 ms (CSS).
 * - Rien d'animé au clavier (navigation dans une liste) ni sur ce qui sert 100 fois par jour.
 * - Seulement transform et opacity ; jamais depuis scale(0) (0.96 minimum) ; origine = déclencheur.
 * - Interface sérieuse : pas de rebond (bounce 0).
 * - prefers-reduced-motion : CSS (base.css + chaque module) ET JS (`useReducedMotion` → transition nulle).
 *
 * Équivalents CSS (tokens.css) : --k-ease-out, --k-ease-in-out, --k-duration-fast|base|slow.
 * Les valeurs (duration, ease, spring, transition, variantes) vivent dans motion-presets.ts, sans directive,
 * pour rester importables par un Server Component ; ce fichier les réexporte avec les hooks.
 */
import { useReducedMotion, type Transition, type Variants } from 'motion/react'

export { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react'
export * from './motion-presets'

/** Variantes « instantanées » : mêmes états finaux, aucune transition (mouvement réduit). */
const instant: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
}

/**
 * Renvoie les variantes voulues, ou des variantes sans mouvement si l'utilisateur a demandé
 * moins d'animations. À utiliser dans tout composant client animé par Motion.
 */
export function useMotionVariants(variants: Variants): Variants {
  const reduced = useReducedMotion()
  return reduced ? instant : variants
}

/** Transition, ou transition nulle en mouvement réduit. */
export function useMotionTransition(value: Transition): Transition {
  const reduced = useReducedMotion()
  return reduced ? { duration: 0 } : value
}
