import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * session.ts avec un faux Next : cookies() / headers() en mémoire, redirect() et notFound() qui lèvent.
 * Vérifie les trois contextes (page, action, route), l'autologin de dev et la déconnexion.
 */

type Jar = Map<string, { value: string; options?: Record<string, unknown> }>
const state: { jar: Jar; headers: Headers } = { jar: new Map(), headers: new Headers() }

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { name, value: state.jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      state.jar.set(name, { value, options })
    },
  }),
  headers: async () => state.headers,
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

const session = await import('./session')
const { sealSession } = await import('./crypto')
const { resetDevWarnings } = await import('./dev')

const SECRET = 's'.repeat(40)
const real = {
  user: { id: 'u1', name: 'Marie', email: 'm@c.com' },
  role: 'client' as const,
  sanityRoles: ['administrator'],
  sanityToken: 'user-token-abcdef',
  dev: false,
}

beforeEach(() => {
  state.jar = new Map()
  state.headers = new Headers({ host: '127.0.0.1:4040', 'x-kz-path': '/admin/media?q=1' })
  vi.stubEnv('ADMIN_SESSION_SECRET', SECRET)
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('ADMIN_DEV_AUTOLOGIN', '')
  resetDevWarnings()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function withCookie() {
  const { value } = await sealSession(real, SECRET)
  state.jar.set('kz_admin', { value })
}

describe('requireSession', () => {
  it('page sans session → redirection vers A1 avec next', async () => {
    await expect(session.requireSession('page')).rejects.toThrow('REDIRECT /admin/login?next=%2Fadmin%2Fmedia%3Fq%3D1')
  })
  it('action / route sans session → AdminAuthError 401', async () => {
    await expect(session.requireSession('action')).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
    const err = await session.requireSession('route').catch((e) => e)
    const res = session.authErrorResponse(err)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: 'Your session has expired. Sign in again.' } })
  })
  it('cookie valide → session (jeton compris, côté serveur)', async () => {
    await withCookie()
    const s = await session.requireSession('route')
    expect(s).toMatchObject({ role: 'client', sanityToken: 'user-token-abcdef', dev: false })
  })
  it('régression SEC-05 : un cookie « kuartz » d’un Developer hors KUARTZ_ALLOWLIST est lu comme editor', async () => {
    const { value } = await sealSession({ ...real, role: 'kuartz', sanityRoles: ['developer'], user: { ...real.user, email: 'dev@tiers.com' } }, SECRET)
    state.jar.set('kz_admin', { value })
    vi.stubEnv('KUARTZ_ALLOWLIST', '@kuartz.studio')
    expect((await session.requireSession('route')).role).toBe('editor')
    await expect(session.requireCapability('settings.code', 'route')).rejects.toMatchObject({ status: 403 })
    vi.stubEnv('KUARTZ_ALLOWLIST', 'dev@tiers.com')
    expect((await session.requireSession('route')).role).toBe('kuartz')
  })
  it('serveur d’aperçu (KZ_EDITOR_PREVIEW=1) : aucune session, même avec un cookie valide', async () => {
    await withCookie()
    vi.stubEnv('KZ_EDITOR_PREVIEW', '1')
    await expect(session.requireSession('route')).rejects.toMatchObject({ status: 401 })
  })
  it('getPublicSession ne contient jamais le jeton', async () => {
    await withCookie()
    const pub = await session.getPublicSession()
    expect(pub).not.toHaveProperty('sanityToken')
    expect(JSON.stringify(pub)).not.toContain('user-token')
  })
})

describe('requireCapability', () => {
  it('page sans le droit → 404 ; action/route → 403', async () => {
    await withCookie()
    await expect(session.requireCapability('settings.code', 'page')).rejects.toThrow('NOT_FOUND')
    await expect(session.requireCapability('publish.diff', 'action')).rejects.toMatchObject({ status: 403, code: 'forbidden' })
    await expect(session.requireCapability('settings.team', 'route')).resolves.toMatchObject({ role: 'client' })
  })
  it('authErrorResponse relance les autres erreurs', () => {
    expect(() => session.authErrorResponse(new Error('boom'))).toThrow('boom')
  })
})

describe('autologin de développement', () => {
  it('development + hôte local → session dev sans jeton', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ADMIN_DEV_AUTOLOGIN', 'kuartz')
    expect(await session.requireSession('route')).toMatchObject({ role: 'kuartz', dev: true, sanityToken: null })
  })
  it('sélecteur de rôle (kz_dev_role)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ADMIN_DEV_AUTOLOGIN', 'kuartz')
    state.jar.set('kz_dev_role', { value: 'editor' })
    expect((await session.requireSession('route')).role).toBe('editor')
    expect(await session.getDevLoginState()).toMatchObject({ available: true, activeRole: 'editor' })
  })
  it('refusé hors dev ou hors hôte local, avec un log bruyant', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('ADMIN_DEV_AUTOLOGIN', 'kuartz')
    await expect(session.requireSession('route')).rejects.toMatchObject({ status: 401 })
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/ADMIN_DEV_AUTOLOGIN is set but IGNORED because NODE_ENV/))
    vi.stubEnv('NODE_ENV', 'development')
    state.headers = new Headers({ host: 'conduit.com' })
    await expect(session.requireSession('route')).rejects.toMatchObject({ status: 401 })
    expect(await session.getDevLoginState()).toMatchObject({ available: false })
  })
  it('une vraie session reste prioritaire', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ADMIN_DEV_AUTOLOGIN', 'kuartz')
    await withCookie()
    expect((await session.requireSession('route')).dev).toBe(false)
  })
})

describe('cookie et déconnexion', () => {
  it('writeSessionCookie : httpOnly, SameSite=Lax, path=/admin, Secure hors localhost', async () => {
    await session.writeSessionCookie(real)
    expect(state.jar.get('kz_admin')?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/admin', secure: false, maxAge: 43200 })
    state.headers = new Headers({ host: 'conduit.com' })
    await session.writeSessionCookie(real)
    expect(state.jar.get('kz_admin')?.options).toMatchObject({ secure: true })
  })
  it('logout : révoque le jeton chez Sanity puis efface le cookie ; en dev, suspend l’autologin', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'testproj')
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ADMIN_DEV_AUTOLOGIN', 'client')
    await withCookie()
    await session.logout()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://testproj.api.sanity.io/v2021-06-07/auth/logout')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer user-token-abcdef')
    expect(state.jar.get('kz_admin')).toMatchObject({ value: '', options: { maxAge: 0 } })
    expect(state.jar.get('kz_dev_role')?.value).toBe('off')
  })
})
