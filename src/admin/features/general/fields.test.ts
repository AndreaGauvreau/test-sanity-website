import { describe, expect, it } from 'vitest'

import { baseType, recordRules, typeIndex } from '@/sanity/lib/schema-inspect'
import { schemaTypes } from '@/sanity/schemaTypes'
import adminConfig from '@/admin.config'

import { GENERAL_FIELDS } from './fields'
import { toGeneralView, publicUrl, truncateWords } from './view'

// Les FieldDef de B2 doivent décrire le schéma `siteSettings` tel qu'il est (nom, type, obligation, longueur).
const index = typeIndex(schemaTypes)
const settings = index.get('siteSettings')!

const KIND_TYPES: Record<string, string> = { string: 'string', text: 'text', image: 'image', boolean: 'boolean' }

describe('champs de B2 ↔ schéma siteSettings', () => {
  it('le manifeste pointe vers le document siteSettings', () => {
    expect(adminConfig.settings).toEqual({ type: 'siteSettings', id: 'siteSettings' })
  })

  for (const [name, def] of Object.entries(GENERAL_FIELDS)) {
    it(`${name} : même type, même obligation, même limite`, () => {
      const field = settings.fields?.find((f) => f.name === name)
      expect(field, `champ ${name} absent du schéma`).toBeTruthy()
      expect(baseType(field!, index)).toBe(KIND_TYPES[def.kind])
      const rules = recordRules(field!.validation)
      expect(!!def.required).toBe(rules.required)
      expect(def.maxLength).toBe(rules.max)
    })
  }
})

describe('vue de B2', () => {
  const site = { name: 'Conduit', domain: 'conduit.com', url: 'http://127.0.0.1:4040' }
  it('brouillon prioritaire, indexation par défaut, images converties', () => {
    const view = toGeneralView(
      { published: { title: 'Old' }, draft: { title: 'New', allowIndexing: false }, value: { title: 'New', allowIndexing: false, socialImage: { asset: { _ref: 'x' } } } },
      site,
      (v) => (v ? { ref: 'x', url: 'https://cdn/x', width: 1, height: 1 } : null),
    )
    expect(view.values).toMatchObject({ title: 'New', description: '', allowIndexing: false, faviconLight: null, socialImage: { url: 'https://cdn/x' } })
    expect(view.hasDraft).toBe(true)
    expect(view.missing).toBe(false)
    const empty = toGeneralView({ published: null, draft: null, value: null }, site, () => null)
    expect(empty.missing).toBe(true)
    expect(empty.values.allowIndexing).toBe(true)
  })
  it('URL publique : https seulement, sinon le domaine', () => {
    expect(publicUrl(site)).toBe('https://conduit.com')
    expect(publicUrl({ ...site, url: 'https://www.conduit.com/' })).toBe('https://www.conduit.com')
  })
  it('coupe la description au mot (carte sociale)', () => {
    const d = 'Schedule dock appointments, cut wait times and keep carriers in the loop — in one place.'
    expect(truncateWords(d, 45)).toBe('Schedule dock appointments, cut wait times…')
    expect(truncateWords('Short', 45)).toBe('Short')
  })
})
