import { describe, expect, it } from 'vitest'

import { decideProxy, previewFrameAncestors, timingSafeEqualString, type ProxyInput } from './proxy-rules'

const SECRET = 'preview-secret-0123456789abcdef'

function input(over: Partial<ProxyInput> = {}): ProxyInput {
  return { method: 'GET', pathname: '/', search: '', host: '127.0.0.1:4040', cookies: {}, env: { NODE_ENV: 'production' }, ...over }
}

describe('proxy — mode normal', () => {
  it('ne touche pas au site public', () => {
    for (const pathname of ['/', '/blog', '/blog/x', '/administrator', '/api/revalidate']) {
      expect(decideProxy(input({ pathname }))).toEqual({ type: 'next' })
    }
  })
  it('sans cookie : /admin/** redirige vers A1 avec next', () => {
    expect(decideProxy(input({ pathname: '/admin/media', search: '?q=1' }))).toMatchObject({
      type: 'redirect',
      location: '/admin/login?next=%2Fadmin%2Fmedia%3Fq%3D1',
      responseHeaders: { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" },
    })
    expect(decideProxy(input({ pathname: '/admin' }))).toMatchObject({ type: 'redirect', location: '/admin/login' })
  })
  it('laisse passer A1, le retour de connexion et les routes d’auth, avec les en-têtes anti-iframe', () => {
    for (const pathname of ['/admin/login', '/admin/auth/callback', '/admin/api/auth/session']) {
      const d = decideProxy(input({ pathname }))
      expect(d.type).toBe('next')
      expect(d.responseHeaders?.['X-Frame-Options']).toBe('DENY')
    }
  })
  it('API sans session → 401 JSON ; POST de page → laissé à requireSession', () => {
    expect(decideProxy(input({ pathname: '/admin/api/engine/health' }))).toMatchObject({ type: 'respond', status: 401 })
    expect(decideProxy(input({ pathname: '/admin/pages', method: 'POST' })).type).toBe('next')
  })
  it('avec cookie : passe et réécrit x-kz-path', () => {
    const d = decideProxy(input({ pathname: '/admin/pages', search: '?a=1', cookies: { kz_admin: 'x' } }))
    expect(d).toMatchObject({ type: 'next', requestHeaders: { 'x-kz-path': '/admin/pages?a=1' } })
  })
  it('autologin de dev : seulement NODE_ENV=development + hôte local', () => {
    const env = { NODE_ENV: 'development', ADMIN_DEV_AUTOLOGIN: 'client' }
    expect(decideProxy(input({ pathname: '/admin', env })).type).toBe('next')
    expect(decideProxy(input({ pathname: '/admin', env, host: 'conduit.com' })).type).toBe('redirect')
    expect(decideProxy(input({ pathname: '/admin', env: { ...env, NODE_ENV: 'production' } })).type).toBe('redirect')
    expect(decideProxy(input({ pathname: '/admin', env, cookies: { kz_dev_role: 'off' } })).type).toBe('redirect')
  })
})

describe('proxy — mode aperçu (KZ_EDITOR_PREVIEW=1)', () => {
  const env = { NODE_ENV: 'development', KZ_EDITOR_PREVIEW: '1', ENGINE_PREVIEW_SECRET: SECRET, ADMIN_ORIGIN: 'http://127.0.0.1:4040' }
  const p = (over: Partial<ProxyInput>) => decideProxy(input({ host: '127.0.0.1:4042', env, ...over }))

  it('refuse sans secret', () => {
    expect(p({ pathname: '/' })).toMatchObject({ type: 'respond', status: 403 })
    expect(p({ pathname: '/', cookies: { kz_preview: 'wrong' } })).toMatchObject({ type: 'respond', status: 403 })
  })
  it('cookie correct → passe, frame-ancestors = ADMIN_ORIGIN', () => {
    const d = p({ pathname: '/blog', cookies: { kz_preview: SECRET } })
    expect(d).toMatchObject({ type: 'next', responseHeaders: { 'Content-Security-Policy': 'frame-ancestors http://127.0.0.1:4040' } })
  })
  it('?kz_preview=<secret> → pose le cookie et redirige sans le paramètre', () => {
    const d = p({ pathname: '/blog', search: `?kz_preview=${SECRET}&x=1` })
    expect(d).toMatchObject({ type: 'redirect', location: '/blog?x=1' })
    expect(d.type === 'redirect' && d.setCookies?.[0]).toMatchObject({ name: 'kz_preview', value: SECRET, httpOnly: true, path: '/', sameSite: 'lax', secure: false })
    expect(p({ pathname: '/', search: '?kz_preview=nope' })).toMatchObject({ type: 'respond', status: 403 })
  })
  it('ferme /admin, /studio, /api/draft-mode même avec le secret', () => {
    for (const pathname of ['/admin', '/admin/login', '/studio', '/studio/desk', '/api/draft-mode/enable']) {
      expect(p({ pathname, cookies: { kz_preview: SECRET } })).toMatchObject({ type: 'respond', status: 404 })
    }
  })
  it('secret absent ou trop court → tout est refusé (503) et journalisé', () => {
    const d = decideProxy(input({ env: { ...env, ENGINE_PREVIEW_SECRET: 'short' }, cookies: { kz_preview: 'short' } }))
    expect(d).toMatchObject({ type: 'log-and-respond', status: 503 })
  })
  it('hébergé : cookie SameSite=None; Secure; Partitioned', () => {
    const d = decideProxy(input({ host: 'preview.conduit.com', env, search: `?kz_preview=${SECRET}` }))
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
