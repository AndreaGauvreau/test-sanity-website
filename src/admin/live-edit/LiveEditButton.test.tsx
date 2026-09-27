/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Bouton « Edit with AI » du site en ligne (question 9) : rien tant que la route ne répond pas canEdit: true.
const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

const { LiveEditButton, editorHrefFromResponse, resetLiveEditCache, EDITOR_ACCESS_ENDPOINT } = await import('./LiveEditButton')

const HREF = '/admin/editor?page=home&back=%2Fadmin%2Fpages%2Fhome'

type Listener = () => void
function stubViewport(desktop: boolean) {
  const listeners = new Set<Listener>()
  const media = {
    matches: desktop,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  return {
    widen() {
      media.matches = true
      listeners.forEach((fn) => fn())
    },
  }
}

function deferredFetch() {
  let resolve!: (res: Response) => void
  const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)))
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, respond: (body: unknown, status = 200) => resolve(new Response(JSON.stringify(body), { status })) }
}

beforeEach(() => {
  nav.pathname = '/'
  resetLiveEditCache()
  stubViewport(true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LiveEditButton', () => {
  it('ne rend rien pendant la requête, puis la pilule si canEdit', async () => {
    const { fetchMock, respond } = deferredFetch()
    const { container } = render(<LiveEditButton />)
    expect(container.innerHTML).toBe('')
    expect(fetchMock).toHaveBeenCalledWith(`${EDITOR_ACCESS_ENDPOINT}?path=%2F`, expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }))
    await act(async () => respond({ canEdit: true, href: HREF }))
    const link = await screen.findByRole('link', { name: 'Edit with AI' })
    expect(link.getAttribute('href')).toBe(HREF)
  })

  it('canEdit false, erreur HTTP ou réseau : rien', async () => {
    for (const outcome of [{ body: { canEdit: false } }, { body: { error: 'x' }, status: 500 }, null]) {
      resetLiveEditCache()
      if (outcome) {
        const { respond } = deferredFetch()
        const { container, unmount } = render(<LiveEditButton />)
        await act(async () => respond(outcome.body, outcome.status))
        await new Promise((r) => setTimeout(r, 20))
        expect(container.innerHTML).toBe('')
        unmount()
      } else {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))))
        const { container, unmount } = render(<LiveEditButton />)
        await new Promise((r) => setTimeout(r, 20))
        expect(container.innerHTML).toBe('')
        unmount()
      }
    }
  })

  it('lien hors de l’éditeur dans la réponse : ignoré', () => {
    expect(editorHrefFromResponse({ canEdit: true, href: 'https://evil.com/admin/editor?page=home' })).toBeNull()
    expect(editorHrefFromResponse({ canEdit: true, href: '/admin/settings' })).toBeNull()
    expect(editorHrefFromResponse({ canEdit: 'true', href: HREF })).toBeNull()
    expect(editorHrefFromResponse(null)).toBeNull()
    expect(editorHrefFromResponse({ canEdit: true, href: HREF })).toBe(HREF)
  })

  it('sous 1 024 px : aucune requête ; la requête part si la fenêtre s’élargit', async () => {
    const viewport = stubViewport(false)
    const { fetchMock, respond } = deferredFetch()
    render(<LiveEditButton />)
    expect(fetchMock).not.toHaveBeenCalled()
    act(() => viewport.widen())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => respond({ canEdit: true, href: HREF }))
    expect(await screen.findByRole('link', { name: 'Edit with AI' })).toBeTruthy()
  })

  it('dans une iframe (Presentation, aperçu) : aucune requête', () => {
    const { fetchMock } = deferredFetch()
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window)
    const { container } = render(<LiveEditButton />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.innerHTML).toBe('')
    vi.restoreAllMocks()
  })

  it('changement de page : la pilule de l’ancienne page disparaît jusqu’à la nouvelle réponse', async () => {
    const first = deferredFetch()
    const { rerender, container } = render(<LiveEditButton />)
    await act(async () => first.respond({ canEdit: true, href: HREF }))
    await screen.findByRole('link', { name: 'Edit with AI' })

    const second = deferredFetch()
    nav.pathname = '/blog'
    rerender(<LiveEditButton />)
    expect(second.fetchMock).toHaveBeenCalledWith(`${EDITOR_ACCESS_ENDPOINT}?path=%2Fblog`, expect.anything())
    expect(container.querySelector('a')).toBeNull()
    await act(async () => second.respond({ canEdit: false }))
    await waitFor(() => expect(container.querySelector('a')).toBeNull())
  })
})
