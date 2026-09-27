/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { adminConfig } from '@/admin.config'
import { ADMIN_ROLES } from '@/admin/core/contracts/roles'
import { ToastProvider } from '@/admin/ui'

const nav = vi.hoisted(() => ({ pathname: '/admin', refresh: vi.fn() }))
const askAi = vi.hoisted(() => ({ open: vi.fn() }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ refresh: nav.refresh, push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} data-next-link="" {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/admin/features/ask-ai/AskAiProvider', () => ({
  useAskAi: () => ({ open: askAi.open, close: vi.fn(), isOpen: false }),
}))

const { ShellSidebar, LOGOUT_ENDPOINT } = await import('./ShellSidebar')
const { buildShellSidebarProps } = await import('./sidebar-props')

const counts = { blog: 12, testimonials: 3, faq: 9 }

function setup(role: 'kuartz' | 'client' | 'editor', pathname: string, dev = false) {
  nav.pathname = pathname
  const props = buildShellSidebarProps({
    config: adminConfig,
    session: { user: { id: 'u', name: 'Marie', email: 'm@c.com' }, role, dev },
    counts,
    hubUrlEnv: 'https://hub.example.com',
    devState: { available: true, roles: ADMIN_ROLES },
  })
  return render(
    <div data-kz-admin="">
      <ToastProvider>
        <ShellSidebar {...props} />
      </ToastProvider>
    </div>,
  )
}

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
  nav.refresh.mockReset()
  askAi.open.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  MotionGlobalConfig.skipAnimations = false
})

describe('ShellSidebar', () => {
  it('client : Team (CLIENT), pas de Code ni de hub ; comptes des collections et de la page article', () => {
    setup('client', '/admin')
    const navEl = screen.getByRole('navigation', { name: 'Admin' })
    expect((within(navEl).getByRole('link', { name: /Team/ })).textContent).toContain('CLIENT')
    expect(within(navEl).queryByRole('link', { name: /Code/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Kuartz hub/ })).toBeNull()
    expect((within(navEl).getByRole('link', { name: /Blog/ })).textContent).toContain('12')
    expect((within(navEl).getByRole('link', { name: /Testimonials/ })).textContent).toContain('3')
    expect((within(navEl).getByRole('link', { name: /slug:/ })).textContent).toContain('12')
    expect(screen.getByText('Marie · Client admin')).toBeTruthy()
  })

  it('Kuartz : Code (KUARTZ) et « Kuartz hub » dans un nouvel onglet', () => {
    setup('kuartz', '/admin')
    expect((screen.getByRole('link', { name: /Code/ })).textContent).toContain('KUARTZ')
    expect(screen.queryByRole('link', { name: /Team/ })).toBeNull()
    const hub = screen.getByRole('link', { name: /Kuartz hub/ })
    expect((hub).getAttribute('href')).toBe('https://hub.example.com/')
    expect((hub).getAttribute('target')).toBe('_blank')
    expect((hub).getAttribute('rel')).toBe('noopener noreferrer')
    expect((hub).textContent).toContain('(opens in a new tab)')
  })

  it('entrée active selon l’URL (aria-current) et écran courant après le domaine', () => {
    setup('client', '/admin/cms/blog/post-1')
    const current = document.querySelectorAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect((current[0]).textContent).toContain('Blog')
    expect((current[0]).getAttribute('href')).toBe('/admin/cms/blog')
    expect(screen.getByText('conduit.com · Blog')).toBeTruthy()
  })

  it('Overview : aucune entrée active, « conduit.com · Overview »', () => {
    setup('client', '/admin')
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0)
    expect(screen.getByText('conduit.com · Overview')).toBeTruthy()
  })

  it('page article active : la page listing reste dépliée', () => {
    setup('client', '/admin/pages/blog/slug/seo')
    expect((screen.getByRole('link', { name: /slug:/ })).getAttribute('aria-current')).toBe('page')
    expect((screen.getByRole('button', { name: 'Hide /blog pages' })).getAttribute('aria-expanded')).toBe('true')
  })

  it('le chevron replie la page article', async () => {
    setup('client', '/admin')
    await userEvent.click(screen.getByRole('button', { name: 'Hide /blog pages' }))
    expect(screen.queryByRole('link', { name: /slug:/ })).toBeNull()
    expect((screen.getByRole('button', { name: 'Show /blog pages' })).getAttribute('aria-expanded')).toBe('false')
  })

  it('« Ask AI » ouvre Ask AI (useAskAi().open)', async () => {
    setup('editor', '/admin')
    await userEvent.click(screen.getByRole('button', { name: 'Ask AI' }))
    expect(askAi.open).toHaveBeenCalledTimes(1)
  })

  it('Log out : formulaire POST vers la route de déconnexion (sans JavaScript)', () => {
    setup('client', '/admin')
    const button = screen.getByRole('button', { name: 'Log out' })
    const form = button.closest('form')!
    expect((form).getAttribute('method')).toBe('post')
    expect((form).getAttribute('action')).toBe(LOGOUT_ENDPOINT)
    expect((button).getAttribute('type')).toBe('submit')
  })

  it('pas de sélecteur de rôle hors session de dev', () => {
    setup('client', '/admin', false)
    expect(screen.queryByRole('button', { name: /Development role/ })).toBeNull()
  })

  it('session de dev : le sélecteur change le rôle (POST dev-role) puis rafraîchit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, role: 'kuartz' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    setup('client', '/admin', true)
    await userEvent.click(screen.getByRole('button', { name: 'Development role: Client admin' }))
    const items = await screen.findAllByRole('menuitemradio')
    expect(items.map((i) => i.textContent)).toEqual(['Kuartz', 'Client admin', 'Editor'])
    expect((items[1]).getAttribute('aria-checked')).toBe('true')
    await userEvent.click(items[0])
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/admin/api/auth/dev-role', expect.objectContaining({ method: 'POST', body: JSON.stringify({ role: 'kuartz' }) }))
  })

  it('session de dev : échec du changement de rôle → toast d’erreur, pas de rafraîchissement', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })))
    setup('kuartz', '/admin', true)
    await userEvent.click(screen.getByRole('button', { name: 'Development role: Kuartz' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Editor' }))
    expect(await screen.findByText("Couldn't switch the development role.")).toBeTruthy()
    expect(nav.refresh).not.toHaveBeenCalled()
  })
})
