import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Route A1 (src/app/admin/login/page.tsx) avec un faux auth-core : redirection si déjà connecté, `next` nettoyé,
 * message d'erreur selon `?error=`, état de la connexion de dev. La page renvoie <LoginScreen …/> : on lit ses props.
 */

const auth = vi.hoisted(() => ({
  session: null as null | { role: string },
  providers: { providers: [] as { name: string; title: string; href: string }[], error: undefined as string | undefined },
  dev: { available: false, activeRole: null, roles: ['kuartz', 'client', 'editor'] },
  providersNext: [] as (string | null | undefined)[],
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('@/admin/core/auth/session', () => ({
  getSession: async () => auth.session,
  getLoginProviders: async (next?: string | null) => {
    auth.providersNext.push(next)
    return auth.providers
  },
  getDevLoginState: async () => auth.dev,
}))

const { default: LoginPage } = await import('@/app/admin/login/page')

type ScreenProps = {
  providers: unknown[]
  error: string | null
  retryHref: string
  dev: { roles: string[]; next: string } | null
  site: { name: string; domain: string }
}

async function renderPage(params: Record<string, string | string[] | undefined>): Promise<ScreenProps> {
  const element = (await LoginPage({ searchParams: Promise.resolve(params) })) as { props: ScreenProps }
  return element.props
}

beforeEach(() => {
  auth.session = null
  auth.providers = { providers: [{ name: 'google', title: 'Google', href: '/admin/api/auth/login?provider=google' }], error: undefined }
  auth.dev = { available: false, activeRole: null, roles: ['kuartz', 'client', 'editor'] }
  auth.providersNext = []
})

describe('page A1 (/admin/login)', () => {
  it('déjà connecté → redirection vers /admin, ou vers `next` nettoyé', async () => {
    auth.session = { role: 'client' }
    await expect(renderPage({})).rejects.toThrow('REDIRECT /admin')
    await expect(renderPage({ next: '/admin/media?q=1' })).rejects.toThrow('REDIRECT /admin/media?q=1')
    await expect(renderPage({ next: 'https://evil.com' })).rejects.toThrow('REDIRECT /admin')
    await expect(renderPage({ next: '/admin/login' })).rejects.toThrow('REDIRECT /admin')
  })

  it('non connecté : fournisseurs de Sanity, site du manifeste, pas d’erreur', async () => {
    const props = await renderPage({})
    expect(props.site).toEqual({ name: 'Conduit', domain: 'conduit.com' })
    expect(props.providers).toHaveLength(1)
    expect(props.error).toBeNull()
    expect(props.dev).toBeNull()
    expect(props.retryHref).toBe('/admin/login')
    expect(auth.providersNext).toEqual([null])
  })

  it('`next` nettoyé transmis aux fournisseurs et au lien « Try again »', async () => {
    const props = await renderPage({ next: ['/admin/cms/blog', '/x'] })
    expect(auth.providersNext).toEqual(['/admin/cms/blog'])
    expect(props.retryHref).toBe('/admin/login?next=%2Fadmin%2Fcms%2Fblog')
    await renderPage({ next: '//evil.com/admin' })
    expect(auth.providersNext[1]).toBeNull()
  })

  it('?error=provider → message anglais ; code inconnu → rien', async () => {
    expect((await renderPage({ error: 'provider' })).error).toBe("Couldn't reach this sign-in provider. Please try again.")
    expect((await renderPage({ error: '<script>' })).error).toBeNull()
  })

  it('Sanity injoignable → message des fournisseurs', async () => {
    auth.providers = { providers: [], error: "Sanity isn't responding. Please try again in a moment." }
    const props = await renderPage({})
    expect(props.providers).toEqual([])
    expect(props.error).toBe("Sanity isn't responding. Please try again in a moment.")
  })

  it('connexion de dev disponible (suspendue par Log out) → rôles proposés avec `next`', async () => {
    auth.dev = { available: true, activeRole: null, roles: ['kuartz', 'client', 'editor'] }
    const props = await renderPage({ next: '/admin/media' })
    expect(props.dev).toEqual({ roles: ['kuartz', 'client', 'editor'], next: '/admin/media' })
  })
})
