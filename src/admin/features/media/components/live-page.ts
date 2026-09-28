'use client'

import {
  LIVE_PAGE_HEIGHT,
  LIVE_PAGE_WIDTH,
  LIVE_SCALE,
  LIVE_TIMEOUT_MS,
  centerScroll,
  cleanPageHtml,
  findAssetElements,
  frameBox,
  pickTarget,
  type Box,
} from '../lib/usage-preview'

/**
 * Page vivante de l'Usage tooltip (C5) : lecture de la page publique (fetch de MÊME ORIGINE), copie nettoyée
 * (`cleanPageHtml` : ni script, ni `<noscript>`, ni iframe, ni préchargement de JS), mise en cache, puis mesure dans
 * l'iframe `srcdoc` qui la rend (élément qui affiche l'asset, défilement, cadre rouge).
 *
 * Pourquoi une copie plutôt que la page elle-même dans l'iframe : sans scripts, le navigateur rend le contenu des
 * `<noscript>` (en production, l'iframe GTM `ns.html` d'Analytics.tsx partait à chaque miniature) et télécharge
 * quand même les fichiers JS préchargés (≈ 1,3 Mo par page en dev) ; la copie n'en contient plus.
 */

export type PageSnapshot = { status: 'ok'; html: string } | { status: 'missing' } | { status: 'unavailable' }

export type SnapshotDeps = {
  fetch: (input: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'url' | 'headers' | 'text'>>
  /** Origine de l'admin (= du site : même application Next). */
  origin: string
}

/** Copies nettoyées par chemin, pour la vie de la page de l'admin (plusieurs info-bulles, même page). */
const snapshots = new Map<string, Promise<PageSnapshot>>()
/** Au plus : les plus anciennes sortent (quelques dizaines de Ko chacune). */
const MAX_SNAPSHOTS = 24

function defaultDeps(): SnapshotDeps {
  return { fetch: (input, init) => fetch(input, init), origin: window.location.origin }
}

/**
 * Copie nettoyée de la page `path` (chemin relatif, même origine). 404 / 410 → `missing` (page absente : utilisation
 * dans un brouillon seulement) ; autre statut, réponse non HTML, redirection vers une autre origine, erreur réseau ou
 * délai (LIVE_TIMEOUT_MS) → `unavailable`. Seules les copies réussies restent en cache ; une lecture en cours est partagée.
 */
export function loadPageSnapshot(path: string, deps: SnapshotDeps = defaultDeps()): Promise<PageSnapshot> {
  const known = snapshots.get(path)
  if (known) return known
  const pending = readSnapshot(path, deps).then((snapshot) => {
    if (snapshot.status !== 'ok' && snapshots.get(path) === pending) snapshots.delete(path)
    return snapshot
  })
  snapshots.set(path, pending)
  if (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value as string)
  return pending
}

/** Vide le cache des copies (tests). */
export function clearPageSnapshots(): void {
  snapshots.clear()
}

async function readSnapshot(path: string, deps: SnapshotDeps): Promise<PageSnapshot> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS)
  try {
    const response = await deps.fetch(path, {
      method: 'GET',
      // Même origine seulement : une redirection vers un autre site échoue (→ unavailable).
      mode: 'same-origin',
      credentials: 'same-origin',
      // Cache HTTP du navigateur selon les en-têtes du site (page publiée fraîche après une publication).
      cache: 'default',
      headers: { Accept: 'text/html' },
      signal: controller.signal,
    })
    if (response.status === 404 || response.status === 410) return { status: 'missing' }
    if (!response.ok) return { status: 'unavailable' }
    const type = response.headers.get('content-type')
    if (type && !/text\/html/i.test(type)) return { status: 'unavailable' }
    const html = await response.text()
    // Base des URL relatives : l'adresse finale de la page (après redirections), sur l'origine de l'admin.
    const base = new URL(response.url || path, deps.origin)
    if (base.origin !== new URL(deps.origin).origin) return { status: 'unavailable' }
    return { status: 'ok', html: cleanPageHtml(html, base.href) }
  } catch {
    return { status: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Mesure dans l'iframe srcdoc ──────────────────────────────────────────────────────────────

/** Attente des feuilles de style, des polices et de l'image entourée (chacune bornée). */
export const WAIT_MS = { styles: 3000, fonts: 3000, image: 5000 } as const

export type LiveResult = { status: 'ready'; frame: Box; element: Element } | { status: 'missing' } | { status: 'unavailable' }

function boxOf(element: Element): Box {
  const r = element.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

function settle(start: (done: () => void) => (() => void) | void, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let over = false
    let cleanup: (() => void) | void
    const finish = () => {
      if (over) return
      over = true
      clearTimeout(timer)
      cleanup?.()
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    cleanup = start(finish)
  })
}

/**
 * Feuilles de style de la copie chargées (ou en échec). Après le `load` de l'iframe elles le sont déjà en principe
 * (un `<link rel=stylesheet>` retarde le `load` du document) ; on vérifie quand même, au plus `timeoutMs`.
 */
export function whenStylesheetsLoaded(doc: Document, timeoutMs: number = WAIT_MS.styles): Promise<void> {
  const pending = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')).filter((link) => !link.sheet)
  if (pending.length === 0) return Promise.resolve()
  return settle((done) => {
    let left = pending.length
    const one = () => {
      left -= 1
      if (left <= 0) done()
    }
    for (const link of pending) {
      link.addEventListener('load', one, { once: true })
      link.addEventListener('error', one, { once: true })
    }
    return () => {
      for (const link of pending) {
        link.removeEventListener('load', one)
        link.removeEventListener('error', one)
      }
    }
  }, timeoutMs)
}

/** Polices de la copie chargées (`document.fonts.ready`) : sinon le texte se remet en page après la mesure. */
export function whenFontsLoaded(doc: Document, timeoutMs: number = WAIT_MS.fonts): Promise<void> {
  const ready = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready
  if (!ready) return Promise.resolve()
  return settle((done) => {
    ready.then(done, done)
  }, timeoutMs)
}

/** Image entourée chargée (ou en échec) : une image `loading="lazy"` part quand la page la centre. */
export function whenImageLoaded(element: Element, timeoutMs: number = WAIT_MS.image): Promise<void> {
  // tagName plutôt qu'instanceof : l'élément vient d'un autre document (autre royaume JS).
  if (element.tagName !== 'IMG') return Promise.resolve()
  const image = element as HTMLImageElement
  if (image.complete) return Promise.resolve()
  return settle((done) => {
    image.addEventListener('load', done, { once: true })
    image.addEventListener('error', done, { once: true })
    return () => {
      image.removeEventListener('load', done)
      image.removeEventListener('error', done)
    }
  }, timeoutMs)
}

/**
 * Lit la copie rendue dans l'iframe (même origine) : élément qui affiche l'asset, défilement qui le centre, cadre
 * rouge dans la miniature. null : document initial (about:blank), la copie n'est pas encore là.
 */
export function inspectLivePage(iframe: HTMLIFrameElement | null, hash: string | null, occurrence: number): LiveResult | null {
  let doc: Document | null
  let win: Window | null
  try {
    // null (ou exception) : document illisible, cadre retiré.
    doc = iframe?.contentDocument ?? null
    win = iframe?.contentWindow ?? null
    if (!doc || !win) return { status: 'unavailable' }
    if (win.location.href === 'about:blank') return null
  } catch {
    return { status: 'unavailable' }
  }
  const root = doc.documentElement
  if (!root || !doc.body) return null // rien d'analysé pour l'instant
  if (!hash) return { status: 'missing' }
  // Pas de barre de défilement dans la miniature (le défilement par script reste possible).
  root.style.setProperty('scrollbar-width', 'none')
  const target = pickTarget(findAssetElements(doc, hash), occurrence, boxOf)
  if (!target) return { status: 'missing' }
  const viewport = { width: root.clientWidth || LIVE_PAGE_WIDTH, height: root.clientHeight || LIVE_PAGE_HEIGHT }
  const page = { width: root.scrollWidth, height: root.scrollHeight }
  const scroll = centerScroll({ ...target.box, x: target.box.x + win.scrollX, y: target.box.y + win.scrollY }, viewport, page)
  win.scrollTo({ left: scroll.left, top: scroll.top, behavior: 'instant' })
  // Boîte relue APRÈS le défilement (bornes du document comprises) : c'est elle que montre la miniature.
  const frame = frameBox(boxOf(target.element), LIVE_SCALE)
  return frame ? { status: 'ready', frame, element: target.element } : { status: 'missing' }
}

/**
 * Après le `load` de l'iframe : feuilles de style puis polices (sinon la mise en page mesurée est fausse), recherche et
 * défilement ; si l'image entourée n'est pas encore là, on l'attend puis on remesure.
 */
export async function measureLivePage(iframe: HTMLIFrameElement | null, hash: string | null, occurrence: number): Promise<LiveResult | null> {
  let doc: Document | null = null
  try {
    doc = iframe?.contentDocument ?? null
  } catch {
    return { status: 'unavailable' }
  }
  if (!doc) return { status: 'unavailable' }
  await whenStylesheetsLoaded(doc)
  await whenFontsLoaded(doc)
  const first = inspectLivePage(iframe, hash, occurrence)
  if (first?.status !== 'ready') return first
  if (first.element.tagName !== 'IMG' || (first.element as HTMLImageElement).complete) return first
  await whenImageLoaded(first.element)
  return inspectLivePage(iframe, hash, occurrence) ?? first
}
