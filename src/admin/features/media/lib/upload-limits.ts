import type { MediaKind } from './assets'

/**
 * Types et tailles acceptés à l'envoi d'un fichier (C5 « + », Replace ; C4 image d'une fiche). PUR, partagé
 * client / serveur : la route revérifie tout (uploadCore), l'interface s'en sert pour les libellés « N MB max »
 * et pour refuser tout de suite un fichier trop gros ou d'un type refusé (sans l'envoyer).
 *
 * UNE seule source pour les limites : si on change une valeur ici, les libellés, la vérification du navigateur,
 * celle du serveur et la borne du corps de la route (`UPLOAD_MAX_BODY`) suivent.
 */

const MB = 1024 * 1024

/** Types acceptés (liste blanche) → genre. */
export const UPLOAD_TYPES: Readonly<Record<string, MediaKind>> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/avif': 'image',
  'image/svg+xml': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'file',
  'text/plain': 'file',
  'text/csv': 'file',
  'application/zip': 'file',
}

/** Taille maximale d'un fichier, par genre. */
export const UPLOAD_MAX_BYTES: Readonly<Record<MediaKind, number>> = { image: 20 * MB, video: 100 * MB, file: 50 * MB }

/** Corps multipart maximal accepté par la route : le plus gros fichier permis + 1 Mo d'enveloppe. */
export const UPLOAD_MAX_BODY = Math.max(...Object.values(UPLOAD_MAX_BYTES)) + MB

/** `accept` du sélecteur de fichiers de Media (tous les types permis). */
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES).join(',')

/** `accept` d'un champ image (C4). */
export const IMAGE_ACCEPT = Object.keys(UPLOAD_TYPES)
  .filter((type) => UPLOAD_TYPES[type] === 'image')
  .join(',')

/** « 20 MB » : limite d'un genre, en Mo entiers (même convention que `formatBytes` du kit : 1 MB = 1 024 × 1 024). */
export function uploadLimitLabel(kind: MediaKind): string {
  return `${Math.round(UPLOAD_MAX_BYTES[kind] / MB)} MB`
}

/** Libellé « formats » du champ image du kit : « PNG, JPG, WebP, GIF, AVIF or SVG · 20 MB max ». */
export const IMAGE_FORMATS_LABEL = `PNG, JPG, WebP, GIF, AVIF or SVG · ${uploadLimitLabel('image')} max`

/** Valide un fichier (type en liste blanche, taille). Retourne un message d'erreur (anglais) ou null. */
export function checkUpload(file: { type: string; size: number }, expectedKind?: MediaKind): string | null {
  const kind = UPLOAD_TYPES[file.type]
  if (!kind) return 'This file type is not supported (images, MP4, WebM or MOV videos, PDF, text and ZIP files).'
  if (expectedKind && kind !== expectedKind) return `Choose ${expectedKind === 'image' ? 'an image' : expectedKind === 'video' ? 'a video' : 'a file'} to replace this one.`
  if (file.size <= 0) return 'This file is empty.'
  if (file.size > UPLOAD_MAX_BYTES[kind]) return `This file is too large (${uploadLimitLabel(kind)} max).`
  return null
}
