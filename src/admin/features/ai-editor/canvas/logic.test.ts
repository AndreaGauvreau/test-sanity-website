import { describe, expect, it, vi } from 'vitest'

import type { EditJob, PendingChange } from '@/admin/core/contracts'
import { bridgeMessage } from '@/admin/editor-bridge/protocol'
import { createEditorStore } from '../state/store'
import { resolveEditorPage } from '../page/resolve'
import { connectPreview } from './channel'
import { resolvePreview } from './preview-url'
import { computeFrame } from './scale'
import { bridgeViewFrom } from './view'

describe('computeFrame — mise à l’échelle de l’aperçu', () => {
  it('réduit Desktop 1280 pour tenir dans 1080 (Figma D1) et allonge l’iframe d’autant', () => {
    const f = computeFrame({ width: 1080, height: 860 }, 1280)
    expect(f.scale).toBeCloseTo(0.84375)
    expect(f.width).toBeCloseTo(1080)
    expect(f.height).toBe(860)
    expect(f.iframeWidth).toBe(1280)
    expect(f.iframeHeight).toBeCloseTo(860 / 0.84375)
  })

  it('n’agrandit jamais : Tablet et Mobile gardent leur largeur réelle', () => {
    expect(computeFrame({ width: 1080, height: 860 }, 768)).toEqual({ scale: 1, width: 768, height: 860, iframeWidth: 768, iframeHeight: 860 })
    expect(computeFrame({ width: 1080, height: 860 }, 375).width).toBe(375)
  })

  it('place nulle ou invalide : échelle 1, sans NaN', () => {
    for (const size of [{ width: 0, height: 0 }, { width: Number.NaN, height: -5 }]) {
      const f = computeFrame(size, 1280)
      expect(f.scale).toBe(1)
      expect(Number.isFinite(f.iframeHeight)).toBe(true)
      expect(f.height).toBe(0)
    }
  })

  it('petite place : Mobile réduit aussi', () => {
    expect(computeFrame({ width: 300, height: 600 }, 375).scale).toBeCloseTo(0.8)
  })
})

describe('resolvePreview', () => {
  const base = 'http://127.0.0.1:4040/admin/editor?page=home'
  it('accepte http(s) absolu, ou relatif résolu sur l’admin', () => {
    expect(resolvePreview('http://127.0.0.1:4042/?kz_preview=x', 'http://127.0.0.1:4042', base)).toEqual({ url: 'http://127.0.0.1:4042/?kz_preview=x', origin: 'http://127.0.0.1:4042' })
    expect(resolvePreview('/admin/editor/harness', null, base)).toEqual({ url: 'http://127.0.0.1:4040/admin/editor/harness', origin: 'http://127.0.0.1:4040' })
  })
  it('refuse les schémas dangereux, les identifiants et une origine qui ne concorde pas', () => {
    expect(resolvePreview('javascript:alert(1)', null, base)).toBeNull()
    expect(resolvePreview('data:text/html,hi', null, base)).toBeNull()
    expect(resolvePreview('http://user:pw@127.0.0.1:4042/', null, base)).toBeNull()
    expect(resolvePreview('http://127.0.0.1:4042/', 'http://127.0.0.1:4043', base)).toBeNull()
    expect(resolvePreview('', null, base)).toBeNull()
  })
})

describe('connectPreview — canal parent', () => {
  function setup() {
    const listeners: ((e: MessageEvent) => void)[] = []
    const win = {
      addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.splice(listeners.indexOf(fn), 1),
    } as unknown as Window
    const frame = { postMessage: vi.fn() } as unknown as Window
    const handlers = { onHello: vi.fn(), onReady: vi.fn(), onSelect: vi.fn(), onEscape: vi.fn() }
    const channel = connectPreview({ window: win, frame: () => frame, origin: 'http://127.0.0.1:4042', handlers })
    const emit = (data: unknown, origin = 'http://127.0.0.1:4042', source: unknown = frame) =>
      listeners.forEach((l) => l({ data, origin, source } as MessageEvent))
    return { channel, frame, handlers, emit, listeners }
  }

  it('n’écoute que l’iframe, à l’origine de l’aperçu', () => {
    const { handlers, emit } = setup()
    emit(bridgeMessage({ type: 'hello' }), 'https://evil.test')
    emit(bridgeMessage({ type: 'hello' }), 'http://127.0.0.1:4042', {})
    emit({ source: 'kz-bridge', v: 1, type: 'select', target: { zone: '../x', index: 0 }, additive: false })
    expect(handlers.onHello).not.toHaveBeenCalled()
    expect(handlers.onSelect).not.toHaveBeenCalled()
    emit(bridgeMessage({ type: 'select', target: { zone: 'hero.title', index: 0 }, additive: true }))
    emit(bridgeMessage({ type: 'ready', path: '/' }))
    emit(bridgeMessage({ type: 'escape' }))
    expect(handlers.onSelect).toHaveBeenCalledWith({ zone: 'hero.title', index: 0 }, true)
    expect(handlers.onReady).toHaveBeenCalledWith('/')
    expect(handlers.onEscape).toHaveBeenCalledTimes(1)
  })

  it('poste vers l’origine de l’aperçu, jamais « * », et se débranche', () => {
    const { channel, frame, listeners } = setup()
    channel.refresh()
    expect(frame.postMessage).toHaveBeenCalledWith(expect.objectContaining({ source: 'kz-editor', type: 'refresh' }), 'http://127.0.0.1:4042')
    channel.dispose()
    expect(listeners).toHaveLength(0)
  })
})

const TARGET = { zone: 'hero.title', index: 0, label: 'Hero · Title' }
const job = (status: EditJob['status']) => ({ id: 'j1', status, request: { targets: [TARGET] } }) as unknown as EditJob
const pending = { id: 'c1', status: 'to-validate', targets: [TARGET] } as unknown as PendingChange

describe('bridgeViewFrom et verrouillage', () => {
  it('sélection seule, hors travail', () => {
    const store = createEditorStore({ pageId: 'home', path: '/' })
    store.select(TARGET)
    expect(bridgeViewFrom(store.get(), 0.84)).toEqual({ mode: 'select', locked: false, scale: 0.84, selection: [{ zone: 'hero.title', index: 0 }], working: [], review: [] })
  })

  it('pendant le travail : reflet sur les éléments de la demande, sélection figée', () => {
    const store = createEditorStore({ pageId: 'home', path: '/' })
    store.select(TARGET)
    store.setJob(job('running'))
    store.setPending(pending)
    const view = bridgeViewFrom(store.get(), 1)
    expect(view.locked).toBe(true)
    expect(view.working).toEqual([{ zone: 'hero.title', index: 0 }])
    expect(view.review).toEqual([])
    // Le magasin refuse sélection et changement de mode pendant le travail.
    store.select({ zone: 'features.card', index: 1, label: 'Features · Card' }, true)
    store.setMode('view')
    expect(store.get().selection).toHaveLength(1)
    expect(store.get().mode).toBe('select')
  })

  it('modification à valider : cadre « modified by Claude » une fois le travail fini', () => {
    const store = createEditorStore({ pageId: 'home', path: '/' })
    store.setJob(job('done'))
    store.setPending(pending)
    expect(bridgeViewFrom(store.get(), 1)).toMatchObject({ locked: false, review: [{ zone: 'hero.title', index: 0 }], working: [] })
  })

  it('échelle invalide ramenée à 1', () => {
    expect(bridgeViewFrom(createEditorStore({ pageId: 'home', path: '/' }).get(), 0).scale).toBe(1)
  })
})

describe('resolveEditorPage', () => {
  const pages = [
    { id: 'home', label: 'Home', path: '/', sections: [], aiEditor: true },
    { id: 'blog', label: 'Blog', path: '/blog', sections: [], aiEditor: false },
  ]
  it('seulement une page du manifeste qui autorise l’éditeur', () => {
    expect(resolveEditorPage({ pages }, 'home')?.path).toBe('/')
    expect(resolveEditorPage({ pages }, 'blog')).toBeNull()
    expect(resolveEditorPage({ pages }, undefined)).toBeNull()
    expect(resolveEditorPage({ pages }, ['home'])).toBeNull()
    expect(resolveEditorPage({ pages }, '../home')).toBeNull()
  })
})
