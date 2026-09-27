import { describe, expect, it } from 'vitest'

import { findPage } from './manifest'
import { IMAGE_ASSET_ID, isFixedLength, itemPath, newArrayItem, newKey, setAtPath, toImage, toReference } from './form'

describe('aides du formulaire', () => {
  it('chemins et longueur fixe', () => {
    expect(itemPath('hero.ratings', 'g2')).toBe('hero.ratings[_key=="g2"]')
    const home = findPage('home')!
    const features = home.sections.find((s) => s.name === 'features')!.fields.find((f) => f.name === 'items')!
    const ratings = home.sections.find((s) => s.name === 'hero')!.fields.find((f) => f.name === 'ratings')!
    expect(isFixedLength(features)).toBe(true)
    expect(isFixedLength(ratings)).toBe(false)
  })

  it('nouvel élément : clé neuve, type repris du voisin', () => {
    expect(newKey()).toMatch(/^[a-z0-9]{12}$/)
    const item = newArrayItem([{ _key: 'g2', _type: 'rating' }])
    expect(item._type).toBe('rating')
    expect(item._key).not.toBe('g2')
    expect(newArrayItem([])).toEqual({ _key: expect.any(String) })
  })

  it('setAtPath : champ, sous-objet créé, élément par clé, suppression', () => {
    const doc = { hero: { title: 'A', ratings: [{ _key: 'g2', label: 'x' }, { _key: 'c', label: 'y' }] } }
    expect(setAtPath(doc, 'hero.title', 'B').hero).toMatchObject({ title: 'B' })
    expect(setAtPath(doc, 'hero.primaryCta.href', '/demo')).toMatchObject({ hero: { primaryCta: { href: '/demo' } } })
    const next = setAtPath(doc, 'hero.ratings[_key=="c"].label', 'z')
    expect((next.hero as { ratings: unknown[] }).ratings).toEqual([{ _key: 'g2', label: 'x' }, { _key: 'c', label: 'z' }])
    expect(setAtPath(doc, 'hero.title', null).hero).not.toHaveProperty('title')
    expect(doc.hero.title).toBe('A') // pas de mutation
  })

  it('références et images', () => {
    expect(toReference('t1')).toEqual({ _type: 'reference', _ref: 't1' })
    expect(toReference(null)).toBeNull()
    expect(toImage('image-abc123def456-1200x630-png')).toEqual({ _type: 'image', asset: { _type: 'reference', _ref: 'image-abc123def456-1200x630-png' } })
    expect(IMAGE_ASSET_ID.test('image-abc123def456-1200x630-png')).toBe(true)
    expect(IMAGE_ASSET_ID.test('file-abc123def456-pdf')).toBe(false)
  })
})
