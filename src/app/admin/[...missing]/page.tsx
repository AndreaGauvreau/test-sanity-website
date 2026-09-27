import { notFound } from 'next/navigation'

import { requireSession } from '@/admin/core/auth/session'

/**
 * URL inconnue sous /admin (ex. /admin/xyz) : sans cette route, Next rendrait le 404 du SITE (layout racine, GTM).
 * Session d'abord (sans session : A1, sans révéler si la page existe), puis notFound() → src/app/admin/not-found.tsx
 * (dans la coque). Placée HORS de (shell) : sous le loading.tsx de la coque, la réponse partirait en 200 (streaming).
 * Les routes plus précises (coque, login, éditeur, API) passent avant un attrape-tout.
 */
export default async function AdminMissingPage(): Promise<never> {
  await requireSession()
  notFound()
}
