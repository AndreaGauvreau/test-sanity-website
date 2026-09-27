import { describe, expect, it } from 'vitest'

import { acceptFor, formatsLabel } from './fields'
import { imageFieldValue, imageUrlFromRef, isAllowedKind, parseImageRef, ratioWarning, safeFileName, sniffImageKind, toGeneralImage } from './images'

const REF = 'image-d3ca5b45c58ee30dd793a11ad6d6afda7414588e-1200x630-jpg'

describe('références d’images Sanity', () => {
  it('lit la référence et construit l’URL du CDN', () => {
    expect(parseImageRef(REF)).toEqual({ id: 'd3ca5b45c58ee30dd793a11ad6d6afda7414588e', width: 1200, height: 630, format: 'jpg' })
    expect(imageUrlFromRef(REF, 'abc123', 'development')).toBe(
      'https://cdn.sanity.io/images/abc123/development/d3ca5b45c58ee30dd793a11ad6d6afda7414588e-1200x630.jpg',
    )
  })

  it('refuse les références et les projets invalides', () => {
    expect(parseImageRef('file-abc-pdf')).toBeNull()
    expect(parseImageRef(42)).toBeNull()
    expect(imageUrlFromRef(REF, '../evil', 'development')).toBeNull()
    expect(imageUrlFromRef(REF, 'abc', 'dev/../x')).toBeNull()
  })

  it('convertit une valeur de champ image (et l’inverse)', () => {
    expect(toGeneralImage(imageFieldValue(REF), 'abc123', 'development')).toMatchObject({ ref: REF, width: 1200, height: 630 })
    expect(toGeneralImage(null, 'abc123', 'development')).toBeNull()
    expect(toGeneralImage({ asset: {} }, 'abc123', 'development')).toBeNull()
    expect(imageFieldValue(REF)).toEqual({ _type: 'image', asset: { _type: 'reference', _ref: REF } })
  })
})

describe('avertissements de ratio', () => {
  it('favicon carré : rien ; sinon avertissement', () => {
    expect(ratioWarning('faviconLight', { width: 64, height: 64 })).toBeNull()
    expect(ratioWarning('faviconDark', { width: 128, height: 64 })).toMatch(/square/)
  })
  it('image sociale : 1200 × 630 attendu', () => {
    expect(ratioWarning('socialImage', { width: 1200, height: 630 })).toBeNull()
    expect(ratioWarning('socialImage', { width: 2400, height: 1260 })).toBeNull()
    expect(ratioWarning('socialImage', { width: 1000, height: 1000 })).toMatch(/cropped/)
    expect(ratioWarning('socialImage', { width: 600, height: 315 })).toMatch(/sharp/)
    expect(ratioWarning('socialImage', null)).toBeNull()
  })
})

describe('reconnaissance du format par les octets', () => {
  const bytes = (...values: number[]) => new Uint8Array(values)
  const text = (value: string) => new TextEncoder().encode(value)

  it('PNG, JPEG, WebP, ICO, SVG', () => {
    expect(sniffImageKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png')
    expect(sniffImageKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg')
    expect(sniffImageKind(text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('webp')
    expect(sniffImageKind(bytes(0, 0, 1, 0, 1, 0, 16, 16))).toBe('ico')
    expect(sniffImageKind(text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg')
    expect(sniffImageKind(text('<!-- logo --><svg viewBox="0 0 1 1"/>'))).toBe('svg')
    expect(sniffImageKind(new Uint8Array([0xef, 0xbb, 0xbf, ...text('<svg xmlns="http://www.w3.org/2000/svg"/>')]))).toBe('svg')
  })

  it('refuse un faux fichier (HTML déguisé, texte, vide)', () => {
    expect(sniffImageKind(text('<html><script>alert(1)</script></html>'))).toBeNull()
    expect(sniffImageKind(text('hello'))).toBeNull()
    expect(sniffImageKind(new Uint8Array())).toBeNull()
  })

  it('formats permis par emplacement', () => {
    expect(isAllowedKind('faviconLight', 'svg')).toBe(true)
    expect(isAllowedKind('faviconLight', 'webp')).toBe(false)
    expect(isAllowedKind('socialImage', 'webp')).toBe(true)
    expect(isAllowedKind('socialImage', 'svg')).toBe(false)
    expect(isAllowedKind('socialImage', null)).toBe(false)
  })

  it('libellés et accept', () => {
    expect(formatsLabel('faviconLight')).toBe('PNG, JPG, SVG or ICO · 5 MB max')
    expect(formatsLabel('socialImage')).toBe('PNG, JPG or WebP · 5 MB max')
    expect(acceptFor('socialImage')).toBe('image/png,image/jpeg,image/webp')
    expect(acceptFor('faviconDark')).toContain('.ico')
  })

  it('nom de fichier sûr, extension du format réel', () => {
    expect(safeFileName('Mon logo (final).PNG', 'png')).toBe('Mon-logo-final.png')
    expect(safeFileName('../../etc/passwd', 'jpeg')).toBe('etc-passwd.jpg')
    expect(safeFileName('', 'svg')).toBe('image.svg')
  })
})
