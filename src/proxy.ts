import { NextResponse, type NextRequest } from 'next/server'

import { decideProxy, type ProxyDecision } from '@/admin/core/auth/proxy-rules'

/**
 * Proxy Next 16 (ex-middleware). Toute la logique est dans `src/admin/core/auth/proxy-rules.ts` (fonctions pures,
 * testées) ; ce fichier ne fait qu'appliquer la décision. Propriétaire : auth-core.
 *
 * - Mode normal : seul `/admin/**` est touché (en-têtes anti-iframe, redirection vers A1 sans cookie) ; le site
 *   public passe tel quel.
 * - Mode aperçu de l'éditeur (KZ_EDITOR_PREVIEW=1) : secret d'aperçu exigé partout, /admin /studio /api/draft-mode fermés.
 * Ce n'est qu'un contrôle optimiste : chaque page / action / route de l'admin appelle requireSession().
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const cookies: Record<string, string | undefined> = {}
  for (const c of request.cookies.getAll()) cookies[c.name] = c.value

  const decision = decideProxy({
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
  })
  return apply(decision, request)
}

function apply(decision: ProxyDecision, request: NextRequest): NextResponse {
  let response: NextResponse
  switch (decision.type) {
    case 'next': {
      if (decision.requestHeaders) {
        const headers = new Headers(request.headers)
        for (const [k, v] of Object.entries(decision.requestHeaders)) headers.set(k, v)
        response = NextResponse.next({ request: { headers } })
      } else {
        response = NextResponse.next()
      }
      break
    }
    case 'redirect': {
      response = NextResponse.redirect(new URL(decision.location, request.url), 307)
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
  return response
}

export const config = {
  // Tout sauf les fichiers de build, l'optimiseur d'images et le HMR de next dev (voir core/auth/CLAUDE.md).
  matcher: ['/((?!_next/static|_next/image|_next/webpack-hmr|__nextjs).*)'],
}
