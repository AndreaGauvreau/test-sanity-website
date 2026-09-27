import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /admin/api/auth/editor-access (bouton « Edit with AI » du site en ligne, question 9).
 * Vraie session.ts avec un faux Next (cookies / en-têtes en mémoire) et le vrai manifeste (src/admin.config.ts) ;
 * seul `can` du contrat est espionné pour simuler un rôle sans `ai.editor` (aucun rôle actuel n'en est privé).
 */

type Jar = Map<string, string>
const state: { jar: Jar; headers: Headers } = { jar: new Map(), headers: new Headers() }

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { name, value: state.jar.get(name)! } : undefined),
    set: () => {},
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
vi.mock('@/admin/core/contracts/roles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/admin/core/contracts/roles')>()
  return { ...actual, can: vi.fn(actual.can) }
})

const roles = await import('@/admin/core/contracts/roles')
const { sealSession } = await import('@/admin/core/auth/crypto')
const { resetDevWarnings } = await import('@/admin/core/auth/dev')
const { GET } = await import('./route')

const SECRET = 's'.repeat(40)
const BASE = 'http://127.0.0.1:4040/admin/api/auth/editor-access'
const HOME_HREF = '/admin/editor?page=home&back=%2Fadmin%2Fpages%2Fhome'

const call = (path?: string) => GET(new Request(path === undefined ? BASE : `${BASE}?path=${encodeURIComponent(path)}`))

async function signIn(role: 'client' | 'editor') {
  const { value } = await sealSession(
    { user: { id: 'u1', name: 'Marie', email: 'm@c.com' }, role, sanityRoles: [role === 'client' ? 'administrator' : 'editor'], sanityToken: 'user-token-abcdef', dev: false },
    SECRET,
  )
  state.jar.set('kz_admin', value)
}

beforeEach(() => {
  state.jar = new Map()
  state.headers = new Headers({ host: '127.0.0.1:4040' })
  vi.stubEnv('ADMIN_SESSION_SECRET', SECRET)
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('ADMIN_DEV_AUTOLOGIN', '')
  vi.stubEnv('KZ_EDITOR_PREVIEW', '')
  resetDevWarnings()
  vi.mocked(roles.can).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(roles.can).mockImplementation((role, cap) => roles.CAPABILITIES[role].includes(cap))
})

describe('GET /admin/api/auth/editor-access', () => {
  it('sans session : canEdit false (200, no-store), sans redirection', async () => {
    const res = await call('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ canEdit: false })
  })

  it('session réelle sur une page ouverte à l’éditeur : href vers l’éditeur de la page', async () => {
    await signIn('client')
    const res = await call('/')
    expect(await res.json()).toEqual({ canEdit: true, href: HOME_HREF })
    expect(roles.can).toHaveBeenCalledWith('client', 'ai.editor')
  })

  it('rôle sans ai.editor : canEdit false', async () => {
    await signIn('editor')
    vi.mocked(roles.can).mockImplementation((_role, cap) => cap !== 'ai.editor')
    expect(await (await call('/')).json()).toEqual({ canEdit: false })
  })

  it('page sans aiEditor (/blog), motif d’article, page inconnue ou chemin hostile : canEdit false', async () => {
    await signIn('client')
    for (const path of ['/blog', '/blog/some-article', '/nope', '/admin', 'https://evil.com/', '//evil.com/', undefined]) {
      expect(await (await call(path)).json(), String(path)).toEqual({ canEdit: false })
    }
  })

  it('chemin avec requête, fragment ou barre finale : même page', async () => {
    await signIn('client')
    expect(await (await call('/?utm_source=x#top')).json()).toEqual({ canEdit: true, href: HOME_HREF })
  })

  it('session de dev (ADMIN_DEV_AUTOLOGIN, hôte local) : canEdit true ; « off » : false', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ADMIN_DEV_AUTOLOGIN', 'kuartz')
    expect(await (await call('/')).json()).toEqual({ canEdit: true, href: HOME_HREF })
    state.jar.set('kz_dev_role', 'off')
    expect(await (await call('/')).json()).toEqual({ canEdit: false })
  })

  it('serveur d’aperçu (KZ_EDITOR_PREVIEW=1) : jamais de session, canEdit false', async () => {
    await signIn('client')
    vi.stubEnv('KZ_EDITOR_PREVIEW', '1')
    expect(await (await call('/')).json()).toEqual({ canEdit: false })
  })

  it('secret de session absent : canEdit false plutôt qu’une erreur', async () => {
    await signIn('client')
    vi.stubEnv('ADMIN_SESSION_SECRET', '')
    const res = await call('/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ canEdit: false })
  })

  it('la réponse ne contient ni identité, ni rôle, ni jeton', async () => {
    await signIn('client')
    const text = await (await call('/')).text()
    expect(text).not.toMatch(/Marie|m@c\.com|user-token|client|u1/)
  })
})
