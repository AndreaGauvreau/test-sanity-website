import { describe, expect, it } from 'vitest'

import { adminConfig } from '@/admin.config'

import {
  articleOf,
  editorHref,
  findPage,
  resolveFieldAtPath,
  sectionSource,
  sectionSummary,
  seoPathOf,
  unknownVariables,
} from './manifest'

const home = findPage('home')!
const blog = findPage('blog')!

describe('findPage', () => {
  it('trouve les pages du manifeste, refuse le reste', () => {
    expect(home.label).toBe('Home')
    expect(findPage('nope')).toBeUndefined()
    expect(findPage('../home')).toBeUndefined()
    expect(findPage('HOME')).toBeUndefined()
  })

  it('liens de G1 et du C6', () => {
    expect(editorHref('home')).toBe('/admin/editor?page=home')
    // FOLLOWUPS #30 : « ‹ Admin » de l'éditeur revient à l'écran d'origine (même onglet).
    expect(editorHref('home', '/admin/pages/home/seo')).toBe('/admin/editor?page=home&back=%2Fadmin%2Fpages%2Fhome%2Fseo')
    expect(editorHref('home', '/admin/pages/home')).toBe('/admin/editor?page=home&back=%2Fadmin%2Fpages%2Fhome')
    const article = articleOf(blog)!
    expect(article.collection?.id).toBe('blog')
    expect(article.documentId).toBe('articleSeo-post')
    expect(article.variables.map((v) => v.token)).toContain('excerpt')
    expect(articleOf(home)).toBeNull()
  })
})

describe('resolveFieldAtPath (liste blanche des écritures de C1)', () => {
  it('champs simples, sous-champs de bouton, éléments de tableau, tableau entier', () => {
    expect(resolveFieldAtPath(home, 'hero.title')?.maxLength).toBe(70)
    expect(resolveFieldAtPath(home, 'hero.primaryCta.href')?.kind).toBe('url')
    expect(resolveFieldAtPath(home, 'features.items[_key=="a1"].title')?.maxLength).toBe(50)
    expect(resolveFieldAtPath(home, 'system.modules[_key=="m"].link.label')?.maxLength).toBe(30)
    expect(resolveFieldAtPath(home, 'hero.ratings')?.kind).toBe('array')
    expect(resolveFieldAtPath(home, 'testimonial.item')?.kind).toBe('reference')
  })

  it('refuse les chemins non déclarés ou mal formés', () => {
    for (const path of [
      'hero',
      'seo.metaTitle',
      'hero.nope',
      'hero.title.x',
      'hero.ratings[_key=="g2"]',
      'hero.title[_key=="x"].y',
      'hero.ratings[0].label',
      'hero._type',
      'nope.title',
      'hero[_key=="x"].title',
      'hero.primaryCta',
      '',
    ]) {
      const field = resolveFieldAtPath(home, path)
      // `hero.primaryCta` est un bouton entier : accepté (sous-champs validés), comme un objet.
      if (path === 'hero.primaryCta') expect(field?.kind).toBe('cta')
      else expect(field, path).toBeNull()
    }
  })

  it('SEO : chemins déclarés par la page', () => {
    expect(seoPathOf(home, 'metaTitle')).toBe('seo.metaTitle')
    expect(seoPathOf({ ...home, seo: undefined }, 'metaTitle')).toBeNull()
  })
})

describe('sections (C1)', () => {
  const section = (name: string) => home.sections.find((s) => s.name === name)!

  it('résumé des sections fermées', () => {
    expect(sectionSummary(section('features'), { items: [{}, {}, {}] })).toBe('3 cards')
    expect(sectionSummary(section('system'), { modules: [{}, {}, {}] })).toBe('Eyebrow · 3 modules · 1 button')
    expect(sectionSummary(section('performance'), { benefits: [{}] })).toBe('Eyebrow · 1 benefit')
    expect(sectionSummary(section('getStarted'), null)).toBe('Eyebrow · 2 buttons')
    expect(sectionSummary(section('tour'), {})).toBe('Title · 1 button')
  })

  it('sections alimentées par une collection', () => {
    expect(sectionSource({ ...section('testimonial'), source: undefined })).toEqual({
      label: 'From CMS › Testimonials',
      href: '/admin/cms/testimonials',
      linkLabel: 'Open Testimonials',
    })
    expect(sectionSource({ ...section('faq'), source: undefined })).toEqual({ label: 'From CMS › FAQ', href: '/admin/cms/faq', linkLabel: 'Open FAQ' })
    expect(sectionSource({ ...section('hero'), source: undefined })).toBeNull()
  })

  it('SectionDef.source déclaré par le manifeste : prioritaire, par id ou type de collection (FOLLOWUPS #30)', () => {
    const hero = { ...section('hero'), source: undefined }
    // Libellé propre (« 4 latest Blog posts ») ; la collection peut être nommée par son id…
    expect(sectionSource({ ...hero, source: { collection: 'blog', label: '4 latest Blog posts' } })).toEqual({
      label: '4 latest Blog posts',
      href: '/admin/cms/blog',
      linkLabel: 'Open Blog',
    })
    // … ou par son type Sanity ; sans libellé : « From CMS › <collection> ».
    expect(sectionSource({ ...hero, source: { collection: 'post' } })).toEqual({
      label: 'From CMS › Blog',
      href: '/admin/cms/blog',
      linkLabel: 'Open Blog',
    })
    // Déclaré mais inconnu : rien de deviné (pas de lien cassé).
    expect(sectionSource({ ...section('testimonial'), source: { collection: 'nope' } })).toBeNull()
  })
})

describe('variables du modèle SEO (C6)', () => {
  const variables = adminConfig.articleSeoTemplates[0].variables
  it('signale les variables inconnues', () => {
    expect(unknownVariables('{{title}} | Conduit Blog', variables)).toEqual([])
    expect(unknownVariables('{{ title }} {{nope}} {{nope}} {{cover}}', variables)).toEqual(['nope'])
  })
})
