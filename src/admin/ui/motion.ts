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
import { useMemo } from 'react'
import { useReducedMotion, type Transition, type Variants } from 'motion/react'
import { noTransition, reducedVariants } from './motion-presets'

export { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react'
export * from './motion-presets'

/**
 * Renvoie les variantes voulues, ou, si l'utilisateur a demandé moins d'animations, les mêmes variantes sans
 * transition (`reducedVariants`) : l'état `initial` reste celui de l'original, identique au rendu serveur
 * (où `useReducedMotion()` vaut null) → pas d'écart d'hydratation (FOLLOWUPS #38). À utiliser dans tout
 * composant client animé par Motion.
 */
export function useMotionVariants(variants: Variants): Variants {
  const reduced = useReducedMotion()
  const quiet = useMemo(() => reducedVariants(variants), [variants])
  return reduced ? quiet : variants
}

/** Transition, ou transition nulle en mouvement réduit. */
export function useMotionTransition(value: Transition): Transition {
  const reduced = useReducedMotion()
  return reduced ? noTransition : value
}
