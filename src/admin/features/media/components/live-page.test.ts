/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearPageSnapshots, loadPageSnapshot, measureLivePage, type SnapshotDeps } from './live-page'

afterEach(() => {
  clearPageSnapshots()
  vi.useRealTimers()
})

const ORIGIN = 'http://127.0.0.1:4040'
const HASH = '9c3511be851bd0f3eaf2a14385de57d7de0584fa'
const CDN = `https://cdn.sanity.io/images/dwa2djm3/development/${HASH}-800x806.jpg`

function deps(respond: (url: string, init: RequestInit) => Promise<unknown> | unknown): SnapshotDeps & { fetch: ReturnType<typeof vi.fn> } {
  return { fetch: vi.fn(async (url: string, init: RequestInit) => respond(url, init)) as never, origin: ORIGIN }
}

function response(body: string, { status = 200, type = 'text/html; charset=utf-8', url = '' } = {}) {
  return { ok: status >= 200 && status < 300, status, url, headers: new Headers({ 'content-type': type }), text: async () => body }
}

describe('loadPageSnapshot (lecture de la page, repli, cache)', () => {
  it('200 : copie nettoyée, <base> sur l’adresse finale (redirection de même origine comprise)', async () => {
    const d = deps(() => response('<html><head><script src="/x.js"></script></head><body><p>Hi</p></body></html>', { url: `${ORIGIN}/blog/new-slug` }))
    const snapshot = await loadPageSnapshot('/blog/old-slug', d)
    expect(snapshot.status).toBe('ok')
    const html = (snapshot as { html: string }).html
    expect(html).toContain(`<base href="${ORIGIN}/blog/new-slug">`)
    expect(html).not.toContain('<script')
    expect(d.fetch).toHaveBeenCalledWith('/blog/old-slug', expect.objectContaining({ mode: 'same-origin', credentials: 'same-origin', cache: 'default' }))
  })

  it('404 / 410 → missing ; 500, réponse non HTML, redirection vers une autre origine, erreur réseau → unavailable', async () => {
    expect(await loadPageSnapshot('/a', deps(() => response('nope', { status: 404 })))).toEqual({ status: 'missing' })
    expect(await loadPageSnapshot('/b', deps(() => response('gone', { status: 410 })))).toEqual({ status: 'missing' })
    expect(await loadPageSnapshot('/c', deps(() => response('oops', { status: 500 })))).toEqual({ status: 'unavailable' })
    expect(await loadPageSnapshot('/d', deps(() => response('{}', { type: 'application/json' })))).toEqual({ status: 'unavailable' })
    expect(await loadPageSnapshot('/e', deps(() => response('<p>x</p>', { url: 'https://elsewhere.example/e' })))).toEqual({ status: 'unavailable' })
    expect(await loadPageSnapshot('/f', deps(() => Promise.reject(new TypeError('Failed to fetch'))))).toEqual({ status: 'unavailable' })
  })

  it('délai de 20 s : lecture abandonnée → unavailable', async () => {
    vi.useFakeTimers()
    const d = deps((_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
    const pending = loadPageSnapshot('/slow', d)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await pending).toEqual({ status: 'unavailable' })
  })

  it('cache par chemin pour la vie de la page : une lecture partagée ; un échec n’est pas gardé', async () => {
    const ok = deps(() => response('<p>ok</p>'))
    const [a, b] = await Promise.all([loadPageSnapshot('/blog/x', ok), loadPageSnapshot('/blog/x', ok)])
    expect(a).toBe(b)
    await loadPageSnapshot('/blog/x', ok)
    expect(ok.fetch).toHaveBeenCalledTimes(1)
    const failing = deps(() => response('oops', { status: 503 }))
    await loadPageSnapshot('/blog/y', failing)
    await loadPageSnapshot('/blog/y', failing)
    expect(failing.fetch).toHaveBeenCalledTimes(2)
  })
})

describe('measureLivePage (mesure après le load de l’iframe)', () => {
  function frameWith(html: string) {
    const doc = document.implementation.createHTMLDocument('copy')
    doc.documentElement.innerHTML = html
    let scrollY = 0
    for (const [key, value] of Object.entries({ clientWidth: 1280, clientHeight: 571, scrollWidth: 1280, scrollHeight: 4000 })) {
      Object.defineProperty(doc.documentElement, key, { configurable: true, value })
    }
    const scrollTo = vi.fn((options: ScrollToOptions) => {
      scrollY = options.top ?? 0
    })
    const win = { location: { href: 'about:srcdoc' }, scrollX: 0, get scrollY() { return scrollY }, scrollTo }
    const iframe = document.createElement('iframe')
    Object.defineProperty(iframe, 'contentDocument', { value: doc })
    Object.defineProperty(iframe, 'contentWindow', { value: win })
    const cover = doc.getElementById('cover')
    if (cover) {
      cover.getBoundingClientRect = () => ({ left: 40, top: 900 - scrollY, width: 1200, height: 630 }) as DOMRect
      // jsdom ne charge pas les images : chargée par défaut, sauf si le test dit le contraire.
      Object.defineProperty(cover, 'complete', { configurable: true, value: true })
    }
    return { iframe, doc, scrollTo, cover }
  }

  it('attend les feuilles de style avant de mesurer (sinon la mise en page est fausse)', async () => {
    const { iframe, doc, scrollTo } = frameWith(`<head><link rel="stylesheet" href="/site.css"></head><body><img id="cover" src="${CDN}"></body>`)
    const pending = measureLivePage(iframe, HASH, 0)
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(scrollTo).not.toHaveBeenCalled()
    doc.querySelector('link')!.dispatchEvent(new Event('load'))
    const result = await pending
    expect(result?.status).toBe('ready')
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 930, behavior: 'instant' })
  })

  it('image entourée pas encore chargée (lazy) : attendue une fois centrée, puis remesurée', async () => {
    const { iframe, scrollTo, cover } = frameWith(`<body><img id="cover" loading="lazy" src="${CDN}"></body>`)
    Object.defineProperty(cover!, 'complete', { configurable: true, value: false })
    const pending = measureLivePage(iframe, HASH, 0)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(scrollTo).toHaveBeenCalledTimes(1)
    cover!.dispatchEvent(new Event('load'))
    const result = await pending
    expect(result?.status).toBe('ready')
    expect(scrollTo).toHaveBeenCalledTimes(2)
  })

  it('copie sans l’image : missing', async () => {
    const { iframe } = frameWith('<body><p>No image</p></body>')
    expect(await measureLivePage(iframe, HASH, 0)).toEqual({ status: 'missing' })
  })
})
