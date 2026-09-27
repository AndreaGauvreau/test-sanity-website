import { describe, expect, it } from 'vitest'

import { findPage } from './manifest'
import {
  IMAGE_ASSET_ID,
  isFixedLength,
  itemPath,
  mergeArrayItems,
  moveTarget,
  newArrayItem,
  newKey,
  previousSavedKey,
  setAtPath,
  toImage,
  toReference,
} from './form'

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

  it('nouvel élément : FieldDef.itemType prioritaire, même tableau vide (FOLLOWUPS #30)', () => {
    expect(newArrayItem([], undefined, 'rating')).toEqual({ _key: expect.any(String), _type: 'rating' })
    expect(newArrayItem([{ _key: 'g2', _type: 'old' }], undefined, 'rating')._type).toBe('rating')
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

describe('tableaux par clé (FOLLOWUPS #40)', () => {
  const k = (...keys: string[]) => keys.map((key) => ({ _key: key, label: key }))

  it('previousSavedKey : élément enregistré le plus proche avant, en sautant les éléments locaux', () => {
    const items = k('a', 'new1', 'new2')
    expect(previousSavedKey(items, 'new2', new Set(['new1', 'new2']))).toBe('a')
    expect(previousSavedKey(k('new1', 'a'), 'new1', new Set(['new1']))).toBeNull()
  })

  it('moveTarget : avant l’élément enregistré suivant, sinon après le précédent, sinon rien', () => {
    expect(moveTarget(k('b', 'a', 'c'), 'b', new Set())).toEqual({ before: 'a' })
    expect(moveTarget(k('a', 'c', 'b'), 'b', new Set())).toEqual({ after: 'c' })
    expect(moveTarget(k('a', 'b', 'new1'), 'b', new Set(['new1']))).toEqual({ after: 'a' })
    expect(moveTarget(k('b', 'new1'), 'b', new Set(['new1']))).toBeNull()
  })

  it('mergeArrayItems : ordre du serveur, ajout fait ailleurs gardé, saisie locale gardée, élément local non enregistré à sa place', () => {
    const local = [{ _key: 'a', label: 'typed locally' }, { _key: 'gone', label: 'x' }, { _key: 'new1', label: '' }]
    const server = [{ _key: 'other', label: 'from another tab' }, { _key: 'a', label: 'old' }]
    expect(mergeArrayItems(local, server, new Set(['new1']))).toEqual([
      { _key: 'other', label: 'from another tab' },
      { _key: 'a', label: 'typed locally' },
      { _key: 'new1', label: '' },
    ])
  })
})
