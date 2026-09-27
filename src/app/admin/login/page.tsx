import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { adminConfig } from '@/admin.config'
import { ADMIN_HOME, ADMIN_LOGIN_PATH, loginErrorMessage } from '@/admin/core/auth/constants'
import { sanitizeNextPath } from '@/admin/core/auth/next-path'
import { getDevLoginState, getLoginProviders, getSession } from '@/admin/core/auth/session'
import { LoginScreen } from '@/admin/shell/login/LoginScreen'
import { firstParam } from '@/admin/shell/login/providers'

export const metadata: Metadata = { title: 'Log in' }

/**
 * A1 · Log in — page PUBLIQUE (le proxy la laisse passer ; c'est la seule page de l'admin sans requireSession).
 * Déjà connecté (vraie session ou connexion de dev active) → redirection vers `next` nettoyé, sinon /admin.
 * Paramètres : `next` (retour après connexion, nettoyé par sanitizeNextPath) et `error` (code → loginErrorMessage).
 * Props typées à la main : les types de routes générés peuvent être en retard sur le dev.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const rawNext = firstParam(params.next)
  const next = sanitizeNextPath(rawNext)

  const session = await getSession()
  if (session) redirect(next)

  const nextParam = next === ADMIN_HOME ? null : next
  const [{ providers, error: providersError }, devState] = await Promise.all([getLoginProviders(nextParam), getDevLoginState()])

  const error = loginErrorMessage(firstParam(params.error)) ?? providersError ?? null
  const retryHref = nextParam ? `${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(nextParam)}` : ADMIN_LOGIN_PATH

  return (
    <LoginScreen
      site={{ name: adminConfig.site.name, domain: adminConfig.site.domain }}
      providers={providers}
      error={error}
      retryHref={retryHref}
      dev={devState.available ? { roles: devState.roles, next } : null}
    />
  )
}
