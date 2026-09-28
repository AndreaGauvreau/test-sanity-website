/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MediaCard } from '@/admin/ui'

import type { MediaAsset } from '../lib/assets'
import { LIVE_TIMEOUT_MS } from '../lib/usage-preview'
import type { UsagePlaceView } from '../lib/usage'
import { clearPageSnapshots } from './live-page'
import { MINIATURE_NOTES, UsageMiniature, usagePlacesFor } from './UsageMiniature'

// Lecture de la page publique (fetch de même origine) simulée : chaque test décide de la réponse.
const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  fetchMock.mockReset()
  clearPageSnapshots()
})

/** Réponse HTML du site (`fetch`). */
function page(html: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, url: '', headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) }, text: async () => html }
}

const SITE_PAGE = (body: string) =>
  `<!DOCTYPE html><html lang="en"><head><link rel="stylesheet" href="/_next/static/chunks/site.css"><link rel="preload" as="script" href="/_next/static/chunks/main.js"><script src="/_next/static/chunks/main.js" async></script></head><body>${body}<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KK83GHRF"></iframe></noscript><script>self.__next_f.push([1,""])</script></body></html>`

const HASH = '9c3511be851bd0f3eaf2a14385de57d7de0584fa'
const CDN = `https://cdn.sanity.io/images/dwa2djm3/development/${HASH}-2400x1600.jpg`
const PREVIEW = `${CDN}?w=576&h=576&fit=max&auto=format`

const asset = (usages: UsagePlaceView[] = [], over: Partial<MediaAsset> = {}): MediaAsset => ({
  id: `image-${HASH}-2400x1600-jpg`,
  kind: 'image',
  name: 'hero-truck.jpg',
  mimeType: 'image/jpeg',
  extension: 'jpg',
  size: 1_258_291,
  width: 2400,
  height: 1600,
  createdAt: '2026-09-12T10:00:00Z',
  altText: 'Truck backing up to a loading dock',
  thumb: null,
  preview: PREVIEW,
  full: null,
  url: CDN,
  usages,
  ...over,
})

const LIVE = { kind: 'live', path: '/blog/how-to', occurrence: 0 } as const

/**
 * Document rendu dans l'iframe `srcdoc` (simulé : jsdom n'a ni mise en page ni navigation d'iframe) : le parent y lit
 * le DOM, le fait défiler, mesure l'élément. Posé sur le prototype : l'iframe n'existe qu'après la lecture de la page.
 */
function renderedCopy(html: string, element?: { id: string; box: { x: number; y: number; width: number; height: number } }) {
  const doc = document.implementation.createHTMLDocument('copy')
  doc.body.innerHTML = html
  // jsdom ne charge pas les images : elles sont données pour chargées.
  for (const image of Array.from(doc.images)) Object.defineProperty(image, 'complete', { configurable: true, value: true })
  let scrollY = 0
  const root = doc.documentElement
  for (const [key, value] of Object.entries({ clientWidth: 1280, clientHeight: 571, scrollWidth: 1280, scrollHeight: 4000 })) {
    Object.defineProperty(root, key, { configurable: true, value })
  }
  if (element) {
    const node = doc.getElementById(element.id)!
    node.getBoundingClientRect = () => {
      const { x, y, width, height } = element.box
      return { x, y: y - scrollY, left: x, top: y - scrollY, width, height, right: x + width, bottom: y - scrollY + height, toJSON: () => ({}) } as DOMRect
    }
  }
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    scrollY = options.top ?? 0
  })
  const win = { location: { href: 'about:srcdoc' }, scrollX: 0, get scrollY() { return scrollY }, scrollTo } as unknown as Window
  vi.spyOn(HTMLIFrameElement.prototype, 'contentDocument', 'get').mockReturnValue(doc)
  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue(win)
  return { doc, scrollTo }
}

/** Iframe de la copie : elle n'existe qu'après la lecture de la page (asynchrone). */
function findIframe(container: HTMLElement): Promise<HTMLIFrameElement> {
  return waitFor(() => {
    const iframe = container.querySelector('iframe')
    if (!iframe) throw new Error('iframe pas encore rendue')
    return iframe
  })
}

const COVER = `<header><img src="/logo.svg"></header><article><img id="cover" loading="lazy" srcset="${CDN}?w=640 640w, ${CDN}?w=1280 1280w"></article>`

describe('UsageMiniature — page vivante (copie nettoyée)', () => {
  it('lit la page (même origine), puis iframe srcdoc = copie nettoyée : sans script ni noscript (GTM), <base> de la page ; sandbox SANS allow-scripts ; squelette pendant la lecture', async () => {
    fetchMock.mockResolvedValue(page(SITE_PAGE(COVER)))
    const { container } = render(<UsageMiniature asset={asset()} mode={LIVE} />)
    expect(container.querySelector('[data-skeleton]')).not.toBeNull()
    const iframe = await findIframe(container)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/blog/how-to')
    expect(init).toMatchObject({ method: 'GET', mode: 'same-origin', credentials: 'same-origin', cache: 'default' })
    expect(iframe.hasAttribute('src')).toBe(false)
    const copy = iframe.getAttribute('srcdoc')!
    expect(copy.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(copy).toContain(`<base href="${window.location.origin}/blog/how-to">`)
    expect(copy).toContain('rel="stylesheet"')
    expect(copy).toContain(`${CDN}?w=640 640w`)
    expect(copy).not.toMatch(/<script|<noscript|googletagmanager|main\.js/)
    expect(iframe.getAttribute('sandbox')).toBe('allow-same-origin')
    expect(iframe.getAttribute('tabindex')).toBe('-1')
    expect(iframe.getAttribute('aria-hidden')).toBe('true')
    expect(iframe.hasAttribute('inert')).toBe(true)
    // Page desktop de 1280 px réduite à la largeur de la miniature (278), fenêtre de 571 px (→ 124 visibles).
    expect([iframe.style.width, iframe.style.height, iframe.style.transform]).toEqual(['1280px', '571px', 'scale(0.2171875)'])
    expect(container.querySelector('[data-skeleton]')).not.toBeNull()
  })

  it('copie rendue : l’élément qui affiche l’asset est trouvé, la page défile pour le centrer, cadre rouge à l’échelle ; squelette retiré', async () => {
    fetchMock.mockResolvedValue(page(SITE_PAGE(COVER)))
    const { container } = render(<UsageMiniature asset={asset()} mode={LIVE} />)
    const iframe = await findIframe(container)
    const { scrollTo } = renderedCopy(COVER, { id: 'cover', box: { x: 40, y: 900, width: 1200, height: 630 } })
    fireEvent.load(iframe)
    await waitFor(() => expect(container.querySelector('[data-state="ready"]')).not.toBeNull())
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 930, behavior: 'instant' })
    const frame = container.querySelector('iframe ~ span') as HTMLElement
    expect([frame.style.left, frame.style.top, frame.style.width, frame.style.height].map(parseFloat)).toEqual([8.69, 0, 260.63, 124])
    expect(container.querySelector('[data-skeleton]')).toBeNull()
  })

  it('2e emplacement sur la même page : 2e apparition de l’image ; une seule lecture de la page pour les deux miniatures (cache)', async () => {
    const body = `<img id="a" src="${CDN}?w=1200"><p>…</p><img id="b" src="${CDN}?w=600">`
    fetchMock.mockResolvedValue(page(SITE_PAGE(body)))
    const { container } = render(
      <>
        <UsageMiniature asset={asset()} mode={LIVE} />
        <UsageMiniature asset={asset()} mode={{ ...LIVE, occurrence: 1 }} />
      </>,
    )
    const second = await waitFor(() => {
      const frames = container.querySelectorAll('iframe')
      expect(frames).toHaveLength(2)
      return frames[1]
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { doc, scrollTo } = renderedCopy(body)
    const boxes: Record<string, [number, number]> = { a: [0, 100], b: [340, 1400] }
    for (const id of ['a', 'b']) {
      const [x, y] = boxes[id]
      doc.getElementById(id)!.getBoundingClientRect = () => ({ left: x, top: y, width: 600, height: 400 }) as DOMRect
    }
    fireEvent.load(second)
    // Centre de « b » (y 1600) au centre de la fenêtre (285.5).
    await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 1315, behavior: 'instant' }))
  })

  it('page lue sans l’image (publiée sans elle) : repli — l’image en contain, entourée, « Not on the live site yet »', async () => {
    fetchMock.mockResolvedValue(page(SITE_PAGE('<main><h1>Another post</h1></main>')))
    const { container } = render(<UsageMiniature asset={asset()} mode={LIVE} />)
    const iframe = await findIframe(container)
    renderedCopy('<main><h1>Another post</h1></main>')
    fireEvent.load(iframe)
    await waitFor(() => expect(screen.getByText(MINIATURE_NOTES.missing)).toBeTruthy())
    expect(container.querySelector('iframe')).toBeNull()
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe(PREVIEW)
    expect(img.getAttribute('alt')).toBe('')
    // 2400 × 1600 dans 258 × 86 (place gardée pour la mention) : 129 × 86, centré ; le cadre rouge épouse l'image.
    expect([img.style.left, img.style.top, img.style.width, img.style.height]).toEqual(['74.5px', '8px', '129px', '86px'])
    const frame = img.nextElementSibling as HTMLElement
    expect([frame.style.left, frame.style.width]).toEqual(['74.5px', '129px'])
  })

  it('404 (utilisation dans un brouillon seulement) : « Not on the live site yet », sans iframe', async () => {
    fetchMock.mockResolvedValue(page('<h1>Not found</h1>', 404))
    const { container } = render(<UsageMiniature asset={asset()} mode={LIVE} />)
    await waitFor(() => expect(screen.getByText(MINIATURE_NOTES.missing)).toBeTruthy())
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('erreur du site (500) ou du réseau : « Live page unavailable » ; une lecture ratée n’est pas gardée en cache', async () => {
    fetchMock.mockResolvedValueOnce(page('oops', 500)).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const first = render(<UsageMiniature asset={asset()} mode={LIVE} />)
    await waitFor(() => expect(screen.getByText(MINIATURE_NOTES.unavailable)).toBeTruthy())
    first.unmount()
    render(<UsageMiniature asset={asset()} mode={LIVE} />)
    await waitFor(() => expect(screen.getByText(MINIATURE_NOTES.unavailable)).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('page muette : au-delà du délai (20 s), repli « Live page unavailable »', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
    render(<UsageMiniature asset={asset()} mode={LIVE} />)
    await act(async () => {
      vi.advanceTimersByTime(LIVE_TIMEOUT_MS)
    })
    expect(screen.getByText(MINIATURE_NOTES.unavailable)).toBeTruthy()
  })
})

describe('UsageMiniature — réglages et repli', () => {
  it('favicon : FaviconPreview du kit (fond Figma + onglet), cadre rouge autour du favicon', () => {
    const { container } = render(<UsageMiniature asset={asset([], { width: 640, height: 640 })} mode={{ kind: 'favicon', theme: 'dark' }} />)
    expect(container.querySelector('[data-theme-preview="dark"]')).not.toBeNull()
    expect(container.querySelector(`img[src="${PREVIEW}"]`)).not.toBeNull()
    const frame = container.querySelector('[data-mode="favicon"] > span:last-child') as HTMLElement
    expect([frame.style.left, frame.style.top, frame.style.width, frame.style.height]).toEqual(['117px', '38px', '24px', '24px'])
  })

  it('image de partage : SocialPreview du kit réduite, cadre rouge autour de l’image', () => {
    const { container } = render(
      <UsageMiniature asset={asset()} mode={{ kind: 'social', domain: 'conduit.com', title: 'Dock scheduling, solved', description: 'Book docks in minutes.' }} />,
    )
    expect(screen.getByText('conduit.com')).toBeTruthy()
    expect(screen.getByText('Dock scheduling, solved')).toBeTruthy()
    expect(container.querySelector(`img[src="${PREVIEW}"]`)).not.toBeNull()
    const stage = container.querySelector('[data-mode="social"] > span') as HTMLElement
    expect(stage.style.transform).toBe('scale(0.38)')
  })

  it('emplacement sans page (autre réglage) : l’image entourée, sans mention', () => {
    const { container } = render(<UsageMiniature asset={asset()} mode={{ kind: 'fallback', reason: 'none' }} />)
    expect(container.querySelector('[data-mode="fallback"] img')?.getAttribute('src')).toBe(PREVIEW)
    expect(screen.queryByText(MINIATURE_NOTES.missing)).toBeNull()
  })
})

describe('Usage tooltip de la carte : une miniature par emplacement', () => {
  it('au plus 3 pages vivantes, les autres en repli ; « View ↗ » inchangé', async () => {
    const pages = ['/blog/a', '/blog/b', '/faq/c', '/testimonials/d'].map((path, i) => ({
      id: `doc-${i}:image`,
      label: `Blog › Post ${i} — Cover image`,
      siteHref: `https://conduit.com${path}`,
      preview: { kind: 'page' as const, path },
    }))
    const media = asset([...pages, { id: 'siteSettings:faviconLight', label: 'Site settings — Favicon light', preview: { kind: 'favicon', theme: 'light' } }])
    fetchMock.mockImplementation(async (url: string) => page(SITE_PAGE(`<h1>${url}</h1>`)))
    render(<MediaCard name={media.name} usage="Used ×5" usagePlaces={usagePlacesFor(media)} />)
    await userEvent.click(screen.getByRole('button', { name: /Used ×5/ }))
    const dialog = await screen.findByRole('dialog', { name: 'hero-truck.jpg · used in 5 places' })
    // Trois pages lues et rendues (copie de chacune) ; la 4e passe au repli sans être lue.
    await waitFor(() => expect(dialog.querySelectorAll('iframe')).toHaveLength(3))
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/blog/a', '/blog/b', '/faq/c'])
    expect(Array.from(dialog.querySelectorAll('iframe')).map((f) => /<h1>(.*?)<\/h1>/.exec(f.getAttribute('srcdoc') ?? '')?.[1])).toEqual(['/blog/a', '/blog/b', '/faq/c'])
    expect(dialog.querySelectorAll('[data-mode="fallback"]')).toHaveLength(1)
    expect(dialog.querySelectorAll('[data-mode="favicon"]')).toHaveLength(1)
    const views = within(dialog).getAllByRole('link', { name: /View/ })
    expect(views.map((a) => a.getAttribute('href'))).toEqual(pages.map((p) => p.siteHref))
    expect(views[0].getAttribute('target')).toBe('_blank')
  })

  it('miniature montée seulement à l’ouverture de l’info-bulle (ni lecture de la page ni iframe avant)', () => {
    const media = asset([{ id: 'p:image', label: 'Blog › A — Cover image', siteHref: 'https://conduit.com/blog/a', preview: { kind: 'page', path: '/blog/a' } }])
    render(<MediaCard name={media.name} usage="Used ×1" usagePlaces={usagePlacesFor(media)} />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.querySelector('iframe')).toBeNull()
  })
})
