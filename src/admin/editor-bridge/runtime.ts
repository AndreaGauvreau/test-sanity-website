import { findTargetElement, selectableFrom, targetFromElement } from './dom'
import { Overlay, type OverlayBox } from './overlay'
import { bridgeMessage, parseEditorMessage, sameTargetRef, type BridgeMessageBody, type BridgeView, type TargetRef } from './protocol'
import type { ZoneLabels } from './zones'

/**
 * Pont de l'aperçu, côté SITE (dans l'iframe). Classe sans React, testable en jsdom : le composant <Bridge> ne fait
 * que la créer, la démarrer et lui donner `router.refresh`.
 *
 * - Ne démarre que dans une iframe, et ne parle qu'à `parentOrigin` (ADMIN_ORIGIN) : `event.origin` ET
 *   `event.source === window.parent` vérifiés, messages validés (protocol.ts), jamais de « * ».
 * - Avant le premier `sync` du parent, le site se comporte normalement (mode View) : rien n'est intercepté.
 * - View : aucun clic intercepté (les liens marchent). Select : survol = contour + main sur un élément
 *   sélectionnable, flèche ailleurs ; clic = `select` (Maj + clic = additive) ; tous les clics et envois de
 *   formulaire sont neutralisés. Pendant le travail (locked) : flèche partout, aucun contour de survol, rien ne part.
 * - Échap (quel que soit le mode) : `escape` au parent, qui désélectionne.
 * - Contours redessinés sur défilement, redimensionnement, ResizeObserver et MutationObserver, une fois par image au
 *   plus : pas de boucle rAF permanente.
 */

export type BridgeRuntimeOptions = {
  window: Window
  /** Origine stricte de l'admin (ADMIN_ORIGIN, ou l'origine du document pour la page d'essai). */
  parentOrigin: string
  labels: ZoneLabels
  /** Recharge les données du serveur (router.refresh) : un brouillon Sanity ne passe pas par le HMR. */
  onRefresh: () => void
}

const CURSOR_ATTR = 'data-kz-editor'
const HOVER_ATTR = 'data-kz-editor-hover'
/** Curseurs imposés au site en mode Select : flèche par défaut, main seulement au survol d'un élément sélectionnable. */
const CURSOR_CSS = `
html[${CURSOR_ATTR}='select'], html[${CURSOR_ATTR}='select'] *,
html[${CURSOR_ATTR}='locked'], html[${CURSOR_ATTR}='locked'] * { cursor: default !important; }
html[${CURSOR_ATTR}='select'][${HOVER_ATTR}], html[${CURSOR_ATTR}='select'][${HOVER_ATTR}] * { cursor: pointer !important; }
html[${CURSOR_ATTR}='select'] *, html[${CURSOR_ATTR}='locked'] * { user-select: none !important; -webkit-user-select: none !important; }
`
const REVIEW_SUFFIX = ' — modified by Claude'

const INITIAL_VIEW: BridgeView = { mode: 'view', locked: false, scale: 1, selection: [], working: [], review: [] }

export class BridgeRuntime {
  private readonly win: Window
  private readonly doc: Document
  private readonly overlay: Overlay
  private view: BridgeView = INITIAL_VIEW
  private hovered: Element | null = null
  private readySent = false
  private started = false
  private frame = 0
  private style: HTMLStyleElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private mutationObserver: MutationObserver | null = null
  private observed = new Set<Element>()
  private readonly cleanups: (() => void)[] = []

  constructor(private readonly options: BridgeRuntimeOptions) {
    this.win = options.window
    this.doc = options.window.document
    this.overlay = new Overlay(this.doc)
  }

  /** Démarre le pont ; false hors d'une iframe (le site ouvert seul n'a pas de parent à qui parler). */
  start(): boolean {
    if (this.started) return true
    if (this.win.parent === this.win) return false
    this.started = true

    this.overlay.mount()
    this.style = this.doc.createElement('style')
    this.style.setAttribute('data-kz-editor-cursor', '')
    this.style.textContent = CURSOR_CSS
    this.doc.head.append(this.style)

    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts: AddEventListenerOptions = {}) => {
      this.win.addEventListener(type, fn as EventListener, opts)
      this.cleanups.push(() => this.win.removeEventListener(type, fn as EventListener, opts))
    }
    on('message', this.onMessage)
    on('pointermove', this.onPointerMove, { capture: true, passive: true })
    on('pointerout', this.onPointerOut, { capture: true, passive: true })
    on('focusin', this.onFocusIn, { capture: true })
    on('keydown', this.onKeyDown, { capture: true })
    for (const type of ['click', 'auxclick', 'dblclick'] as const) on(type, this.onClick, { capture: true })
    for (const type of ['pointerdown', 'mousedown'] as const) on(type, this.onPress, { capture: true })
    on('submit', this.onSubmit, { capture: true })
    on('scroll', this.schedule, { capture: true, passive: true })
    on('resize', this.schedule, { passive: true })
    on('transitionend', this.schedule, { capture: true, passive: true })
    on('animationend', this.schedule, { capture: true, passive: true })

    const RO = (this.win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    if (RO) {
      this.resizeObserver = new RO(() => this.schedule())
      this.resizeObserver.observe(this.doc.documentElement)
    }
    const MO = (this.win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver
    if (MO) {
      this.mutationObserver = new MO((records) => {
        // Nos propres ajouts (calque, style) ne comptent pas.
        if (records.every((r) => r.target === this.overlay.host || [...r.addedNodes].every((n) => n === this.overlay.host))) return
        this.schedule()
      })
      this.mutationObserver.observe(this.doc.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'open', 'data-edit', 'data-edit-key', 'data-edit-doc'],
      })
    }

    this.post({ type: 'hello' })
    return true
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.resizeObserver?.disconnect()
    this.mutationObserver?.disconnect()
    this.observed.clear()
    if (this.frame) this.cancelFrame(this.frame)
    this.frame = 0
    this.overlay.unmount()
    this.style?.remove()
    this.doc.documentElement.removeAttribute(CURSOR_ATTR)
    this.doc.documentElement.removeAttribute(HOVER_ATTR)
  }

  /** Dernier état reçu du parent (tests, diagnostic). */
  get currentView(): BridgeView {
    return this.view
  }

  /** Redessine tout de suite (tests) au lieu d'attendre l'image suivante. */
  flush(): void {
    if (this.frame) this.cancelFrame(this.frame)
    this.frame = 0
    this.render()
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  private post(body: BridgeMessageBody): void {
    this.win.parent.postMessage(bridgeMessage(body), this.options.parentOrigin)
  }

  private onMessage = (event: MessageEvent): void => {
    if (event.origin !== this.options.parentOrigin || event.source !== this.win.parent) return
    const message = parseEditorMessage(event.data)
    if (!message) return
    if (message.type === 'refresh') {
      this.options.onRefresh()
      return
    }
    const previous = this.view
    this.view = message.view
    this.overlay.setScale(message.view.scale)
    if (this.view.mode !== 'select' || this.view.locked) this.setHovered(null)
    this.applyCursor()
    this.revealNewTargets(previous)
    this.schedule()
    if (!this.readySent) {
      this.readySent = true
      this.post({ type: 'ready', path: this.win.location.pathname })
    }
  }

  // ─── Entrées de l'utilisateur ──────────────────────────────────────────────

  private get selecting(): boolean {
    return this.view.mode === 'select'
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.selecting || this.view.locked) return
    this.setHovered(selectableFrom(event.target, this.options.labels))
  }

  private onPointerOut = (event: PointerEvent): void => {
    if (event.relatedTarget === null) this.setHovered(null)
  }

  private onFocusIn = (event: FocusEvent): void => {
    if (!this.selecting || this.view.locked) return
    this.setHovered(selectableFrom(event.target, this.options.labels))
  }

  private onPress = (event: Event): void => {
    // Pas de focus, pas de sélection de texte, pas d'action du site pendant la sélection.
    if (this.selecting) event.preventDefault()
  }

  private onSubmit = (event: Event): void => {
    if (!this.selecting) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  private onClick = (event: MouseEvent): void => {
    if (!this.selecting) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.type !== 'click' || this.view.locked) return
    this.selectFrom(event.target, event.shiftKey)
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.post({ type: 'escape' })
      return
    }
    if (!this.selecting || (event.key !== 'Enter' && event.key !== ' ')) return
    const target = selectableFrom(event.target, this.options.labels)
    if (!target) return
    // Clavier : Entrée / Espace sur un élément focalisé sélectionne au lieu d'activer (Maj = additive).
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!this.view.locked) this.selectFrom(target, event.shiftKey)
  }

  private selectFrom(node: EventTarget | null, additive: boolean): void {
    const el = selectableFrom(node, this.options.labels)
    if (!el) return
    const target = targetFromElement(el, this.options.labels, this.doc)
    if (target) this.post({ type: 'select', target, additive })
  }

  private setHovered(el: Element | null): void {
    if (this.hovered === el) return
    this.hovered = el
    if (el && this.selecting && !this.view.locked) this.doc.documentElement.setAttribute(HOVER_ATTR, '')
    else this.doc.documentElement.removeAttribute(HOVER_ATTR)
    this.schedule()
  }

  private applyCursor(): void {
    const value = this.view.mode === 'view' ? null : this.view.locked ? 'locked' : 'select'
    if (value) this.doc.documentElement.setAttribute(CURSOR_ATTR, value)
    else this.doc.documentElement.removeAttribute(CURSOR_ATTR)
    if (value !== 'select') this.doc.documentElement.removeAttribute(HOVER_ATTR)
  }

  /** Une modification à valider ou un travail qui commence hors de la vue : on l'amène à l'écran. */
  private revealNewTargets(previous: BridgeView): void {
    const fresh = [...this.view.review, ...this.view.working].find(
      (ref) => ![...previous.review, ...previous.working].some((p) => sameTargetRef(p, ref)),
    )
    if (!fresh) return
    const el = findTargetElement(this.doc, fresh)
    if (!el) return
    const rect = el.getBoundingClientRect()
    const height = this.win.innerHeight
    if (rect.bottom > 0 && rect.top < height) return
    const reduced = this.win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    // Pas de scrollIntoView : dans une iframe de même origine (page d'essai), il fait aussi défiler l'admin.
    const top = this.win.scrollY + rect.top - Math.max(0, (height - rect.height) / 2)
    this.win.scrollTo?.({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' })
  }

  // ─── Dessin ────────────────────────────────────────────────────────────────

  private schedule = (): void => {
    if (!this.started || this.frame) return
    this.frame = this.requestFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  private requestFrame(fn: () => void): number {
    if (typeof this.win.requestAnimationFrame === 'function') return this.win.requestAnimationFrame(fn)
    return this.win.setTimeout(fn, 16) as unknown as number
  }

  private cancelFrame(id: number): void {
    if (typeof this.win.cancelAnimationFrame === 'function') this.win.cancelAnimationFrame(id)
    else this.win.clearTimeout(id)
  }

  private render(): void {
    const { labels } = this.options
    const boxes: OverlayBox[] = []
    const drawn = new Set<Element>()
    const add = (ref: TargetRef, kind: OverlayBox['kind'], suffix = '') => {
      const el = findTargetElement(this.doc, ref)
      if (!el || drawn.has(el)) return
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return
      drawn.add(el)
      boxes.push({ kind, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, label: `${labels[ref.zone] ?? ref.zone}${suffix}` })
    }

    for (const ref of this.view.working) add(ref, 'working')
    for (const ref of this.view.review) add(ref, 'review', REVIEW_SUFFIX)
    if (!this.view.locked) for (const ref of this.view.selection) add(ref, 'selected')

    const hovered = this.hovered
    if (hovered && hovered.isConnected && this.selecting && !this.view.locked && !drawn.has(hovered)) {
      const r = hovered.getBoundingClientRect()
      if (r.width > 0 || r.height > 0) {
        drawn.add(hovered)
        boxes.push({ kind: 'hover', rect: { x: r.x, y: r.y, width: r.width, height: r.height } })
      }
    }

    this.overlay.render(boxes)
    this.trackSizes(drawn)
  }

  /** Observe la taille des éléments dessinés (et seulement eux). */
  private trackSizes(elements: Set<Element>): void {
    const ro = this.resizeObserver
    if (!ro) return
    for (const el of this.observed) {
      if (!elements.has(el)) {
        ro.unobserve(el)
        this.observed.delete(el)
      }
    }
    for (const el of elements) {
      if (!this.observed.has(el)) {
        ro.observe(el)
        this.observed.add(el)
      }
    }
  }
}
