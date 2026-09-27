import { notFound } from 'next/navigation'

/**
 * /admin/auth/denied — cible INTERNE du proxy (réécriture) pour une page réservée par un droit que la session n'a pas
 * (PAGE_CAPABILITIES de core/auth/proxy-rules.ts : B3 Code, B4 Team). Propriétaire : auth-core.
 *
 * notFound() est appelé tout de suite, hors de tout loading.tsx (ce segment n'en a pas) : le rendu n'a pas encore
 * commencé à streamer, Next répond donc une VRAIE 404 avec app/admin/not-found.tsx (FOLLOWUPS #21). Sous la coque
 * `(shell)`, le loading.tsx fait partir la réponse en 200 avant le notFound() de la page.
 * Appelée directement, elle répond aussi 404 : rien à protéger ici.
 */
export default function AdminDeniedPage(): never {
  notFound()
}
