import type { UsagePlaceView, UsagePreview } from './usage'

/**
 * Miniatures de l'Usage tooltip (C5, Figma « Usage tooltip » 336:1082) : pour chaque emplacement, une vue fidèle
 * du site en 278 × 124 avec le média entouré en rouge. PUR (le DOM de la page n'est lu qu'à travers les fonctions
 * qui le reçoivent ; `cleanPageHtml` n'utilise que le DOMParser du navigateur) : choix du mode, copie nettoyée de la
 * page, recherche de l'élément par le hash de l'asset, défilement, cadre rouge.
 *
 * Modes : page vivante (copie nettoyée de la vraie page publique, de même origine, rendue en petit dans une iframe
 * `srcdoc` sans scripts), favicon (FaviconPreview du kit), image de partage (SocialPreview du kit), repli (l'image seule).
 */

export type Size = { width: number; height: number }
/** Rectangle en px (x, y = coin haut gauche). */
export type Box = { x: number; y: number; width: number; height: number }

/** Cadre de la miniature du kit (Figma : 278 × 124, radius/sm). */
export const MINIATURE: Size = { width: 278, height: 124 }

/** Largeur CSS à laquelle la page est rendue : mise en page desktop du site. */
export const LIVE_PAGE_WIDTH = 1280
/** Réduction de la page vers la miniature (278 / 1280). */
export const LIVE_SCALE = MINIATURE.width / LIVE_PAGE_WIDTH
/** Hauteur de la fenêtre de l'iframe : une fois réduite, elle remplit les 124 px visibles (571 px de page). */
export const LIVE_PAGE_HEIGHT = Math.ceil(MINIATURE.height / LIVE_SCALE)

/**
 * Pages vivantes par info-bulle, au plus : chaque miniature vivante rend une page entière (sa copie nettoyée : HTML,
 * CSS, polices et TOUTES ses images — sans scripts, `loading="lazy"` est ignoré). Les emplacements suivants passent
 * au repli (l'image seule, entourée), sans mention.
 */
export const MAX_LIVE_MINIATURES = 3

/**
 * Garde d'une page vivante : lecture de la page (fetch) puis rendu de sa copie ; au-delà, repli « Live page
 * unavailable » (en local, next dev compile la page à sa première visite : plusieurs secondes).
 */
export const LIVE_TIMEOUT_MS = 20_000

/** Cadre rouge : taille minimale lisible (px de la miniature) pour un très petit élément. */
export const MIN_FRAME = 8

export type MiniatureMode =
  | { kind: 'live'; path: string; occurrence: number }
  | { kind: 'favicon'; theme: 'light' | 'dark' }
  | { kind: 'social'; domain: string; title: string; description?: string }
  /** `limit` : page publique mais plus de MAX_LIVE_MINIATURES emplacements ; `none` : aucune page où le montrer. */
  | { kind: 'fallback'; reason: 'limit' | 'none' }

/**
 * Chemin utilisable pour une iframe de MÊME ORIGINE que l'admin : chemin absolu du site (« /blog/x »), jamais une
 * URL (« https:// », « //hôte », « javascript: ») ; normalisé, sans fragment. null si refusé.
 */
export function livePagePath(path: string | null | undefined): string | null {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return null
  try {
    const base = 'http://same-origin.invalid'
    const url = new URL(path, base)
    if (url.origin !== base) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

/**
 * Mode de la miniature de chaque emplacement, dans l'ordre. Page vivante pour les MAX_LIVE_MINIATURES premiers
 * emplacements qui ont une page publique (images et vidéos seulement : un autre fichier n'a pas d'élément à
 * entourer), repli pour les suivants. `occurrence` : rang de l'emplacement parmi ceux de la même page (le
 * 2e emplacement d'un article entoure la 2e apparition de l'image sur la page).
 */
export function miniatureModes(
  places: readonly Pick<UsagePlaceView, 'preview'>[],
  assetKind: 'image' | 'video' | 'file' = 'image',
  max = MAX_LIVE_MINIATURES,
): MiniatureMode[] {
  let live = 0
  const seen = new Map<string, number>()
  return places.map(({ preview }): MiniatureMode => {
    if (!preview) return { kind: 'fallback', reason: 'none' }
    if (preview.kind === 'favicon') return { kind: 'favicon', theme: preview.theme }
    if (preview.kind === 'social') return socialMode(preview)
    const path = livePagePath(preview.path)
    if (!path || assetKind === 'file') return { kind: 'fallback', reason: 'none' }
    const occurrence = seen.get(path) ?? 0
    seen.set(path, occurrence + 1)
    if (live >= max) return { kind: 'fallback', reason: 'limit' }
    live += 1
    return { kind: 'live', path, occurrence }
  })
}

function socialMode(preview: Extract<UsagePreview, { kind: 'social' }>): MiniatureMode {
  return { kind: 'social', domain: preview.domain, title: preview.title, ...(preview.description ? { description: preview.description } : {}) }
}

// ─── Copie nettoyée de la page ─────────────────────────────────────────────────────────────────

/** Retirés : scripts, `<noscript>` (rendu quand les scripts sont coupés : iframe GTM ns.html…), documents et plugins
 *  imbriqués, audio, `<base>` d'origine (remplacée), `<meta http-equiv>` (refresh : navigation du cadre). */
const REMOVED_ELEMENTS = 'script, noscript, iframe, frame, frameset, object, embed, applet, portal, audio, base, meta[http-equiv]'
/** `<link rel>` retirés : scripts, pages et connexions préchargés (feuilles de style, polices et images restent). */
const REMOVED_LINK_RELS = new Set(['modulepreload', 'prefetch', 'prerender', 'preconnect', 'dns-prefetch', 'manifest'])
/** `<link rel="preload">` gardés (`as`) : ce qu'il faut pour dessiner la page. */
const KEPT_PRELOADS = new Set(['style', 'font', 'image'])
/** Attributs d'URL vidés s'ils portent une URL `javascript:` (défense en plus du bac à sable sans scripts). */
const URL_BEARING = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'data', 'xlink:href', 'ping'])

/**
 * Copie de la page publique pour une iframe `srcdoc` : RIEN qui exécute ou appelle du code, tout ce qui dessine.
 * Retire tous les `script`, `noscript`, `iframe`, `frame`, `object`, `embed`, `audio`, `<link>` de préchargement de
 * scripts (`preload as=script`, `modulepreload`, `prefetch`…), les attributs `on*` et les URL `javascript:` ; garde
 * les feuilles de style (`link[rel=stylesheet]`, `style`), les images (`img`, `picture`, `source`) et l'affiche des
 * vidéos (`video[poster]`, sans `src`, `source` ni lecture automatique). Pose `<base href>` en tête du `<head>` :
 * les URL relatives (CSS, /_next/image, polices) se résolvent comme sur la page. Toujours en mode standard (doctype).
 */
export function cleanPageHtml(html: string, baseHref: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const element of Array.from(doc.querySelectorAll(REMOVED_ELEMENTS))) element.remove()
  for (const link of Array.from(doc.querySelectorAll('link'))) {
    const rels = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const as = (link.getAttribute('as') ?? '').toLowerCase()
    if (rels.some((rel) => REMOVED_LINK_RELS.has(rel)) || (rels.includes('preload') && !KEPT_PRELOADS.has(as))) link.remove()
  }
  for (const video of Array.from(doc.querySelectorAll('video'))) {
    video.removeAttribute('src')
    video.removeAttribute('autoplay')
    video.setAttribute('preload', 'none')
    for (const child of Array.from(video.querySelectorAll('source, track'))) child.remove()
  }
  for (const element of Array.from(doc.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      // eslint-disable-next-line no-control-regex
      const value = attribute.value.replace(/[\u0000- ]/g, '').toLowerCase()
      if (name.startsWith('on') || (URL_BEARING.has(name) && value.startsWith('javascript:'))) element.removeAttribute(attribute.name)
    }
  }
  const base = doc.createElement('base')
  base.setAttribute('href', baseHref)
  doc.head.prepend(base)
  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`
}

/** Hash du fichier dans l'id Sanity (« image-<hash>-<w>x<h>-<ext> », « file-<hash>-<ext> ») : il figure dans l'URL CDN. */
export function assetHash(assetId: string): string | null {
  const m = /^(?:image|file)-([a-f0-9]{16,})-/i.exec(assetId)
  return m ? m[1].toLowerCase() : null
}

// Attributs qui portent l'URL d'un média (l'URL CDN contient le hash, y compris encodée dans /_next/image?url=…).
const URL_ATTRIBUTES: readonly (readonly [tag: string, attribute: string])[] = [
  ['img', 'src'],
  ['img', 'srcset'],
  ['source', 'srcset'],
  ['source', 'src'],
  ['video', 'poster'],
  ['video', 'src'],
]

/** Élément qui AFFICHE le média : une <source> est montrée par l'<img> de son <picture> (ou par sa <video>). */
function displayElement(element: Element): Element {
  if (element.tagName.toLowerCase() !== 'source') return element
  const parent = element.parentElement
  if (!parent) return element
  if (parent.tagName.toLowerCase() === 'picture') return parent.querySelector('img') ?? parent
  return parent
}

/**
 * Éléments de la page qui affichent l'asset, dans l'ordre du document : `img` (src, srcset, currentSrc),
 * `source` (srcset, src → l'img du picture), `video` (poster, src), `background-image` en style.
 * Le hash (hexadécimal) ne change pas une fois encodé : une recherche de sous-chaîne suffit.
 */
export function findAssetElements(doc: Document, hash: string): Element[] {
  if (!/^[a-f0-9]{16,}$/i.test(hash)) return []
  const found = new Set<Element>()
  const selector = URL_ATTRIBUTES.map(([tag, attribute]) => `${tag}[${attribute}*="${hash}"]`).join(', ')
  for (const element of Array.from(doc.querySelectorAll(selector))) found.add(displayElement(element))
  for (const element of Array.from(doc.querySelectorAll(`[style*="${hash}"]`))) {
    if (/background/i.test(element.getAttribute('style') ?? '')) found.add(element)
  }
  // currentSrc : image réellement choisie dans le srcset (propriété, sans attribut correspondant).
  for (const image of Array.from(doc.images)) {
    if (typeof image.currentSrc === 'string' && image.currentSrc.includes(hash)) found.add(image)
  }
  // Node.DOCUMENT_POSITION_FOLLOWING = 4 (valeur fixe ; les éléments viennent d'un autre document).
  return [...found].sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & 4 ? -1 : 1))
}

/**
 * Élément à entourer : parmi les éléments VISIBLES (boîte non vide), celui de rang `occurrence` (sinon le dernier
 * visible). null : aucun élément affiché (image masquée à cette largeur, page sans l'image).
 */
export function pickTarget<T>(elements: readonly T[], occurrence: number, boxOf: (element: T) => Box): { element: T; box: Box } | null {
  const visible: { element: T; box: Box }[] = []
  for (const element of elements) {
    const box = boxOf(element)
    if (box.width > 0 && box.height > 0) visible.push({ element, box })
  }
  if (visible.length === 0) return null
  return visible[Math.min(Math.max(0, occurrence), visible.length - 1)]
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Défilement de la page (px) qui centre la boîte (coordonnées du DOCUMENT) dans la fenêtre de l'iframe, borné au
 * document : un élément en haut de page reste en haut, un élément en bas reste en bas.
 */
export function centerScroll(box: Box, viewport: Size, page: Size): { left: number; top: number } {
  return {
    left: Math.round(clamp(box.x + box.width / 2 - viewport.width / 2, 0, page.width - viewport.width)),
    top: Math.round(clamp(box.y + box.height / 2 - viewport.height / 2, 0, page.height - viewport.height)),
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Cadre rouge dans la miniature : boîte de l'élément (px de la FENÊTRE de l'iframe, après défilement) × échelle,
 * agrandie autour de son centre jusqu'à `min` px si l'élément est minuscule, puis bornée à la miniature.
 * null : l'élément est hors de la zone visible.
 */
export function frameBox(box: Box, scale: number, bounds: Size = MINIATURE, min = MIN_FRAME): Box | null {
  let x = box.x * scale
  let y = box.y * scale
  let width = box.width * scale
  let height = box.height * scale
  if (width < min) {
    x -= (min - width) / 2
    width = min
  }
  if (height < min) {
    y -= (min - height) / 2
    height = min
  }
  const left = Math.max(0, x)
  const top = Math.max(0, y)
  const right = Math.min(bounds.width, x + width)
  const bottom = Math.min(bounds.height, y + height)
  if (right - left < 1 || bottom - top < 1) return null
  return { x: round2(left), y: round2(top), width: round2(right - left), height: round2(bottom - top) }
}

/**
 * Plus grand rectangle au ratio de `natural` qui tient dans `area`, centré dans `area` (object-fit: contain).
 * Sans dimensions connues : 16 / 9.
 */
export function containBox(natural: Size | null | undefined, area: Box): Box {
  const ratio = natural && natural.width > 0 && natural.height > 0 ? natural.width / natural.height : 16 / 9
  let width = area.width
  let height = width / ratio
  if (height > area.height) {
    height = area.height
    width = height * ratio
  }
  return {
    x: round2(area.x + (area.width - width) / 2),
    y: round2(area.y + (area.height - height) / 2),
    width: round2(width),
    height: round2(height),
  }
}

/** Zone de l'image du repli : marges de 10 px, et place pour la mention (Tag de 16 px à 8 px du bas) si besoin. */
export function fallbackArea(withNote: boolean): Box {
  return withNote
    ? { x: 10, y: 8, width: MINIATURE.width - 20, height: MINIATURE.height - 8 - 30 }
    : { x: 10, y: 10, width: MINIATURE.width - 20, height: MINIATURE.height - 20 }
}

/**
 * FaviconPreview du kit (Figma 410:1592) : cadre navigateur 180 × 110, favicon 16 × 16 à x 72 / y 35
 * (FaviconPreview.module.css). Montré à sa taille, centré dans la miniature ; son pied (libellé) est rogné.
 */
export const FAVICON_STAGE = { width: 180, height: 110, icon: { x: 72, y: 35, size: 16 } } as const

/** Position du cadre navigateur dans la miniature, et cadre rouge autour du favicon (4 px d'air). */
export function faviconLayout(bounds: Size = MINIATURE): { stage: Box; frame: Box } {
  const stage = {
    x: (bounds.width - FAVICON_STAGE.width) / 2,
    y: (bounds.height - FAVICON_STAGE.height) / 2,
    width: FAVICON_STAGE.width,
    height: FAVICON_STAGE.height,
  }
  const air = 4
  const { x, y, size } = FAVICON_STAGE.icon
  return { stage, frame: { x: stage.x + x - air, y: stage.y + y - air, width: size + 2 * air, height: size + 2 * air } }
}

/**
 * SocialPreview du kit (Figma 338:1245) : carte de 400 px (image 1200 / 630 sous un contour de 1 px, puis le texte),
 * réduite pour tenir dans la hauteur de la miniature, centrée ; le bas de la carte au-delà de 300 px est rogné.
 */
export const SOCIAL_STAGE = { width: 400, height: 300, border: 1, imageRatio: 1200 / 630 } as const

/** Réduction, position de la carte dans la miniature, et cadre rouge autour de son image. */
export function socialLayout(bounds: Size = MINIATURE, padding = 5): { scale: number; stage: Box; frame: Box } {
  const scale = (bounds.height - 2 * padding) / SOCIAL_STAGE.height
  const width = SOCIAL_STAGE.width * scale
  const height = SOCIAL_STAGE.height * scale
  const stage = { x: round2((bounds.width - width) / 2), y: padding, width: round2(width), height: round2(height) }
  const inner = SOCIAL_STAGE.width - 2 * SOCIAL_STAGE.border
  const frame = {
    x: round2(stage.x + SOCIAL_STAGE.border * scale),
    y: round2(stage.y + SOCIAL_STAGE.border * scale),
    width: round2(inner * scale),
    height: round2((inner / SOCIAL_STAGE.imageRatio) * scale),
  }
  return { scale, stage, frame }
}
