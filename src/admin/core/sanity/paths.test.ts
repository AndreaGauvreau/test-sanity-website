import { describe, expect, it } from 'vitest'

import { draftIdOf, isDocumentType, isFieldPath, isPublishedId, keyedTargetsExist, parseFieldPath, publishedIdOf } from './paths'

describe('ids', () => {
  it('id publié : ni drafts., ni versions., ni caractère spécial', () => {
    expect(isPublishedId('dockSchedulingPage')).toBe(true)
    expect(isPublishedId('0b7c4e2a-1f3d-4c1e-9a55-2d7f3a1b9c10')).toBe(true)
    expect(isPublishedId('drafts.abc')).toBe(false)
    expect(isPublishedId('versions.r1.abc')).toBe(false)
    expect(isPublishedId('abc"]')).toBe(false)
    expect(isPublishedId('')).toBe(false)
    expect(isPublishedId('.abc')).toBe(false)
  })
  it('draftIdOf / publishedIdOf', () => {
    expect(draftIdOf('abc')).toBe('drafts.abc')
    expect(publishedIdOf('drafts.abc')).toBe('abc')
    expect(publishedIdOf('abc')).toBe('abc')
  })
  it('type : pas de type système', () => {
    expect(isDocumentType('post')).toBe(true)
    expect(isDocumentType('sanity.imageAsset')).toBe(false)
    expect(isDocumentType('system.group')).toBe(false)
    expect(isDocumentType('a b')).toBe(false)
  })
})

describe('chemins de champ', () => {
  it('accepte noms, points et sélecteurs _key', () => {
    for (const ok of ['title', 'seo.metaTitle', 'features.items[_key=="a1"].title', 'rows[_key=="r1"].cells[_key=="c-2"].text']) {
      expect(isFieldPath(ok)).toBe(true)
    }
  })
  it('refuse index numériques, champs système, GROQ arbitraire', () => {
    for (const bad of ['items[0].title', '_id', 'seo._type', 'items[_key=="a" || true]', 'a..b', 'a.', '', 'x[_key==\'a\']', 'a;b']) {
      expect(isFieldPath(bad)).toBe(false)
    }
  })
  it('parseFieldPath', () => {
    expect(parseFieldPath('features.items[_key=="a1"].title')).toEqual([
      { name: 'features', keys: [] },
      { name: 'items', keys: ['a1'] },
      { name: 'title', keys: [] },
    ])
  })
  it('keyedTargetsExist : un sélecteur doit désigner un élément présent', () => {
    const doc = { features: { items: [{ _key: 'a1', title: 'x' }] }, seo: undefined }
    expect(keyedTargetsExist(doc, 'features.items[_key=="a1"].title')).toBe(true)
    expect(keyedTargetsExist(doc, 'features.items[_key=="zz"].title')).toBe(false)
    expect(keyedTargetsExist(doc, 'seo.metaTitle')).toBe(true) // objet absent : set le crée
    expect(keyedTargetsExist(doc, 'missing.items[_key=="a1"]')).toBe(false)
    expect(keyedTargetsExist(doc, 'title')).toBe(true)
  })
})
