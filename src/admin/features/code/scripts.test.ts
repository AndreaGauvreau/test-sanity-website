import { describe, expect, it } from 'vitest'

import adminConfig from '@/admin.config'
import { SCRIPT_PAGES } from '@/sanity/schemaTypes/siteSettings'

import {
  checkScript,
  DEFAULT_SCRIPT,
  detectedFields,
  isScriptValid,
  newScriptKey,
  normalizeScripts,
  pageLabel,
  pageOptions,
  placementLabel,
  runLabel,
  scriptType,
  signableFromRaw,
  toSanityScript,
} from './scripts'

const OPTIONS = pageOptions(adminConfig, { blog: 12, testimonials: 3, faq: 9 })
const JSON_LD = `<script type="application/ld+json">
{ "headline": "{{title}}", "description": "{{excerpt}}", "image": "{{ cover }}", "x": "{{title}}" }
</script>`

describe('pageOptions (menu Page de G6, depuis le manifeste)', () => {
  it('All pages, chaque page, puis la page article sous sa page listing', () => {
    expect(OPTIONS.map((o) => [o.value, o.label, o.path, o.depth ?? 0])).toEqual([
      ['all', 'All pages', 'All pages', 0],
      ['home', 'Home', '/', 0],
      ['blog', '/blog', '/blog', 0],
      ['blog/slug', 'slug:', '/blog/:slug', 1],
      ['testimonials', '/testimonials', '/testimonials', 0],
      ['testimonials/slug', 'slug:', '/testimonials/:slug', 1],
      ['faq', '/faq', '/faq', 0],
      ['faq/slug', 'slug:', '/faq/:slug', 1],
    ])
  })

  it('mêmes valeurs que SCRIPT_PAGES du schéma (le Studio et le site lisent la même liste)', () => {
    expect(OPTIONS.map((o) => o.value).sort()).toEqual(SCRIPT_PAGES.map((p) => p.value).sort())
  })

  it('pages article des témoignages et de la FAQ : compte et champs de leur collection', () => {
    const testimonial = OPTIONS.find((o) => o.value === 'testimonials/slug')!
    expect(testimonial.count).toBe(3)
    expect(testimonial.article?.collectionLabel).toBe('Testimonials')
    expect(testimonial.article?.fields.map((f) => f.token)).toEqual(['name', 'slug', 'company', 'role', 'quote'])
    const faq = OPTIONS.find((o) => o.value === 'faq/slug')!
    expect(faq.count).toBe(9)
    expect(faq.article?.collectionLabel).toBe('FAQ')
    expect(faq.article?.fields.map((f) => f.token)).toEqual(['question', 'slug', 'answer'])
  })

  it('page article : nombre d’articles et champs du modèle (Blog fields)', () => {
    const article = OPTIONS.find((o) => o.value === 'blog/slug')!
    expect(article.count).toBe(12)
    expect(article.icon).toBe('database')
    expect(article.article?.collectionLabel).toBe('Blog')
    expect(article.article?.fields.map((f) => f.token)).toEqual(['title', 'slug', 'date', 'excerpt', 'cover', 'author', 'category'])
  })

  it('libellés du tableau', () => {
    expect(pageLabel(OPTIONS, 'all')).toBe('All pages')
    expect(pageLabel(OPTIONS, 'blog/slug')).toBe('/blog/:slug')
    expect(pageLabel(OPTIONS, 'faq/slug')).toBe('/faq/:slug')
    // Page disparue du manifeste : valeur brute.
    expect(pageLabel(OPTIONS, 'pricing')).toBe('pricing')
    expect(placementLabel('headEnd')).toBe('End of <head>')
    expect(placementLabel('bodyStart')).toBe('Start of <body>')
    expect(runLabel('everyPageVisit')).toBe('On every page visit')
  })
})

describe('scriptType (colonne Type)', () => {
  it('déduit du code', () => {
    expect(scriptType('<style>img{}</style>')).toBe('CSS')
    expect(scriptType('<script>gtag()</script>')).toBe('JavaScript')
    expect(scriptType(JSON_LD)).toBe('JavaScript')
    expect(scriptType('<style></style><script src="x.js"></script>')).toBe('CSS + JavaScript')
    expect(scriptType('console.log(1)')).toBe('—')
  })
})

describe('variables détectées', () => {
  it('sans doublon, dans l’ordre, espaces tolérés', () => {
    expect(detectedFields(JSON_LD)).toEqual(['title', 'excerpt', 'cover'])
    expect(detectedFields('<style>a{}</style>')).toEqual([])
    expect(detectedFields('{{ 1bad }} {{ok_2}}')).toEqual(['ok_2'])
  })
})

describe('checkScript (validation d’un script)', () => {
  const base = { ...DEFAULT_SCRIPT, name: 'GTM', code: '<script>1</script>' }

  it('script valide', () => {
    const check = checkScript(base, OPTIONS)
    expect(isScriptValid(check)).toBe(true)
    expect(check.warnings).toEqual([])
  })

  it('nom obligatoire, 60 caractères, une ligne', () => {
    expect(checkScript({ ...base, name: '  ' }, OPTIONS).errors.name).toBe('Name is required.')
    expect(checkScript({ ...base, name: 'x'.repeat(61) }, OPTIONS).errors.name).toMatch('60 characters')
    expect(checkScript({ ...base, name: 'a\nb' }, OPTIONS).errors.name).toMatch('single line')
  })

  it('valeurs fermées : emplacement, exécution, page du manifeste', () => {
    const check = checkScript({ ...base, placement: 'footer' as never, run: 'always' as never, page: 'pricing' }, OPTIONS)
    expect(Object.keys(check.errors).sort()).toEqual(['page', 'placement', 'run'])
  })

  it('code obligatoire, dans des balises', () => {
    expect(checkScript({ ...base, code: ' ' }, OPTIONS).errors.code).toBe('Code is required.')
    expect(checkScript({ ...base, code: 'gtag()' }, OPTIONS).errors.code).toMatch('<script> or <style>')
  })

  it('balise non fermée : avertissement, pas une erreur (pas de validation du JavaScript)', () => {
    const check = checkScript({ ...base, code: '<script>if (a {' }, OPTIONS)
    expect(isScriptValid(check)).toBe(true)
    expect(check.warnings[0]).toMatch('isn’t closed')
  })

  it('texte hors balises : avertissement', () => {
    expect(checkScript({ ...base, code: 'hello <style>a{}</style>' }, OPTIONS).warnings[0]).toMatch('ignored')
  })

  it('page article : champs inconnus signalés', () => {
    const check = checkScript({ ...base, page: 'blog/slug', code: '<script>"{{title}} {{price}}"</script>' }, OPTIONS)
    expect(check.fields).toEqual(['title', 'price'])
    expect(check.warnings).toEqual(['{{price}} isn’t a field of Blog: left as written.'])
    expect(checkScript({ ...base, page: 'blog/slug', code: JSON_LD }, OPTIONS).warnings).toEqual([])
  })

  it('champs {{…}} hors page article : avertissement', () => {
    expect(checkScript({ ...base, page: 'all', code: JSON_LD }, OPTIONS).warnings[0]).toMatch('only replaced on an article page')
  })
})

describe('normalizeScripts', () => {
  it('lecture défensive du tableau Sanity', () => {
    const items = normalizeScripts([
      { _key: 'a', _type: 'siteScript', name: 'CSS_base', placement: 'headEnd', page: 'all', run: 'once', code: '<style></style>', enabled: true },
      { _key: 'b', name: 'Hotjar', placement: 'weird', run: 'x', enabled: false },
      { _key: 'c', name: 'No flag' },
      { name: 'sans clé' },
      { _key: 'bad key!' },
      null,
    ])
    expect(items.map((i) => [i.key, i.placement, i.run, i.enabled])).toEqual([
      ['a', 'headEnd', 'once', true],
      ['b', 'bodyEnd', 'once', false],
      ['c', 'bodyEnd', 'once', true],
    ])
    expect(normalizeScripts(undefined)).toEqual([])
  })

  it('SEC-04 : un script lu est « non signé » tant que le serveur ne l’a pas vérifié (fermé par défaut)', () => {
    const [item] = normalizeScripts([{ _key: 'a', name: 'n', placement: 'bodyStart', page: 'home', run: 'once', code: 'c', enabled: true, signature: 'abc' }])
    expect(item.signed).toBe(false)
    expect(item).not.toHaveProperty('signature')
  })

  it('aller-retour vers Sanity, avec la signature (SEC-04)', () => {
    const [item] = normalizeScripts([{ _key: 'a', name: 'n', placement: 'bodyStart', page: 'home', run: 'everyPageVisit', code: 'c', enabled: false }])
    expect(toSanityScript(item, 'sig')).toEqual({ _key: 'a', _type: 'siteScript', name: 'n', placement: 'bodyStart', page: 'home', run: 'everyPageVisit', code: 'c', enabled: false, signature: 'sig' })
  })
})

describe('signableFromRaw (SEC-04)', () => {
  it('valeurs BRUTES du document, sans normalisation', () => {
    expect(signableFromRaw({ _key: 'a', name: 'n', placement: 'headEnd', page: 'all', run: 'once', code: '<style></style>', enabled: true, signature: 's' })).toEqual({
      _key: 'a',
      placement: 'headEnd',
      page: 'all',
      run: 'once',
      code: '<style></style>',
      enabled: true,
      signature: 's',
    })
  })

  it('champ absent ou mal typé : rien à vérifier (non signé)', () => {
    expect(signableFromRaw({ _key: 'a', placement: 'headEnd', page: 'all', run: 'once', code: 'c' })).toBeNull()
    expect(signableFromRaw({ _key: 'a', placement: 'headEnd', page: 'all', run: 'once', code: 1, enabled: true })).toBeNull()
    expect(signableFromRaw({ placement: 'headEnd', page: 'all', run: 'once', code: 'c', enabled: true })).toBeNull()
    expect(signableFromRaw(null)).toBeNull()
  })
})

describe('newScriptKey', () => {
  it('12 caractères a-z0-9', () => {
    expect(newScriptKey()).toMatch(/^[a-z0-9]{12}$/)
    expect(newScriptKey(() => 0)).toBe('000000000000')
  })
})
