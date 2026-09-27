import type { FieldDef } from '@/admin/core/contracts'

/**
 * Champs de `siteSettings` édités en B2 (General). PUR.
 *
 * Le manifeste (`src/admin.config.ts`) ne déclare que le document (`settings: { type, id }`), pas ses champs :
 * ils sont décrits ici, recopiés du schéma (`src/sanity/schemaTypes/siteSettings.ts`), et `fields.test.ts` vérifie
 * la concordance (nom, type, obligation, longueur max) en exécutant les vraies règles du schéma.
 * Ces FieldDef sont passés à `saveDraftField` pour la validation serveur (l'API Sanity n'applique pas le schéma).
 */

export const GENERAL_TEXT_FIELDS = {
  title: { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 60 },
  description: { name: 'description', label: 'Description', kind: 'text', maxLength: 160 },
} as const satisfies Record<string, FieldDef>

export const GENERAL_BOOLEAN_FIELDS = {
  allowIndexing: { name: 'allowIndexing', label: 'Search engines', kind: 'boolean' },
} as const satisfies Record<string, FieldDef>

export const GENERAL_IMAGE_FIELDS = {
  faviconLight: { name: 'faviconLight', label: 'Light favicon', kind: 'image' },
  faviconDark: { name: 'faviconDark', label: 'Dark favicon', kind: 'image' },
  socialImage: { name: 'socialImage', label: 'Social Preview', kind: 'image' },
} as const satisfies Record<string, FieldDef>

export type GeneralTextField = keyof typeof GENERAL_TEXT_FIELDS
export type GeneralImageSlot = keyof typeof GENERAL_IMAGE_FIELDS
export type GeneralValueField = GeneralTextField | keyof typeof GENERAL_BOOLEAN_FIELDS

export const GENERAL_TEXT_FIELD_NAMES = Object.keys(GENERAL_TEXT_FIELDS) as GeneralTextField[]
export const GENERAL_IMAGE_SLOTS = Object.keys(GENERAL_IMAGE_FIELDS) as GeneralImageSlot[]

/** Tous les FieldDef de l'écran, par nom de champ (pour les tests de concordance). */
export const GENERAL_FIELDS: Readonly<Record<string, FieldDef>> = {
  ...GENERAL_TEXT_FIELDS,
  ...GENERAL_BOOLEAN_FIELDS,
  ...GENERAL_IMAGE_FIELDS,
}

// ─── Envoi d'images ──────────────────────────────────────────────────────────

/**
 * Taille max d'un fichier envoyé : 5 Mo, comme les autres envois de l'admin (ImageUpload, pages/server/upload.ts).
 * L'envoi passe par le route handler `POST /admin/settings/general/image` (upload-route.ts), plus par une server
 * action : il ne dépend donc plus de `serverActions.bodySizeLimit` (next.config.ts, rendu au défaut, SEC-02).
 */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024

/** Corps multipart maximal accepté par la route d'envoi : le fichier + 64 Kio pour l'enveloppe (slot, en-têtes, bornes). */
export const UPLOAD_MAX_BODY = UPLOAD_MAX_BYTES + 64 * 1024

/** Libellé de la limite, lu par le client (« 5 MB »). */
export const UPLOAD_MAX_LABEL = `${UPLOAD_MAX_BYTES / (1024 * 1024)} MB`

/** Message d'erreur d'un fichier trop lourd (même texte côté navigateur et serveur). */
export const UPLOAD_TOO_LARGE = `This image is larger than ${UPLOAD_MAX_LABEL}. Use a smaller file.`

export type ImageKind = 'png' | 'jpeg' | 'webp' | 'svg' | 'ico'

export const IMAGE_MIME: Readonly<Record<ImageKind, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
}

/** Formats par emplacement (Figma B2 : « PNG, JPG, SVG, ICO pour les favicons »). */
export const SLOT_FORMATS: Readonly<Record<GeneralImageSlot, readonly ImageKind[]>> = {
  faviconLight: ['png', 'jpeg', 'svg', 'ico'],
  faviconDark: ['png', 'jpeg', 'svg', 'ico'],
  socialImage: ['png', 'jpeg', 'webp'],
}

/** Valeur de l'attribut `accept` d'un sélecteur de fichier pour l'emplacement. */
export function acceptFor(slot: GeneralImageSlot): string {
  const mimes = SLOT_FORMATS[slot].map((kind) => IMAGE_MIME[kind])
  if (SLOT_FORMATS[slot].includes('ico')) mimes.push('image/vnd.microsoft.icon', '.ico')
  return mimes.join(',')
}

/** « PNG, JPG, SVG or ICO · 5 MB max » */
export function formatsLabel(slot: GeneralImageSlot): string {
  const names = SLOT_FORMATS[slot].map((kind) => (kind === 'jpeg' ? 'JPG' : kind === 'webp' ? 'WebP' : kind.toUpperCase()))
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0]
  return `${list} · ${UPLOAD_MAX_LABEL} max`
}
