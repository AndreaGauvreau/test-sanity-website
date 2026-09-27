/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { findTargetElement, selectableFrom, targetFromElement } from './dom'
import { editorMessage, type BridgeView } from './protocol'
import { BridgeRuntime } from './runtime'

const ADMIN = 'http://127.0.0.1:4040'
const LABELS = {
  hero: 'Hero · Section',
  'hero.title': 'Hero · Title',
  'features.card': 'Features · Card',
  'features.card.title': 'Features · Card title',
}

const HTML = `
  <header><a id="logo" href="/">Conduit</a></header>
  <section data-edit="hero" data-edit-doc="dockSchedulingPage">
    <h1 data-edit="hero.title"><span id="inner">Dock scheduling</span></h1>
    <p data-edit="hero.undeclared" id="undeclared">Not in zones.json</p>
    <a id="cta" href="/pricing">Pricing</a>
  </section>
  <section data-edit-doc="dockSchedulingPage">
    <ul>
      <li data-edit="features.card" data-edit-key="k1"><h3 data-edit="features.card.title" data-edit-key="k1">One</h3></li>
      <li data-edit="features.card" data-edit-key="k2"><h3 data-edit="features.card.title" data-edit-key="k2" id="t2">Two</h3></li>
    </ul>
  </section>
  <form id="form"><button id="submit">Send</button></form>
`

type Harness = { runtime: BridgeRuntime; parent: { postMessage: ReturnType<typeof vi.fn> }; refresh: ReturnType<typeof vi.fn>; raf: ReturnType<typeof vi.fn> }

let current: Harness | null = null

function setup(): Harness {
  document.body.innerHTML = HTML
  const parent = { postMessage: vi.fn() }
  const refresh = vi.fn()
  const raf = vi.fn((fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 0))
  // Fenêtre d'iframe simulée : le document et les événements de jsdom, un parent distinct.
  const win = {
    document,
    parent,
    location: { pathname: '/', origin: 'http://127.0.0.1:4042' },
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    requestAnimationFrame: raf,
    cancelAnimationFrame: (id: number) => window.clearTimeout(id),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    innerHeight: 800,
    scrollY: 0,
    scrollTo: vi.fn(),
    matchMedia: () => ({ matches: false }),
    MutationObserver: window.MutationObserver,
  } as unknown as Window
  const runtime = new BridgeRuntime({ window: win, parentOrigin: ADMIN, labels: LABELS, onRefresh: refresh })
  current = { runtime, parent, refresh, raf }
  return current
}

/** Message du parent (event.source et event.origin contrôlés). */
function receive(data: unknown, { origin = ADMIN, source = current!.parent as unknown }: { origin?: string; source?: unknown } = {}) {
  const event = new Event('message')
  Object.defineProperties(event, { data: { value: data }, origin: { value: origin }, source: { value: source } })
  window.dispatchEvent(event)
}

function sync(view: Partial<BridgeView> = {}) {
  receive(editorMessage({ type: 'sync', view: { mode: 'select', locked: false, scale: 1, selection: [], working: [], review: [], ...view } }))
}

function sent(type?: string) {
  return current!.parent.postMessage.mock.calls.filter(([m]) => !type || (m as { type: string }).type === type)
}

function click(el: Element, init: MouseEventInit = {}) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(event)
  return event
}

function boxes() {
  const host = document.querySelector('kz-editor-overlay')!
  return [...host.shadowRoot!.querySelectorAll<HTMLElement>('.box')].map((b) => ({ kind: b.dataset.kind, label: b.querySelector('.label')!.textContent }))
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 100, width: 200, height: 40, top: 100, left: 10, right: 210, bottom: 140, toJSON: () => ({}) } as DOMRect)
})

afterEach(() => {
  current?.runtime.stop()
  current = null
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('BridgeRuntime — poignée de main et origines', () => {
  it('dit hello au parent, vers ADMIN_ORIGIN seulement (jamais « * »)', () => {
    const { runtime, parent } = setup()
    expect(runtime.start()).toBe(true)
    expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ source: 'kz-bridge', type: 'hello' }), ADMIN)
    for (const [, target] of parent.postMessage.mock.calls) expect(target).toBe(ADMIN)
  })

  it('ne démarre pas hors d’une iframe', () => {
    const runtime = new BridgeRuntime({ window, parentOrigin: ADMIN, labels: LABELS, onRefresh: () => {} })
    expect(runtime.start()).toBe(false)
    expect(document.querySelector('kz-editor-overlay')).toBeNull()
  })

  it('répond ready (une fois) au premier état reçu', () => {
    const { runtime } = setup()
    runtime.start()
    sync()
    sync()
    expect(sent('ready')).toHaveLength(1)
    expect(sent('ready')[0][0]).toMatchObject({ type: 'ready', path: '/' })
  })

  it('refuse une origine ou une source inattendue, et les messages mal formés', () => {
    const { runtime, refresh } = setup()
    runtime.start()
    const view = { mode: 'select', locked: false, scale: 1, selection: [], working: [], review: [] }
    receive(editorMessage({ type: 'sync', view: view as BridgeView }), { origin: 'https://evil.test' })
    receive(editorMessage({ type: 'sync', view: view as BridgeView }), { source: window })
    receive(editorMessage({ type: 'refresh' }), { origin: 'http://127.0.0.1:4042' })
    receive({ source: 'kz-editor', v: 1, type: 'sync', view: { ...view, mode: 'hack' } })
    receive('refresh')
    expect(sent('ready')).toHaveLength(0)
    expect(refresh).not.toHaveBeenCalled()
    expect(runtime.currentView.mode).toBe('view')
  })

  it('refresh → router.refresh du site', () => {
    const { runtime, refresh } = setup()
    runtime.start()
    receive(editorMessage({ type: 'refresh' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('BridgeRuntime — sélection', () => {
  it('avant le premier état : le site se comporte normalement', () => {
    const { runtime } = setup()
    runtime.start()
    const event = click(document.getElementById('inner')!)
    expect(event.defaultPrevented).toBe(false)
    expect(sent('select')).toHaveLength(0)
  })

  it('Select : clic = élément sélectionnable le plus proche (zone connue), lien neutralisé', () => {
    const { runtime } = setup()
    runtime.start()
    sync()
    const event = click(document.getElementById('inner')!)
    expect(event.defaultPrevented).toBe(true)
    expect(sent('select').at(-1)![0]).toMatchObject({ type: 'select', target: { zone: 'hero.title', index: 0, doc: 'dockSchedulingPage' }, additive: false })

    // Zone non déclarée : on remonte jusqu'à la section.
    click(document.getElementById('undeclared')!)
    expect(sent('select').at(-1)![0]).toMatchObject({ target: { zone: 'hero' } })

    // Hors zone (en-tête) : rien, mais le lien ne part pas.
    const logo = click(document.getElementById('logo')!)
    expect(logo.defaultPrevented).toBe(true)
    expect(sent('select')).toHaveLength(2)
  })

  it('Maj + clic = additive, avec la clé et le rang de l’élément répété', () => {
    const { runtime } = setup()
    runtime.start()
    sync()
    click(document.getElementById('t2')!, { shiftKey: true })
    expect(sent('select').at(-1)![0]).toMatchObject({
      target: { zone: 'features.card.title', index: 1, key: 'k2', doc: 'dockSchedulingPage' },
      additive: true,
    })
  })

  it('Entrée sur un élément focalisé sélectionne au lieu d’activer', () => {
    const { runtime } = setup()
    runtime.start()
    sync()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    document.getElementById('inner')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(sent('select').at(-1)![0]).toMatchObject({ target: { zone: 'hero.title' } })
  })

  it('View : aucun clic intercepté, aucune sélection', () => {
    const { runtime } = setup()
    runtime.start()
    sync({ mode: 'view' })
    const event = click(document.getElementById('inner')!)
    expect(event.defaultPrevented).toBe(false)
    expect(sent('select')).toHaveLength(0)
    expect(document.documentElement.hasAttribute('data-kz-editor')).toBe(false)
  })

  it('Select neutralise aussi l’envoi d’un formulaire', () => {
    const { runtime } = setup()
    runtime.start()
    sync()
    const submit = new Event('submit', { bubbles: true, cancelable: true })
    document.getElementById('form')!.dispatchEvent(submit)
    expect(submit.defaultPrevented).toBe(true)
  })

  it('Échap → escape au parent, dans tous les modes', () => {
    const { runtime } = setup()
    runtime.start()
    sync({ mode: 'view' })
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(sent('escape')).toHaveLength(1)
  })
})

describe('BridgeRuntime — verrouillage pendant le travail', () => {
  it('locked : clic neutralisé sans sélection, flèche partout, pas de survol', () => {
    const { runtime } = setup()
    runtime.start()
    sync({ locked: true, working: [{ zone: 'hero.title', index: 0 }], selection: [{ zone: 'hero.title', index: 0 }] })
    const event = click(document.getElementById('inner')!)
    expect(event.defaultPrevented).toBe(true)
    expect(sent('select')).toHaveLength(0)
    expect(document.documentElement.getAttribute('data-kz-editor')).toBe('locked')

    document.getElementById('t2')!.dispatchEvent(new Event('pointermove', { bubbles: true }))
    runtime.flush()
    // Seul le reflet de travail est dessiné : ni la sélection, ni le survol.
    expect(boxes()).toEqual([{ kind: 'working', label: 'Hero · Title' }])
  })
})

describe('BridgeRuntime — calque', () => {
  it('dessine sélection, survol et modification à valider dans un Shadow DOM inerte', () => {
    const { runtime } = setup()
    runtime.start()
    sync({ selection: [{ zone: 'features.card.title', index: 1, key: 'k2' }], review: [{ zone: 'hero.title', index: 0 }] })
    document.getElementById('t2')!.dispatchEvent(new Event('pointermove', { bubbles: true }))
    document.getElementById('logo')!.dispatchEvent(new Event('pointermove', { bubbles: true }))
    document.getElementById('inner')!.dispatchEvent(new Event('pointermove', { bubbles: true }))
    runtime.flush()
    const host = document.querySelector('kz-editor-overlay') as HTMLElement
    expect(host.getAttribute('aria-hidden')).toBe('true')
    expect(host.shadowRoot!.querySelector('style')!.textContent).toContain('pointer-events: none')
    // hero.title est déjà dessiné (à valider) : pas de second contour de survol.
    expect(boxes()).toEqual([
      { kind: 'review', label: 'Hero · Title — modified by Claude' },
      { kind: 'selected', label: 'Features · Card title' },
    ])
    expect(document.documentElement.hasAttribute('data-kz-editor-hover')).toBe(true)
  })

  it('survol d’un élément non dessiné : contour fin sans étiquette', () => {
    const { runtime } = setup()
    runtime.start()
    sync()
    document.getElementById('t2')!.dispatchEvent(new Event('pointermove', { bubbles: true }))
    runtime.flush()
    expect(boxes()).toEqual([{ kind: 'hover', label: '' }])
  })

  it('pas de boucle d’images : rien n’est redemandé sans changement', async () => {
    const { runtime, raf } = setup()
    runtime.start()
    sync({ selection: [{ zone: 'hero.title', index: 0 }] })
    await new Promise((r) => setTimeout(r, 30))
    const calls = raf.mock.calls.length
    await new Promise((r) => setTimeout(r, 60))
    expect(raf.mock.calls.length).toBe(calls)
    // Un défilement redemande UNE image.
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('scroll'))
    expect(raf.mock.calls.length).toBe(calls + 1)
  })

  it('stop() retire le calque, le style et les attributs', () => {
    const { runtime } = setup()
    runtime.start()
    sync()
    runtime.stop()
    expect(document.querySelector('kz-editor-overlay')).toBeNull()
    expect(document.querySelector('style[data-kz-editor-cursor]')).toBeNull()
    expect(document.documentElement.hasAttribute('data-kz-editor')).toBe(false)
    const event = click(document.getElementById('inner')!)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('repérage des éléments', () => {
  beforeEach(() => {
    document.body.innerHTML = HTML
  })

  it('retrouve un élément par sa clé avant son rang (ordre du tableau changé)', () => {
    const ul = document.querySelector('ul')!
    ul.prepend(ul.lastElementChild!) // k2 passe en premier
    const el = findTargetElement(document, { zone: 'features.card.title', index: 1, key: 'k2' })
    expect(el?.textContent).toBe('Two')
    expect(findTargetElement(document, { zone: 'features.card.title', index: 0, key: 'gone' })).toBeNull()
  })

  it('ignore un doc qui ne correspond pas', () => {
    expect(findTargetElement(document, { zone: 'hero.title', index: 0, doc: 'other' })).toBeNull()
    expect(findTargetElement(document, { zone: 'hero.title', index: 0, doc: 'dockSchedulingPage' })?.tagName).toBe('H1')
  })

  it('ne sélectionne que les zones déclarées', () => {
    expect(selectableFrom(document.getElementById('logo'), LABELS)).toBeNull()
    const el = selectableFrom(document.getElementById('undeclared'), LABELS)!
    expect(el.getAttribute('data-edit')).toBe('hero')
    expect(targetFromElement(el, LABELS)).toEqual({ zone: 'hero', index: 0, doc: 'dockSchedulingPage' })
  })
})
