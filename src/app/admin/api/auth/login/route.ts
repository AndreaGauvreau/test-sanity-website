import type { NextRequest } from 'next/server'

import { ADMIN_LOGIN_PATH } from '@/admin/core/auth/constants'
import { providerRedirectUrl } from '@/admin/core/auth/session'

/**
 * GET /admin/api/auth/login?provider=google&next=/admin/pages — boutons « Continue with … » de A1.
 * Construit côté serveur l'URL du fournisseur Sanity (origin=/admin/auth/callback?next=…, projectId, withSid=true)
 * et y redirige. Fournisseur inconnu ou Sanity injoignable → retour sur A1 avec `?error=provider`.
 */
export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider') ?? ''
  const next = request.nextUrl.searchParams.get('next')
  let target: string | null = null
  try {
    target = /^[\w-]{1,64}$/.test(provider) ? await providerRedirectUrl(provider, next) : null
  } catch {
    target = null
  }
  const location = target ?? `${ADMIN_LOGIN_PATH}?error=provider`
  return new Response(null, { status: 307, headers: { Location: location, 'cache-control': 'no-store' } })
}
