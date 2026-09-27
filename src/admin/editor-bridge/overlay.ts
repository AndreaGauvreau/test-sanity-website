/**
 * Calque de l'aperçu (Figma « Canvas selection » 340:1452) : contours et étiquettes dessinés DANS le site, dans un
 * Shadow DOM (les styles du site n'y entrent pas, les nôtres n'en sortent pas), `pointer-events: none`.
 *
 * Aucune boucle rAF permanente (dette du POC) : `render()` est appelé par le runtime quand quelque chose a bougé
 * (défilement, redimensionnement, ResizeObserver, MutationObserver), au plus une fois par image.
 *
 * Les tokens de l'admin (--k-*) n'existent pas dans le site : leurs valeurs sont recopiées ici, nommées d'après le
 * Design System (interactive/primary, text/on-accent, bg/tint/info, radius/sm, Body Small).
 * Échelle : l'iframe est réduite dans l'admin (Desktop 1280 → ~1080) ; `--k` = 1 / échelle grossit traits et
 * étiquettes d'autant, pour qu'ils gardent leur taille Figma à l'écran.
 */

export type BoxKind = 'hover' | 'selected' | 'working' | 'review'

export type OverlayBox = {
  kind: BoxKind
  /** Rectangle dans la fenêtre (getBoundingClientRect). */
  rect: { x: number; y: number; width: number; height: number }
  /** Étiquette au-dessus du contour (absente pour le survol). */
  label?: string
}

const CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  overflow: hidden;
  contain: strict;
  --k: 1;
  /* interactive/primary · text/on-accent · bg/tint/info (Design System de l'admin) */
  --kz-primary: #0099ff;
  --kz-on-accent: #ffffff;
  --kz-tint: rgba(0, 153, 255, 0.14);
}
.box {
  position: absolute;
  left: 0;
  top: 0;
  box-sizing: border-box;
  outline: calc(1px * var(--k)) solid var(--kz-primary);
  outline-offset: 0;
}
.box[data-kind='selected'],
.box[data-kind='review'],
.box[data-kind='working'] {
  outline-width: calc(1.5px * var(--k));
}
.fill {
  position: absolute;
  inset: 0;
  overflow: hidden;
  display: none;
}
.box[data-kind='working'] .fill {
  display: block;
  background: var(--kz-tint);
}
/* Reflet : une bande claire traverse l'élément visé, puis marque une pause (transform seulement). */
.box[data-kind='working'] .fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, 0.5) 50%, rgba(255, 255, 255, 0) 70%);
  transform: translateX(-100%);
  animation: kz-sweep 2.4s cubic-bezier(0.645, 0.045, 0.355, 1) infinite;
}
@keyframes kz-sweep {
  0% { transform: translateX(-100%); }
  70%, 100% { transform: translateX(100%); }
}
.label {
  position: absolute;
  left: calc(-1.5px * var(--k));
  bottom: calc(100% + 5px * var(--k));
  display: none;
  align-items: center;
  gap: calc(4px * var(--k));
  padding: calc(2px * var(--k)) calc(6px * var(--k));
  border-radius: calc(5px * var(--k));
  background: var(--kz-primary);
  color: var(--kz-on-accent);
  font-family: Inter, var(--font-geist, system-ui), system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-weight: 500;
  font-size: calc(12px * var(--k));
  line-height: calc(15px * var(--k));
  letter-spacing: 0;
  white-space: nowrap;
  -webkit-font-smoothing: antialiased;
}
.box[data-kind='selected'] .label,
.box[data-kind='review'] .label,
.box[data-kind='working'] .label {
  display: inline-flex;
}
/* Pas la place au-dessus (élément collé au haut de la fenêtre) : l'étiquette passe à l'intérieur. */
.box[data-flip] .label {
  bottom: auto;
  top: calc(2px * var(--k));
  left: calc(2px * var(--k));
}
.spinner {
  display: none;
  flex: none;
  width: calc(12px * var(--k));
  height: calc(12px * var(--k));
  animation: kz-spin 1s linear infinite;
}
.box[data-kind='working'] .spinner {
  display: block;
}
@keyframes kz-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .box[data-kind='working'] .fill::after,
  .spinner {
    animation: none;
  }
  .box[data-kind='working'] .fill::after {
    display: none;
  }
}
`

/** Icon/loader 12 du Design System (8 rayons d'opacité décroissante), recopiée sans innerHTML. */
const LOADER_RAYS: readonly [string, number][] = [
  ['M6 1.167V2.833', 1],
  ['M9.418 2.582L8.239 3.761', 0.88],
  ['M10.833 6H9.167', 0.75],
  ['M9.418 9.418L8.239 8.239', 0.63],
  ['M6 10.833V9.167', 0.5],
  ['M2.582 9.418L3.761 8.239', 0.38],
  ['M1.167 6H2.833', 0.25],
  ['M2.582 2.582L3.761 3.761', 0.13],
]

const SVG_NS = 'http://www.w3.org/2000/svg'
/** Marge du contour autour de l'élément (Figma D1 : 572 × 58 autour d'un titre de 560 × 46). */
const PAD = 6
/** Hauteur de l'étiquette (19 px) + écart (5 px) : en dessous, pas la place au-dessus de l'élément. */
const LABEL_SPACE = 24

type BoxNodes = { box: HTMLDivElement; label: HTMLSpanElement; text: Text }

export class Overlay {
  readonly host: HTMLElement
  private readonly root: ShadowRoot
  private readonly nodes: BoxNodes[] = []
  private scale = 1

  constructor(private readonly doc: Document) {
    this.host = doc.createElement('kz-editor-overlay')
    this.host.setAttribute('aria-hidden', 'true')
    this.host.setAttribute('data-kz-editor-overlay', '')
    this.root = this.host.attachShadow({ mode: 'open' })
    const style = doc.createElement('style')
    style.textContent = CSS
    this.root.append(style)
  }

  mount(): void {
    if (!this.host.isConnected) this.doc.body.append(this.host)
  }

  unmount(): void {
    this.host.remove()
  }

  setScale(scale: number): void {
    this.scale = scale > 0 && scale <= 1 ? scale : 1
    this.host.style.setProperty('--k', String(1 / this.scale))
  }

  /** Dessine exactement `boxes` (réutilise les nœuds existants, retire le surplus). */
  render(boxes: readonly OverlayBox[]): void {
    const k = 1 / this.scale
    for (let i = 0; i < boxes.length; i++) {
      const nodes = this.nodes[i] ?? this.createBox()
      const { kind, rect, label } = boxes[i]
      const { box } = nodes
      box.dataset.kind = kind
      const pad = PAD * k
      const y = rect.y - pad
      box.style.transform = `translate(${rect.x - pad}px, ${y}px)`
      box.style.width = `${Math.max(0, rect.width) + 2 * pad}px`
      box.style.height = `${Math.max(0, rect.height) + 2 * pad}px`
      if (y < LABEL_SPACE * k) box.dataset.flip = ''
      else delete box.dataset.flip
      if (nodes.text.data !== (label ?? '')) nodes.text.data = label ?? ''
    }
    while (this.nodes.length > boxes.length) this.nodes.pop()?.box.remove()
  }

  /** Nombre de contours affichés (tests). */
  get size(): number {
    return this.nodes.length
  }

  private createBox(): BoxNodes {
    const box = this.doc.createElement('div')
    box.className = 'box'
    const fill = this.doc.createElement('div')
    fill.className = 'fill'
    const label = this.doc.createElement('span')
    label.className = 'label'
    label.append(this.createSpinner())
    const text = this.doc.createTextNode('')
    label.append(text)
    box.append(fill, label)
    this.root.append(box)
    const nodes = { box, label, text }
    this.nodes.push(nodes)
    return nodes
  }

  private createSpinner(): SVGSVGElement {
    const svg = this.doc.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('class', 'spinner')
    svg.setAttribute('viewBox', '0 0 12 12')
    svg.setAttribute('fill', 'none')
    for (const [d, opacity] of LOADER_RAYS) {
      const path = this.doc.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', d)
      path.setAttribute('stroke', 'currentColor')
      path.setAttribute('stroke-width', '1.25')
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('opacity', String(opacity))
      svg.append(path)
    }
    return svg
  }
}
