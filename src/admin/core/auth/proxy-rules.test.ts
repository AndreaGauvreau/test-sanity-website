import { describe, expect, it, vi } from 'vitest'

import { PREVIEW_TOKEN_TTL_SECONDS, signPreviewToken, verifyPreviewToken } from '@/admin/core/engine/preview-token'

import { ADMIN_DENIED_PATH, decideProxy, pageCapabilityFor, previewFrameAncestors, timingSafeEqualString, type ProxyInput } from './proxy-rules'

const SECRET = 'preview-secret-0123456789abcdef'
const NOW = 1_790_000_000

function input(over: Partial<ProxyInput> = {}): ProxyInput {
  return { method: 'GET', pathname: '/', search: '', host: '127.0.0.1:4040', cookies: {}, env: { NODE_ENV: 'production' }, ...over }
}

describe('proxy — mode normal', () => {
  it('ne touche pas au site public', async () => {
    for (const pathname of ['/', '/blog', '/blog/x', '/administrator', '/api/revalidate']) {
      expect(await decideProxy(input({ pathname }))).toEqual({ type: 'next' })
    }
  })
  it('sans cookie : /admin/** redirige vers A1 avec next', async () => {
    expect(await decideProxy(input({ pathname: '/admin/media', search: '?q=1' }))).toMatchObject({
      type: 'redirect',
      location: '/admin/login?next=%2Fadmin%2Fmedia%3Fq%3D1',
      responseHeaders: { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" },
    })
    expect(await decideProxy(input({ pathname: '/admin' }))).toMatchObject({ type: 'redirect', location: '/admin/login' })
  })
  it('laisse passer A1, le retour de connexion et les routes d’auth, avec les en-têtes anti-iframe', async () => {
    for (const pathname of ['/admin/login', '/admin/auth/callback', '/admin/api/auth/session']) {
      const d = await decideProxy(input({ pathname }))
      expect(d.type).toBe('next')
      expect(d.responseHeaders?.['X-Frame-Options']).toBe('DENY')
    }
  })
  it('API sans session → 401 JSON ; POST de page → laissé à requireSession', async () => {
    expect(await decideProxy(input({ pathname: '/admin/api/engine/health' }))).toMatchObject({ type: 'respond', status: 401 })
    expect((await decideProxy(input({ pathname: '/admin/pages', method: 'POST' }))).type).toBe('next')
  })
  it('avec cookie : passe et réécrit x-kz-path', async () => {
    const d = await decideProxy(input({ pathname: '/admin/pages', search: '?a=1', cookies: { kz_admin: 'x' } }))
    expect(d).toMatchObject({ type: 'next', requestHeaders: { 'x-kz-path': '/admin/pages?a=1' } })
  })
  it('autologin de dev : seulement NODE_ENV=development + hôte local', async () => {
    const env = { NODE_ENV: 'development', ADMIN_DEV_AUTOLOGIN: 'client' }
    expect((await decideProxy(input({ pathname: '/admin', env }))).type).toBe('next')
    expect((await decideProxy(input({ pathname: '/admin', env, host: 'conduit.com' }))).type).toBe('redirect')
    expect((await decideProxy(input({ pathname: '/admin', env, host: '[::1]evil.com' }))).type).toBe('redirect')
    expect((await decideProxy(input({ pathname: '/admin', env: { ...env, NODE_ENV: 'production' } }))).type).toBe('redirect')
    expect((await decideProxy(input({ pathname: '/admin', env, cookies: { kz_dev_role: 'off' } }))).type).toBe('redirect')
  })
})

describe('proxy — pages réservées par un droit (FOLLOWUPS #21 : vraie 404 avant le rendu)', () => {
  const withRole = (role: 'kuartz' | 'client' | 'editor' | null) => vi.fn(async () => role)

  it('table des pages réservées', () => {
    expect(pageCapabilityFor('/admin/settings/code')).toBe('settings.code')
    expect(pageCapabilityFor('/admin/settings/team/x')).toBe('settings.team')
    expect(pageCapabilityFor('/admin/settings/general')).toBeNull()
    expect(pageCapabilityFor('/admin/settings/codex')).toBeNull()
  })
  it('régression : rôle sans le droit → réécriture vers la page 404 interne (URL inchangée, x-kz-path gardé)', async () => {
    const d = await decideProxy(input({ pathname: '/admin/settings/code', cookies: { kz_admin: 'x' }, resolveRole: withRole('client') }))
    expect(d).toMatchObject({ type: 'rewrite', location: ADMIN_DENIED_PATH, requestHeaders: { 'x-kz-path': '/admin/settings/code' } })
    expect(d.responseHeaders?.['X-Frame-Options']).toBe('DENY')
    const team = await decideProxy(input({ pathname: '/admin/settings/team', cookies: { kz_admin: 'x' }, resolveRole: withRole('editor') }))
    expect(team.type).toBe('rewrite')
  })
  it('rôle avec le droit, ou session de dev du bon rôle → passe', async () => {
    expect((await decideProxy(input({ pathname: '/admin/settings/code', cookies: { kz_admin: 'x' }, resolveRole: withRole('kuartz') }))).type).toBe('next')
    const env = { NODE_ENV: 'development', ADMIN_DEV_AUTOLOGIN: 'client' }
    expect((await decideProxy(input({ pathname: '/admin/settings/team', env, resolveRole: withRole('client') }))).type).toBe('next')
    expect((await decideProxy(input({ pathname: '/admin/settings/code', env, resolveRole: withRole('client') }))).type).toBe('rewrite')
  })
  it('rôle illisible (cookie périmé) → laissé à la page (redirection A1) ; autres pages : rôle jamais calculé', async () => {
    expect((await decideProxy(input({ pathname: '/admin/settings/code', cookies: { kz_admin: 'x' }, resolveRole: withRole(null) }))).type).toBe('next')
    const resolveRole = withRole('editor')
    await decideProxy(input({ pathname: '/admin/pages', cookies: { kz_admin: 'x' }, resolveRole }))
    await decideProxy(input({ pathname: '/admin/settings/code', method: 'POST', cookies: { kz_admin: 'x' }, resolveRole }))
    expect(resolveRole).not.toHaveBeenCalled()
  })
})

describe('proxy — page d’essai de l’éditeur (FOLLOWUPS #19)', () => {
  it('en développement : affichable dans l’iframe de l’admin (SAMEORIGIN, frame-ancestors self)', async () => {
    const env = { NODE_ENV: 'development' }
    const d = await decideProxy(input({ pathname: '/admin/editor/harness', env, cookies: { kz_admin: 'x' } }))
    expect(d.responseHeaders).toEqual({ 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "frame-ancestors 'self'" })
    // Le reste de l'admin reste interdit en iframe.
    expect((await decideProxy(input({ pathname: '/admin/editor', env, cookies: { kz_admin: 'x' } }))).responseHeaders?.['X-Frame-Options']).toBe('DENY')
  })
  it('hors développement : DENY comme le reste de l’admin', async () => {
    const d = await decideProxy(input({ pathname: '/admin/editor/harness', cookies: { kz_admin: 'x' } }))
    expect(d.responseHeaders?.['X-Frame-Options']).toBe('DENY')
  })
})

describe('proxy — mode aperçu (KZ_EDITOR_PREVIEW=1)', () => {
  const env = { NODE_ENV: 'development', KZ_EDITOR_PREVIEW: '1', ENGINE_PREVIEW_SECRET: SECRET, ADMIN_ORIGIN: 'http://127.0.0.1:4040' }
  const p = (over: Partial<ProxyInput>) => decideProxy(input({ host: '127.0.0.1:4042', env, nowSeconds: NOW, ...over }))
  const token = (ttl = 900, now = NOW) => signPreviewToken(SECRET, 'user-1', now, ttl)

  it('refuse sans jeton ou avec un mauvais jeton', async () => {
    expect(await p({ pathname: '/' })).toMatchObject({ type: 'respond', status: 403 })
    expect(await p({ pathname: '/', cookies: { kz_preview: 'wrong' } })).toMatchObject({ type: 'respond', status: 403 })
  })
  it('cookie = jeton valide → passe, frame-ancestors = ADMIN_ORIGIN ; jeton expiré → 403', async () => {
    const t = await token()
    const d = await p({ pathname: '/blog', cookies: { kz_preview: t } })
    expect(d).toMatchObject({ type: 'next', responseHeaders: { 'Content-Security-Policy': 'frame-ancestors http://127.0.0.1:4040' } })
    expect(await p({ pathname: '/blog', cookies: { kz_preview: t }, nowSeconds: NOW + 900 + 31 })).toMatchObject({ type: 'respond', status: 403 })
  })
  it('?kz_preview=<jeton> → cookie d’un jeton re-signé (même utilisateur) de même échéance, redirection sans le paramètre', async () => {
    const t = await token(900)
    const d = await p({ pathname: '/blog', search: `?kz_preview=${encodeURIComponent(t)}&x=1`, nowSeconds: NOW + 100 })
    expect(d).toMatchObject({ type: 'redirect', location: '/blog?x=1' })
    const cookie = d.type === 'redirect' ? d.setCookies?.[0] : undefined
    expect(cookie).toEqual({
      name: 'kz_preview',
      value: expect.any(String),
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
      partitioned: false,
      maxAge: 900,
    })
    expect(await verifyPreviewToken(SECRET, cookie?.value, NOW + 100)).toEqual({ exp: NOW + 100 + 900, userId: 'user-1' })
    // Jeton tout juste émis : le re-signer donne le même jeton.
    const fresh = await p({ pathname: '/blog', search: `?kz_preview=${t}` })
    expect(fresh.type === 'redirect' && fresh.setCookies?.[0]).toMatchObject({ value: t, maxAge: 900 })
    expect(await p({ pathname: '/', search: '?kz_preview=nope' })).toMatchObject({ type: 'respond', status: 403 })
    // Jeton dans sa marge de 30 s mais échu : pas de cookie mort.
    expect(await p({ pathname: '/', search: `?kz_preview=${t}`, nowSeconds: NOW + 910 })).toMatchObject({ type: 'respond', status: 403 })
  })
  it('régression FOLLOWUPS #39 : cookie renouvelé à chaque requête acceptée (jeton re-signé, même utilisateur, même durée)', async () => {
    const t = await token(900)
    // 10 min plus tard : le cookie repart pour 15 min, le jeton porte toujours user-1.
    const later = NOW + 600
    const d = await p({ pathname: '/blog', cookies: { kz_preview: t }, nowSeconds: later })
    expect(d.type).toBe('next')
    const cookie = d.type === 'next' ? d.setCookies?.[0] : undefined
    expect(cookie).toMatchObject({ name: 'kz_preview', httpOnly: true, path: '/', sameSite: 'lax', secure: false, partitioned: false })
    expect(cookie?.maxAge).toBe(PREVIEW_TOKEN_TTL_SECONDS)
    expect(cookie?.value).not.toBe(t)
    expect(await verifyPreviewToken(SECRET, cookie?.value, later)).toEqual({ exp: later + PREVIEW_TOKEN_TTL_SECONDS, userId: 'user-1' })
    // Sans renouvellement, t serait mort à NOW + 900 ; le jeton renouvelé passe encore à NOW + 1 200.
    expect(await p({ pathname: '/blog', cookies: { kz_preview: t }, nowSeconds: NOW + 1_200 })).toMatchObject({ type: 'respond', status: 403 })
    expect(await p({ pathname: '/blog', cookies: { kz_preview: cookie?.value }, nowSeconds: NOW + 1_200 })).toMatchObject({ type: 'next' })
    // Hébergé : mêmes attributs que le premier cookie.
    const hosted = await decideProxy(input({ host: 'preview.conduit.com', env, nowSeconds: later, cookies: { kz_preview: t } }))
    expect(hosted.type === 'next' && hosted.setCookies?.[0]).toMatchObject({ sameSite: 'none', secure: true, partitioned: true })
  })
  it('renouvellement : un jeton plus long (moteur, 2 h) n’est jamais raccourci ; un jeton échu n’est pas ranimé', async () => {
    const engine = await signPreviewToken(SECRET, 'kz-engine', NOW, 7_200)
    const d = await p({ pathname: '/', cookies: { kz_preview: engine }, nowSeconds: NOW + 60 })
    const cookie = d.type === 'next' ? d.setCookies?.[0] : undefined
    expect(cookie?.maxAge).toBe(7_200 - 60)
    expect(await verifyPreviewToken(SECRET, cookie?.value, NOW + 60)).toEqual({ exp: NOW + 7_200, userId: 'kz-engine' })
    // Dans la marge d'horloge de 30 s mais échu : 403, pas de nouveau cookie.
    const t = await token(900)
    expect(await p({ pathname: '/', cookies: { kz_preview: t }, nowSeconds: NOW + 910 })).toMatchObject({ type: 'respond', status: 403 })
    // Refus : aucun cookie posé.
    expect(await p({ pathname: '/', cookies: { kz_preview: 'wrong' } })).not.toHaveProperty('setCookies')
  })
  it('régression SEC-09 : le secret racine brut est refusé, en paramètre comme en cookie', async () => {
    expect(await p({ pathname: '/blog', search: `?kz_preview=${SECRET}` })).toMatchObject({ type: 'respond', status: 403 })
    expect(await p({ pathname: '/blog', cookies: { kz_preview: SECRET } })).toMatchObject({ type: 'respond', status: 403 })
  })
  it('jeton signé avec un autre secret → 403', async () => {
    const other = await signPreviewToken('another-secret-0123456789abcdef', 'user-1', NOW)
    expect(await p({ pathname: '/', cookies: { kz_preview: other } })).toMatchObject({ type: 'respond', status: 403 })
  })
  it('ferme /admin, /studio, /api/draft-mode et /api/revalidate (FOLLOWUPS #1) même avec un jeton', async () => {
    const t = await token()
    for (const pathname of ['/admin', '/admin/login', '/admin/media/upload', '/studio', '/studio/desk', '/api/draft-mode/enable', '/api/revalidate']) {
      expect(await p({ pathname, cookies: { kz_preview: t } }), pathname).toMatchObject({ type: 'respond', status: 404 })
    }
    // Hors aperçu, /api/revalidate reste joignable (protégé par son en-tête).
    expect(await decideProxy(input({ pathname: '/api/revalidate', method: 'POST' }))).toEqual({ type: 'next' })
  })
  it('secret absent ou trop court → tout est refusé (503) et journalisé', async () => {
    const d = await decideProxy(input({ env: { ...env, ENGINE_PREVIEW_SECRET: 'short' }, cookies: { kz_preview: 'short' } }))
    expect(d).toMatchObject({ type: 'log-and-respond', status: 503 })
  })
  it('hébergé : cookie SameSite=None; Secure; Partitioned', async () => {
    const t = await token()
    const d = await decideProxy(input({ host: 'preview.conduit.com', env, nowSeconds: NOW, search: `?kz_preview=${t}` }))
    expect(d.type === 'redirect' && d.setCookies?.[0]).toMatchObject({ sameSite: 'none', secure: true, partitioned: true })
  })
})

describe('utilitaires', () => {
  it('timingSafeEqualString', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true)
    expect(timingSafeEqualString('abc', 'abd')).toBe(false)
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false)
    expect(timingSafeEqualString('', 'a')).toBe(false)
  })
  it('previewFrameAncestors n’accepte qu’une origine', () => {
    expect(previewFrameAncestors('http://127.0.0.1:4040')).toBe('http://127.0.0.1:4040')
    expect(previewFrameAncestors('https://conduit.com/')).toBe('https://conduit.com')
    expect(previewFrameAncestors('https://conduit.com/admin')).toBe("'none'")
    expect(previewFrameAncestors("https://a.com 'unsafe-inline'")).toBe("'none'")
    expect(previewFrameAncestors(undefined)).toBe("'none'")
  })
})
