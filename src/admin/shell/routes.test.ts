import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Routes minces de la coque, avec un faux auth-core et un faux habillage :
 * - layout (shell) : page refusée → notFound() lancé PAR LE LAYOUT, avant tout rendu (vraie 404, FOLLOWUPS #21) ;
 * - /admin/[...missing] : session d'abord, puis notFound() (404 de l'admin et non du site, FOLLOWUPS #25) ;
 * - src/app/admin/not-found.tsx : dans la coque avec une session, plein écran sinon.
 */

const state = vi.hoisted(() => ({
  session: null as null | { role: 'kuartz' | 'client' | 'editor'; dev: boolean },
  path: null as string | null,
  calls: [] as string[],
  chromeFails: false,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
  notFound: () => {
    state.calls.push('notFound')
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(state.path === null ? {} : { 'x-kz-path': state.path }),
}))
vi.mock('@/admin/core/auth/session', () => ({
  requireSession: async () => {
    state.calls.push('requireSession')
    if (!state.session) throw new Error('REDIRECT /admin/login')
    return state.session
  },
  getSession: async () => state.session,
}))
vi.mock('@/admin/shell/ShellChrome', () => ({
  loadShellSidebarProps: async () => {
    state.calls.push('loadShellSidebarProps')
    if (state.chromeFails) throw new Error('boom')
    return { sidebar: true }
  },
  ShellChrome: function ShellChrome() {
    return null
  },
}))

const { default: ShellLayout } = await import('@/app/admin/(shell)/layout')
const { default: MissingPage } = await import('@/app/admin/[...missing]/page')
const { default: AdminNotFound } = await import('@/app/admin/not-found')
const { ShellChrome } = await import('@/admin/shell/ShellChrome')
const { ShellNotFound } = await import('@/admin/shell/states/ShellNotFound')

type El = { type: unknown; props: { sidebar?: unknown; standalone?: boolean; children?: El } }

beforeEach(() => {
  state.session = { role: 'kuartz', dev: true }
  state.path = '/admin'
  state.calls = []
  state.chromeFails = false
})

describe('layout (shell)', () => {
  it('page refusée au rôle (Team en Kuartz, Code en client) → notFound() du layout, avant l’habillage', async () => {
    state.path = '/admin/settings/team'
    await expect(ShellLayout({ children: 'page' })).rejects.toThrow('NOT_FOUND')
    expect(state.calls).toEqual(['requireSession', 'notFound'])

    state.calls = []
    state.session = { role: 'client', dev: false }
    state.path = '/admin/settings/code?x=1'
    await expect(ShellLayout({ children: 'page' })).rejects.toThrow('NOT_FOUND')
    expect(state.calls).toEqual(['requireSession', 'notFound'])
  })

  it('page permise → la coque habillée entoure la page', async () => {
    state.path = '/admin/settings/code'
    const el = (await ShellLayout({ children: 'page' })) as unknown as El
    expect(el.type).toBe(ShellChrome)
    expect(el.props.sidebar).toEqual({ sidebar: true })
    expect(el.props.children).toBe('page')
    expect(state.calls).toEqual(['requireSession', 'loadShellSidebarProps'])
  })

  it('en-tête de chemin absent : pas de refus ici (la garde de la page reste)', async () => {
    state.path = null
    const el = (await ShellLayout({ children: 'page' })) as unknown as El
    expect(el.type).toBe(ShellChrome)
  })

  it('sans session : la redirection de requireSession passe avant tout', async () => {
    state.session = null
    state.path = '/admin/settings/team'
    await expect(ShellLayout({ children: 'page' })).rejects.toThrow('REDIRECT /admin/login')
    expect(state.calls).toEqual(['requireSession'])
  })
})

describe('/admin/[...missing]', () => {
  it('session puis notFound()', async () => {
    await expect(MissingPage()).rejects.toThrow('NOT_FOUND')
    expect(state.calls).toEqual(['requireSession', 'notFound'])
  })

  it('sans session : A1, sans révéler que la page n’existe pas', async () => {
    state.session = null
    await expect(MissingPage()).rejects.toThrow('REDIRECT /admin/login')
    expect(state.calls).toEqual(['requireSession'])
  })
})

describe('404 de l’admin (src/app/admin/not-found.tsx)', () => {
  it('avec une session : dans la coque (sidebar utilisable)', async () => {
    const el = (await AdminNotFound()) as unknown as El
    expect(el.type).toBe(ShellChrome)
    expect(el.props.children?.type).toBe(ShellNotFound)
    expect(el.props.children?.props.standalone).toBeUndefined()
  })

  it('sans session : plein écran', async () => {
    state.session = null
    const el = (await AdminNotFound()) as unknown as El
    expect(el.type).toBe(ShellNotFound)
    expect(el.props.standalone).toBe(true)
  })

  it('habillage en échec : plein écran plutôt qu’une erreur', async () => {
    state.chromeFails = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = (await AdminNotFound()) as unknown as El
    expect(el.type).toBe(ShellNotFound)
    expect(el.props.standalone).toBe(true)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
