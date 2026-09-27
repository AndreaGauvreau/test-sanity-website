import { describe, expect, it } from 'vitest'

import type { FieldDef } from '@/admin/core/contracts/manifest'

import { isSafeHref, validateFieldValue, visibleLength } from './validate'

const title: FieldDef = { name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 10 }

describe('validateFieldValue — texte', () => {
  it('obligation et longueur visible (émoji = 1)', () => {
    expect(validateFieldValue(title, '')).toBe('Title is required.')
    expect(validateFieldValue(title, '   ')).toBe('Title is required.')
    expect(validateFieldValue(title, 'Hello')).toBeNull()
    expect(validateFieldValue(title, '0123456789')).toBeNull()
    expect(validateFieldValue(title, '01234567890')).toBe('Title must be 10 characters or fewer.')
    expect(visibleLength('🚚🚚')).toBe(2)
    expect(validateFieldValue(title, '🚚'.repeat(10))).toBeNull()
  })
  it('champ facultatif vide → accepté', () => {
    expect(validateFieldValue({ ...title, required: false }, null)).toBeNull()
  })
  it('une ligne pour string ; lignes bornées avec maxLines', () => {
    expect(validateFieldValue(title, 'a\nb')).toBe('Title must be a single line.')
    const lines: FieldDef = { name: 'h', label: 'Heading', kind: 'string', maxLines: 2 }
    expect(validateFieldValue(lines, 'a\nb')).toBeNull()
    expect(validateFieldValue(lines, 'a\nb\nc')).toBe('Heading can have at most 2 lines.')
  })
  it('refuse caractères de contrôle et non-texte', () => {
    expect(validateFieldValue(title, 'a\u0000b')).toBe('Title contains invalid characters.')
    expect(validateFieldValue(title, 42)).toBe('Title must be text.')
  })
})

describe('validateFieldValue — autres types', () => {
  it('url : liens sûrs seulement', () => {
    const url: FieldDef = { name: 'href', label: 'Link', kind: 'url' }
    for (const ok of ['https://conduit.com', '/pricing', '#faq', 'mailto:a@b.com', 'tel:+33123']) expect(validateFieldValue(url, ok)).toBeNull()
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'http://a b']) expect(validateFieldValue(url, bad)).toMatch(/valid link/)
    expect(isSafeHref(' JavaScript:alert(1)')).toBe(false)
  })
  it('select : valeur fermée', () => {
    const f: FieldDef = { name: 'tone', label: 'Tone', kind: 'select', options: [{ value: 'dark', label: 'Dark' }] }
    expect(validateFieldValue(f, 'dark')).toBeNull()
    expect(validateFieldValue(f, 'light')).toBe('Tone must be one of the proposed options.')
  })
  it('slug, nombre, booléen, date, référence, image', () => {
    expect(validateFieldValue({ name: 's', label: 'Slug', kind: 'slug' }, { current: 'carrier-portals' })).toBeNull()
    expect(validateFieldValue({ name: 's', label: 'Slug', kind: 'slug' }, { current: 'Bad Slug' })).toMatch(/lowercase/)
    expect(validateFieldValue({ name: 'n', label: 'N', kind: 'number' }, Number.NaN)).toBe('N must be a number.')
    expect(validateFieldValue({ name: 'b', label: 'B', kind: 'boolean' }, 'true')).toBe('B must be on or off.')
    expect(validateFieldValue({ name: 'd', label: 'D', kind: 'date' }, '2026-09-27')).toBeNull()
    expect(validateFieldValue({ name: 'r', label: 'Author', kind: 'reference' }, { _ref: 'drafts.x' })).toMatch(/existing item/)
    expect(validateFieldValue({ name: 'r', label: 'Author', kind: 'reference' }, { _ref: 'abc' })).toBeNull()
    expect(validateFieldValue({ name: 'i', label: 'Image', kind: 'image' }, { asset: { _ref: 'image-abc-10x10-png' } })).toBeNull()
    expect(validateFieldValue({ name: 'i', label: 'Image', kind: 'image' }, { asset: { _ref: 'file-abc' } })).toMatch(/media library/)
  })
  it('array : bornes, _key uniques, sous-champs', () => {
    const f: FieldDef = {
      name: 'items',
      label: 'Modules',
      kind: 'array',
      itemLabel: 'Module',
      min: 1,
      max: 2,
      fields: [{ name: 'title', label: 'Title', kind: 'string', required: true, maxLength: 5 }],
    }
    expect(validateFieldValue(f, [{ _key: 'a', title: 'Hi' }])).toBeNull()
    expect(validateFieldValue(f, [])).toBeNull() // vide = non obligatoire (required absent)
    expect(validateFieldValue({ ...f, required: true }, [])).toBe('Modules is required.')
    expect(validateFieldValue(f, [{ _key: 'a', title: 'a' }, { _key: 'b', title: 'b' }, { _key: 'c', title: 'c' }])).toBe('Modules can have at most 2 modules.')
    expect(validateFieldValue(f, [{ _key: 'a', title: 'x' }, { _key: 'a', title: 'y' }])).toMatch(/invalid module/)
    expect(validateFieldValue(f, [{ _key: 'a', title: 'too long' }])).toBe('Modules 1 · Title must be 5 characters or fewer.')
  })
  it('cta / object : sous-champs', () => {
    const cta: FieldDef = {
      name: 'primaryCta',
      label: 'Button',
      kind: 'cta',
      fields: [
        { name: 'label', label: 'Label', kind: 'string', required: true },
        { name: 'href', label: 'Link', kind: 'url', required: true },
      ],
    }
    expect(validateFieldValue(cta, { label: 'Book a demo', href: '/demo' })).toBeNull()
    expect(validateFieldValue(cta, { label: 'Book a demo', href: 'javascript:x' })).toMatch(/^Button · Link must be a valid link/)
  })
})
