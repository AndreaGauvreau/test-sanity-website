/**
 * Contraste WCAG 2.x, porté de scripts/bench/lib.mjs (validé sur 50 cas). Pur.
 * Les couleurs sont des valeurs calculées par le navigateur (rgb(), rgba(), syntaxe à espaces) ou des hex de tokens.json.
 */

export type Rgba = { r: number; g: number; b: number; a: number }

/** Couche de fond traversée par un texte : backgroundColor et backgroundImage calculés. */
export type BackgroundLayer = { color: string; image: string }

/** Contraste d’un texte sur son fond effectif ; ratio, ok et background à null si le fond ne se lit pas. */
export type TextContrast = { ratio: number | null; required: number; ok: boolean | null; background: string | null }

// rgb()/rgba() en syntaxe à virgules ou à espaces (avec slash), alpha en nombre ou en %.
const RGB = /^rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?%?))?\s*\)$/i
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }

/** Couleur CSS en { r, g, b, a } (a de 0 à 1), ou null si la syntaxe n’est pas lue (oklch(), color()…). */
export function parseColor(value: string): Rgba | null {
  const s = value.trim()
  if (s.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  const hex = s.match(HEX)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1]
    const n = parseInt(digits, 16)
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const m = s.match(RGB)
  if (!m) return null
  const [, r, g, b, alpha] = m
  const a = alpha === undefined ? 1 : alpha.endsWith('%') ? parseFloat(alpha) / 100 : parseFloat(alpha)
  return { r: Number(r), g: Number(g), b: Number(b), a }
}

/** Compose top sur bottom (supposé opaque) : couleur opaque. */
export function blend(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a
  return {
    r: Math.round(top.r * a + bottom.r * (1 - a)),
    g: Math.round(top.g * a + bottom.g * (1 - a)),
    b: Math.round(top.b * a + bottom.b * (1 - a)),
    a: 1,
  }
}

/** Luminance relative WCAG 2.x (seuil de linéarisation 0.03928). */
export function luminance(color: Rgba): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

// Fond semi-transparent composé sur du blanc : un fond est toujours opaque au bout du compte.
function opaqueBackground(value: string): Rgba | null {
  const color = parseColor(value)
  if (!color) return null
  return color.a < 1 ? blend(color, WHITE) : color
}

// Premier plan semi-transparent composé sur le fond (opaque).
function contrastOf(fg: Rgba, bg: Rgba): number {
  const front = fg.a < 1 ? blend(fg, bg) : fg
  const l1 = luminance(front)
  const l2 = luminance(bg)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/** Ratio WCAG entre deux couleurs CSS ; null si l’une ne se lit pas. */
export function contrastRatio(fg: string, bg: string): number | null {
  const front = parseColor(fg)
  const back = opaqueBackground(bg)
  if (!front || !back) return null
  return contrastOf(front, back)
}

function weightOf(weight: string | number): number {
  if (typeof weight === 'number') return weight
  if (weight === 'bold') return 700
  if (weight === 'normal') return 400
  const n = Number(weight)
  return Number.isNaN(n) ? 400 : n
}

/** Contraste minimal WCAG AA : 3 pour un grand texte (≥ 24 px, ou ≥ 18,66 px en graisse ≥ 700), 4,5 sinon. */
export function requiredContrast(fontSizePx: number, fontWeight: string | number): number {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && weightOf(fontWeight) >= 700)
  return large ? 3 : 4.5
}

// Fonctions de couleur CSS : seules rgb()/rgba() sont lues, les autres rendent le fond inconnu.
const COLOR_FUNCTION = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color|light-dark|device-cmyk)\(/gi

// Couleurs d’un dégradé ; null si l’une d’elles ne se lit pas (l’ignorer donnerait un contraste faux sans le dire).
function gradientColors(image: string): Rgba[] | null {
  const names = Array.from(image.matchAll(COLOR_FUNCTION), (match) => match[1].toLowerCase())
  if (names.some((name) => name !== 'rgb' && name !== 'rgba')) return null
  const colors = (image.match(/rgba?\([^)]*\)/gi) ?? []).map(parseColor)
  return colors.some((color) => !color) ? null : (colors as Rgba[])
}

const GRADIENT_LAYER = /^(?:-webkit-)?(?:repeating-)?(?:linear|radial|conic)-gradient\(\)$/i

// Liste blanche des images : chaque couche est none ou un dégradé. Toute autre image (url(), image-set(), paint(),
// cross-fade()…) peint des couleurs qu’on ne lit pas ; l’ignorer à côté d’un dégradé donnerait un contraste faux.
// Un dégradé calculé ne contient ni guillemets ni url() : une chaîne pourrait y cacher des parenthèses.
function onlyGradients(image: string): boolean {
  if (/["']|url\(/i.test(image)) return false
  let skeleton = ''
  let depth = 0
  for (const char of image) {
    if (char === ')') depth--
    if (depth < 0) return false
    if (depth === 0) skeleton += char
    if (char === '(') depth++
  }
  if (depth !== 0) return false
  return skeleton.split(',').every((layer) => layer.trim() === 'none' || GRADIENT_LAYER.test(layer.trim()))
}

/** Pire contraste de fg face à un fond et à son dégradé ; null derrière une autre image ou une couleur illisible. */
export function worstContrast(fg: string, backgroundColor: string, backgroundImage: string): number | null {
  if (!backgroundImage || backgroundImage === 'none') return contrastRatio(fg, backgroundColor)
  if (!onlyGradients(backgroundImage)) return null
  const front = parseColor(fg)
  const back = opaqueBackground(backgroundColor)
  if (!front || !back) return null
  const stops = gradientColors(backgroundImage)
  if (!stops || stops.length === 0) return null
  return Math.min(...stops.map((stop) => contrastOf(front, blend(stop, back))))
}

// Fonds opaques possibles derrière un texte. layers va du plus proche au plus lointain ; on peint du plus
// lointain au plus proche, sur du blanc : couleur de la couche, puis son image. Un dégradé donne un fond
// possible par couleur. null si une image autre qu’un dégradé s’interpose ou si une couleur ne se lit pas.
function backgroundCandidates(layers: BackgroundLayer[]): Rgba[] | null {
  let candidates = [WHITE]
  for (const layer of [...layers].reverse()) {
    const color = parseColor(layer.color)
    if (!color && layer.color && layer.color !== 'none') return null
    if (color && color.a >= 1) candidates = [{ ...color, a: 1 }]
    else if (color && color.a > 0) candidates = candidates.map((below) => blend(color, below))
    const image = layer.image
    if (!image || image === 'none') continue
    if (!onlyGradients(image)) return null
    const stops = gradientColors(image)
    if (!stops || stops.length === 0) return null
    candidates = stops.flatMap((stop) => candidates.map((below) => blend(stop, below)))
  }
  return candidates
}

const rgbString = (color: Rgba) => `rgb(${color.r}, ${color.g}, ${color.b})`

/** Contraste d’un texte sur son fond effectif : pire cas, arrondi à 0,01, avec le fond de ce pire cas. */
export function textContrast(input: {
  color: string
  fontSize: number
  fontWeight: string
  layers: BackgroundLayer[]
}): TextContrast {
  const required = requiredContrast(input.fontSize, input.fontWeight)
  const unknown: TextContrast = { ratio: null, required, ok: null, background: null }
  const candidates = backgroundCandidates(input.layers)
  if (!candidates) return unknown
  let worst: { ratio: number; background: Rgba } | null = null
  for (const background of candidates) {
    const ratio = contrastRatio(input.color, rgbString(background))
    if (ratio === null) return unknown
    if (!worst || ratio < worst.ratio) worst = { ratio, background }
  }
  if (!worst) return unknown
  return {
    ratio: Math.round(worst.ratio * 100) / 100,
    required,
    ok: worst.ratio >= required,
    background: rgbString(worst.background),
  }
}

/**
 * Ton d’une couleur pour le prompt : « clair » au-dessus de la luminance 0,1791 (où le contraste
 * avec le noir égale celui avec le blanc), « sombre » en dessous ; null si la couleur ne se lit pas.
 */
export function colorTone(value: string): 'clair' | 'sombre' | null {
  const color = parseColor(value)
  if (!color) return null
  return luminance(color) > 0.1791 ? 'clair' : 'sombre'
}

/**
 * Ratio tel que l'écrivent les textes anglais (sortie de measure, consignes à Claude) : deux décimales au plus, point
 * décimal (3.074 → « 3.07 », 4.5 → « 4.5 »).
 */
export function formatRatio(ratio: number): string {
  return String(Math.round(ratio * 100) / 100)
}
