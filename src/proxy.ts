import { NextResponse, type NextRequest } from 'next/server'

import { SESSION_COOKIE } from '@/admin/core/auth/constants'
import { openSession } from '@/admin/core/auth/crypto'
import { decideDevAutologin } from '@/admin/core/auth/dev'
import { decideProxy, type ProxyDecision } from '@/admin/core/auth/proxy-rules'
import { kuartzAllowlistFromEnv, reconcileSessionRole } from '@/admin/core/auth/roles'
import type { AdminRole } from '@/admin/core/contracts/roles'

/**
 * Proxy Next 16 (ex-middleware). Toute la logique est dans `src/admin/core/auth/proxy-rules.ts` (fonctions pures,
 * testées) ; ce fichier ne fait qu'appliquer la décision. Propriétaire : auth-core.
 *
 * - Mode normal : seul `/admin/**` est touché (en-têtes anti-iframe, redirection vers A1 sans cookie) ; le site
 *   public passe tel quel.
 * - Mode aperçu de l'éditeur (KZ_EDITOR_PREVIEW=1) : jeton d'aperçu court exigé partout (jamais le secret racine),
 *   cookie `kz_preview` renouvelé à chaque requête acceptée, /admin /studio /api/draft-mode /api/revalidate fermés.
 * Ce n'est qu'un contrôle optimiste : chaque page / action / route de l'admin appelle requireSession(). Seules les pages
 * réservées par un droit (PAGE_CAPABILITIES) sont refusées ici, pour une vraie 404 avant le rendu.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const cookies: Record<string, string | undefined> = {}
  for (const c of request.cookies.getAll()) cookies[c.name] = c.value

  const decision = await decideProxy({
    method: request.method,
    pathname,
    search,
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    cookies,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      ADMIN_DEV_AUTOLOGIN: process.env.ADMIN_DEV_AUTOLOGIN,
      KZ_EDITOR_PREVIEW: process.env.KZ_EDITOR_PREVIEW,
      ENGINE_PREVIEW_SECRET: process.env.ENGINE_PREVIEW_SECRET,
      ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
    },
    resolveRole: () => roleOf(request),
  })
  return apply(decision, request)
}

/** Rôle de la requête, comme getSession() : cookie réel (rôle recalculé, SEC-05), sinon session de dev. */
async function roleOf(request: NextRequest): Promise<AdminRole | null> {
  const opened = await openSession(request.cookies.get(SESSION_COOKIE)?.value, process.env.ADMIN_SESSION_SECRET).catch(() => null)
  const real = opened ? reconcileSessionRole(opened, kuartzAllowlistFromEnv()) : null
  if (real) return real.role
  const dev = decideDevAutologin({
    env: { NODE_ENV: process.env.NODE_ENV, ADMIN_DEV_AUTOLOGIN: process.env.ADMIN_DEV_AUTOLOGIN },
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    devRoleCookie: request.cookies.get('kz_dev_role')?.value,
  })
  return dev.enabled ? dev.role : null
}

function withRequestHeaders(request: NextRequest, extra: Record<string, string> | undefined): Headers | undefined {
  if (!extra) return undefined
  const headers = new Headers(request.headers)
  for (const [k, v] of Object.entries(extra)) headers.set(k, v)
  return headers
}

function apply(decision: ProxyDecision, request: NextRequest): NextResponse {
  let response: NextResponse
  switch (decision.type) {
    case 'next': {
      const headers = withRequestHeaders(request, decision.requestHeaders)
      response = headers ? NextResponse.next({ request: { headers } }) : NextResponse.next()
      break
    }
    case 'rewrite': {
      const headers = withRequestHeaders(request, decision.requestHeaders)
      const url = new URL(decision.location, request.url)
      response = headers ? NextResponse.rewrite(url, { request: { headers } }) : NextResponse.rewrite(url)
      break
    }
    case 'redirect': {
      response = NextResponse.redirect(new URL(decision.location, request.url), 307)
      break
    }
    case 'log-and-respond':
      console.error(decision.log)
      response = new NextResponse(decision.body, { status: decision.status, headers: { 'Content-Type': decision.contentType } })
      break
    case 'respond':
      response = new NextResponse(decision.body, { status: decision.status, headers: { 'Content-Type': decision.contentType } })
      break
  }
  for (const [k, v] of Object.entries(decision.responseHeaders ?? {})) response.headers.set(k, v)
  // Cookies de la décision (aperçu : `kz_preview` posé à la redirection ?kz_preview=, puis renouvelé à chaque requête).
  if ('setCookies' in decision) {
    for (const c of decision.setCookies ?? []) {
      response.cookies.set({
        name: c.name,
        value: c.value,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
        partitioned: c.partitioned,
        path: c.path,
        maxAge: c.maxAge,
      })
    }
  }
  return response
}

export const config = {
  // Tout sauf, à préfixe EXACT (SEC-06 : aucun préfixe ouvert, `/__nextjs_*` et `/_next/staticX` passent par le
  // proxy, donc par le jeton d'aperçu) : les fichiers de build `/_next/static/…`, l'optimiseur `/_next/image`, le HMR
  // `/_next/webpack-hmr`, et les route handlers d'ENVOI de fichiers de l'admin (constat QA-1) : sous le proxy, Next met
  // le corps en mémoire tampon et le tronque à 10 Mo (proxyClientMaxBodySize). Ces routes appellent requireCapability
  // EN PREMIER, bornent leur corps et vérifient l'origine ; en mode aperçu, getSession() refuse toute session.
  // Littéral obligatoire (analyse statique de Next) : toute modification est vérifiée par proxy-matcher.test.ts.
  matcher: ['/((?!_next/static/|_next/image$|_next/webpack-hmr$|admin/media/upload/?$|admin/pages/[^/]+/image/?$).*)'],
}
