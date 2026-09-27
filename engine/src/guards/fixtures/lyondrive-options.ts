import type { DesignSystemOptions } from '../design-system'

/**
 * Réglages du design system LyonDrive (site du POC, copié dans fixtures/lyondrive/ pour les tests portés) :
 * - ses points de rupture déclarés (RULES.md : `@media (min-width: 48rem)` et `(min-width: 64rem)`) : son CSS n'utilise
 *   que 48rem, et sans cette option le repli (points de rupture relus dans le CSS du site) ne permettrait pas 64rem ;
 * - sa convention de nommage : clés écrites sans leur groupe (`night` du groupe color → `--color-night`), sans feuille
 *   tokens.css (LyonDrive générait ses variables depuis tokens.json).
 */
export const LYONDRIVE: DesignSystemOptions = Object.freeze({
  breakpoints: Object.freeze(['48rem', '64rem']),
  naming: 'group-key' as const,
})
