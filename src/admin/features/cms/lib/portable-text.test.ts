import { describe, expect, it } from 'vitest'

import type { AdminConfig, FieldDef } from '@/admin/core/contracts/manifest'
import adminConfig from '@/admin.config'

import { DEFAULT_RICH_TEXT, isEmptyRichText, richTextConfigFor, RichTextError, sanitizePortableText, toPlainText } from './portable-text'

const collections: AdminConfig['collections'] = adminConfig.collections
const fieldOf = (collection: string, name: string): FieldDef => collections.find((c) => c.id === collection)!.fields.find((f) => f.name === name)!
const faqAnswer = fieldOf('faq', 'answer')
const postBody = fieldOf('blog', 'content')

let n = 0
const gen = () => `k${(n += 1)}`

const block = (text: string, extra: Record<string, unknown> = {}) => ({
  _type: 'block',
  _key: `b-${text.slice(0, 4).replace(/\W/g, '')}`,
  style: 'normal',
  markDefs: [],
  children: [{ _type: 'span', _key: 's1', text, marks: [] }],
  ...extra,
})

describe('sanitizePortableText (conversion vers le schéma post.content)', () => {
  it('garde un texte valide tel quel (titres, listes, gras, lien)', () => {
    const value = [
      block('Why portals fail', { style: 'h2' }),
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        markDefs: [{ _type: 'link', _key: 'l1', href: 'https://conduit.com' }],
        children: [
          { _type: 'span', _key: 'a', text: 'Read ', marks: [] },
          { _type: 'span', _key: 'b', text: 'this', marks: ['strong', 'l1'] },
        ],
      },
      block('Item', { listItem: 'bullet', level: 1 }),
    ]
    expect(sanitizePortableText(value, DEFAULT_RICH_TEXT, gen)).toEqual(value)
  })

  it('style ou liste hors schéma → paragraphe simple', () => {
    const out = sanitizePortableText([block('x', { style: 'h1', listItem: 'check', level: 9 })], DEFAULT_RICH_TEXT, gen)
    expect(out[0]).toMatchObject({ style: 'normal' })
    expect(out[0]).not.toHaveProperty('listItem')
  })

  it('FAQ : pas de titres ni de listes, pas d’images', () => {
    const faq = richTextConfigFor(faqAnswer)
    const out = sanitizePortableText([block('Q', { style: 'h2', listItem: 'bullet' })], faq, gen)
    expect(out[0]).toMatchObject({ style: 'normal' })
    expect(out[0]).not.toHaveProperty('listItem')
    expect(() => sanitizePortableText([{ _type: 'image', _key: 'i', asset: { _ref: 'image-a-1x1-png' } }], faq, gen)).toThrow(RichTextError)
  })

  it('#31 : options lues dans FieldDef.richText', () => {
    const declared = richTextConfigFor({
      richText: { styles: ['h3'], lists: ['bullet'], decorators: ['strong'], annotations: ['link', 'internalLink'], blocks: [] },
    })
    expect(declared).toEqual({ styles: ['normal', 'h3'], lists: ['bullet'], decorators: ['strong'], annotations: ['link'], blockObjects: [] })
    // Clés absentes = rien de ce genre ; « normal » toujours permis.
    expect(richTextConfigFor({ richText: {} })).toEqual({ styles: ['normal'], lists: [], decorators: [], annotations: [], blockObjects: [] })
    const out = sanitizePortableText([block('x', { style: 'h2', listItem: 'bullet' })], declared, gen)
    expect(out[0]).toMatchObject({ style: 'normal', listItem: 'bullet' })
    // Sans richText : défaut (options du corps d'article).
    expect(richTextConfigFor({})).toEqual(DEFAULT_RICH_TEXT)
    // Le corps d'article du manifeste déclare exactement le défaut.
    expect(richTextConfigFor(postBody)).toEqual(DEFAULT_RICH_TEXT)
  })

  it('image du corps d’article gardée telle quelle', () => {
    const img = { _type: 'image', _key: 'img1', asset: { _ref: 'image-a-1x1-png' }, caption: 'c' }
    expect(sanitizePortableText([img], DEFAULT_RICH_TEXT, gen)).toEqual([img])
  })

  it('lien dangereux refusé', () => {
    const value = [{ ...block('x'), markDefs: [{ _type: 'link', _key: 'l', href: 'javascript:alert(1)' }], children: [{ _type: 'span', _key: 's', text: 'x', marks: ['l'] }] }]
    expect(() => sanitizePortableText(value, DEFAULT_RICH_TEXT, gen)).toThrow(/link/)
  })

  it('marques inconnues et définitions inutilisées retirées', () => {
    const value = [
      {
        ...block('x'),
        markDefs: [
          { _type: 'link', _key: 'used', href: '/blog' },
          { _type: 'link', _key: 'unused', href: '/x' },
          { _type: 'comment', _key: 'c', text: 'hidden' },
        ],
        children: [{ _type: 'span', _key: 's', text: 'x', marks: ['underline', 'used', 'c', 'em'] }],
      },
    ]
    const [out] = sanitizePortableText(value, DEFAULT_RICH_TEXT, gen) as unknown as [{ markDefs: unknown[]; children: { marks: string[] }[] }]
    expect(out.children[0].marks).toEqual(['used', 'em'])
    expect(out.markDefs).toEqual([{ _type: 'link', _key: 'used', href: '/blog' }])
  })

  it('clés manquantes ou en double régénérées, bloc vide complété', () => {
    const out = sanitizePortableText(
      [
        { _type: 'block', _key: 'dup', children: [] },
        { _type: 'block', _key: 'dup', children: [{ _type: 'span', text: 'a' }] },
      ],
      DEFAULT_RICH_TEXT,
      gen,
    )
    const keys = out.map((b) => b._key)
    expect(new Set(keys).size).toBe(2)
    expect((out[0] as { children: unknown[] }).children).toHaveLength(1)
    expect((out[1] as { children: { _key: string; marks: string[] }[] }).children[0]).toMatchObject({ marks: [] })
  })

  it('caractères de contrôle retirés ; valeur non tableau refusée', () => {
    const [out] = sanitizePortableText([block('a\u0007b')], DEFAULT_RICH_TEXT, gen) as unknown as [{ children: { text: string }[] }]
    expect(out.children[0].text).toBe('ab')
    expect(() => sanitizePortableText('text', DEFAULT_RICH_TEXT, gen)).toThrow(RichTextError)
    expect(() => sanitizePortableText([{ _type: 'block', children: [{ _type: 'mention' }] }], DEFAULT_RICH_TEXT, gen)).toThrow(RichTextError)
  })

  it('texte brut et vide', () => {
    expect(toPlainText([block('Hello'), { _type: 'image', _key: 'i' }, block('World')])).toBe('Hello\nWorld')
    expect(isEmptyRichText([block('   ')])).toBe(true)
    expect(isEmptyRichText([block('x')])).toBe(false)
    expect(isEmptyRichText([{ _type: 'image', _key: 'i' }])).toBe(false)
  })
})
