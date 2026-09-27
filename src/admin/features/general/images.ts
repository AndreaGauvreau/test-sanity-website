import type { GeneralImageSlot, ImageKind } from './fields'
import { SLOT_FORMATS } from './fields'

/**
 * Images de B2 : références d'assets Sanity, URL du CDN, contrôle du ratio, reconnaissance du format. PUR.
 */

/** Image telle que l'écran la connaît : jamais de jeton, seulement l'URL publique du CDN et les dimensions. */
export type GeneralImage = { ref: string; url: string; width: number; height: number }

const REF = /^image-([A-Za-z0-9]+)-(\d+)x(\d+)-([a-z0-9]+)$/

/** « image-<hash>-1200x630-jpg » → morceaux, ou null si la référence n'est pas celle d'une image Sanity. */
export function parseImageRef(ref: unknown): { id: string; width: number; height: number; format: string } | null {
  if (typeof ref !== 'string') return null
  const match = REF.exec(ref)
  if (!match) return null
  return { id: match[1], width: Number(match[2]), height: Number(match[3]), format: match[4] }
}

/** URL publique de l'image sur le CDN de Sanity (même forme que `@sanity/image-url`). */
export function imageUrlFromRef(ref: string, projectId: string, dataset: string): string | null {
  const parts = parseImageRef(ref)
  if (!parts || !/^[a-z0-9]+$/.test(projectId) || !/^[a-z0-9_-]+$/.test(dataset)) return null
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${parts.id}-${parts.width}x${parts.height}.${parts.format}`
}

/** Valeur Sanity d'un champ image (`{ asset: { _ref } }`) → GeneralImage, ou null. */
export function toGeneralImage(value: unknown, projectId: string, dataset: string): GeneralImage | null {
  const ref = (value as { asset?: { _ref?: unknown } } | null | undefined)?.asset?._ref
  if (typeof ref !== 'string') return null
  const parts = parseImageRef(ref)
  const url = imageUrlFromRef(ref, projectId, dataset)
  if (!parts || !url) return null
  return { ref, url, width: parts.width, height: parts.height }
}

/** Valeur à écrire dans le brouillon pour un asset envoyé. */
export function imageFieldValue(assetId: string): { _type: 'image'; asset: { _type: 'reference'; _ref: string } } {
  return { _type: 'image', asset: { _type: 'reference', _ref: assetId } }
}

/**
 * Avertissement de ratio (Figma B2 : « Image au mauvais ratio : acceptée, avec un avertissement sous l'aperçu »).
 * Favicons : carrés ; image sociale : 1200 × 630 (1,905), tolérance 3 %. SVG : dimensions vectorielles, pas de contrôle de taille minimale.
 */
export function ratioWarning(slot: GeneralImageSlot, image: Pick<GeneralImage, 'width' | 'height'> | null): string | null {
  if (!image || image.width <= 0 || image.height <= 0) return null
  const ratio = image.width / image.height
  if (slot === 'socialImage') {
    if (Math.abs(ratio - 1200 / 630) / (1200 / 630) > 0.03) {
      return `This image is ${image.width} × ${image.height}: it will be cropped to 1200 × 630.`
    }
    if (image.width < 1200) return `This image is ${image.width} × ${image.height}: use 1200 × 630 for a sharp preview.`
    return null
  }
  if (Math.abs(ratio - 1) > 0.03) return `This favicon is ${image.width} × ${image.height}: use a square image (64 × 64).`
  return null
}

/**
 * Format réel d'un fichier d'après ses premiers octets (le type MIME annoncé par le navigateur ne prouve rien).
 * SVG : texte qui contient une balise <svg> (après un éventuel prologue XML ou commentaire).
 */
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  const b = bytes
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return 'png'
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp'
  if (b.length >= 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 && (b[4] | (b[5] << 8)) > 0) return 'ico'
  // BOM UTF-8 (EF BB BF) lu octet par octet, puis espaces de t\u00EAte.
  const head = ascii(b, 0, Math.min(b.length, 1024)).replace(/^\u00EF\u00BB\u00BF/, '').trimStart().toLowerCase()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/.test(head)) return 'svg'
  return null
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let out = ''
  for (let i = from; i < to && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i])
  return out
}

/** Le format reconnu est-il permis pour cet emplacement ? */
export function isAllowedKind(slot: GeneralImageSlot, kind: ImageKind | null): kind is ImageKind {
  return kind !== null && SLOT_FORMATS[slot].includes(kind)
}

/** Nom de fichier sûr pour l'asset (lettres, chiffres, points, tirets), extension conforme au format réel. */
export function safeFileName(name: string, kind: ImageKind): string {
  const ext = kind === 'jpeg' ? 'jpg' : kind
  const base = name
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
  return `${base || 'image'}.${ext}`
}
