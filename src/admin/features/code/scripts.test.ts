import { describe, expect, it } from 'vitest'

import adminConfig from '@/admin.config'

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
  toSanityScript,
} from './scripts'

const OPTIONS = pageOptions(adminConfig, { blog: 12 })
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
    ])
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
    expect(pageLabel(OPTIONS, 'faq')).toBe('faq')
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
    const check = checkScript({ ...base, placement: 'footer' as never, run: 'always' as never, page: 'testimonials' }, OPTIONS)
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

  it('aller-retour vers Sanity', () => {
    const [item] = normalizeScripts([{ _key: 'a', name: 'n', placement: 'bodyStart', page: 'home', run: 'everyPageVisit', code: 'c', enabled: false }])
    expect(toSanityScript(item)).toEqual({ _key: 'a', _type: 'siteScript', name: 'n', placement: 'bodyStart', page: 'home', run: 'everyPageVisit', code: 'c', enabled: false })
  })
})

describe('newScriptKey', () => {
  it('12 caractères a-z0-9', () => {
    expect(newScriptKey()).toMatch(/^[a-z0-9]{12}$/)
    expect(newScriptKey(() => 0)).toBe('000000000000')
  })
})
