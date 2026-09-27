import type { FieldDef } from '@/admin/core/contracts/manifest'

/**
 * Validation serveur d'une valeur d'après son FieldDef (contracts/manifest.ts). Pur.
 * L'API Sanity n'applique PAS les règles du schéma (longueur, obligation, liste fermée) : c'est ici qu'elles le sont,
 * avant toute écriture de l'admin. Retourne un message anglais pour l'interface, ou null si la valeur est bonne.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const KEY = /^[\w-]{1,64}$/

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object' && 'current' in (value as object)) return isEmpty((value as { current?: unknown }).current)
  return false
}

/** Longueur visible : en points de code (un émoji = 1), retours à la ligne exclus. */
export function visibleLength(value: string): number {
  return [...value.replace(/\r?\n/g, '')].length
}

/** Lien sûr : relatif (/, #, ?), http(s), mailto, tel. Jamais javascript:, data:, etc. */
export function isSafeHref(value: string): boolean {
  const v = value.trim()
  if (v === '' || CONTROL_CHARS.test(v) || /\s/.test(v)) return false
  if (v.startsWith('/') && !v.startsWith('//')) return true
  if (v.startsWith('#') || v.startsWith('?')) return true
  try {
    const url = new URL(v)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)
  } catch {
    return false
  }
}

function checkText(field: FieldDef, value: unknown, label: string): string | null {
  if (typeof value !== 'string') return `${label} must be text.`
  if (CONTROL_CHARS.test(value)) return `${label} contains invalid characters.`
  const multiline = field.kind === 'text' || field.maxLines !== undefined
  if (!multiline && /[\r\n]/.test(value)) return `${label} must be a single line.`
  if (field.maxLength !== undefined && visibleLength(value) > field.maxLength) {
    return `${label} must be ${field.maxLength} characters or fewer.`
  }
  if (field.maxLines !== undefined && value.split(/\r?\n/).length > field.maxLines) {
    return `${label} can have at most ${field.maxLines} line${field.maxLines > 1 ? 's' : ''}.`
  }
  return null
}

export function validateFieldValue(field: FieldDef, value: unknown, parentLabel?: string): string | null {
  const label = parentLabel ? `${parentLabel} · ${field.label}` : field.label
  if (isEmpty(value)) return field.required ? `${label} is required.` : null

  switch (field.kind) {
    case 'string':
    case 'text':
      return checkText(field, value, label)
    case 'url': {
      const err = checkText({ ...field, kind: 'string' }, value, label)
      if (err) return err
      return isSafeHref(value as string) ? null : `${label} must be a valid link (https://…, /page, mailto:…).`
    }
    case 'slug': {
      const current = typeof value === 'string' ? value : (value as { current?: unknown }).current
      if (typeof current !== 'string' || !SLUG.test(current)) return `${label} can only use lowercase letters, numbers and dashes.`
      if (field.maxLength !== undefined && current.length > field.maxLength) return `${label} must be ${field.maxLength} characters or fewer.`
      return null
    }
    case 'select': {
      const allowed = field.options?.map((o) => o.value) ?? []
      return typeof value === 'string' && allowed.includes(value) ? null : `${label} must be one of the proposed options.`
    }
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `${label} must be a number.`
    case 'boolean':
      return typeof value === 'boolean' ? null : `${label} must be on or off.`
    case 'date':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? null : `${label} must be a valid date.`
    case 'reference': {
      const ref = (value as { _ref?: unknown })?._ref
      return typeof ref === 'string' && /^[\w.-]+$/.test(ref) && !ref.startsWith('drafts.') ? null : `${label} must point to an existing item.`
    }
    case 'image': {
      const ref = (value as { asset?: { _ref?: unknown } })?.asset?._ref
      return typeof ref === 'string' && ref.startsWith('image-') ? null : `${label} must be an image from the media library.`
    }
    case 'portableText': {
      if (!Array.isArray(value)) return `${label} must be rich text.`
      const bad = value.some((b) => !b || typeof b !== 'object' || typeof (b as { _type?: unknown })._type !== 'string' || !KEY.test(String((b as { _key?: unknown })._key)))
      return bad ? `${label} contains invalid blocks.` : null
    }
    case 'cta':
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return `${label} is invalid.`
      for (const sub of field.fields ?? []) {
        const err = validateFieldValue(sub, (value as Record<string, unknown>)[sub.name], label)
        if (err) return err
      }
      return null
    }
    case 'array': {
      if (!Array.isArray(value)) return `${label} must be a list.`
      const item = field.itemLabel ?? 'item'
      if (field.min !== undefined && value.length < field.min) return `${label} needs at least ${field.min} ${item.toLowerCase()}${field.min > 1 ? 's' : ''}.`
      if (field.max !== undefined && value.length > field.max) return `${label} can have at most ${field.max} ${item.toLowerCase()}${field.max > 1 ? 's' : ''}.`
      const keys = new Set<string>()
      for (const [i, entry] of value.entries()) {
        if (!entry || typeof entry !== 'object') return `${label} contains an invalid ${item.toLowerCase()}.`
        const key = (entry as { _key?: unknown })._key
        if (typeof key !== 'string' || !KEY.test(key) || keys.has(key)) return `${label} contains an invalid ${item.toLowerCase()}.`
        keys.add(key)
        for (const sub of field.fields ?? []) {
          const err = validateFieldValue(sub, (entry as Record<string, unknown>)[sub.name], `${label} ${i + 1}`)
          if (err) return err
        }
      }
      return null
    }
  }
}
