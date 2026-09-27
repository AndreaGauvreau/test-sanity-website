import { describe, expect, it, vi } from 'vitest'

// src/sanity/env.ts exige le projet et le dataset à l'import (urlFor).
vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'test1234')
vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'development')
const { articlePath, articleSeoPreview, displayUrl, estimatedLength, pageSeoPreview } = await import('./seo-preview')
const { resolveTemplate } = await import('@/lib/template-variables')

const settings = {
  title: 'Conduit',
  description: 'Site description',
  allowIndexing: true,
  faviconLight: null,
  faviconDark: null,
  socialImage: { asset: { _ref: 'image-abc123def456-2400x1260-jpg' } },
  scripts: null,
} as never

describe('pageSeoPreview (C2, comme le site)', () => {
  it('accueil : suffixe ajouté au <title>, og:title sans suffixe, image du site par défaut', () => {
    const p = pageSeoPreview({ settings, seo: { metaTitle: 'Dock Scheduling Software', metaDescription: 'Cut dock wait times.' }, path: '/' })
    expect(p.title).toBe('Dock Scheduling Software — Conduit')
    expect(p.ogTitle).toBe('Dock Scheduling Software')
    expect(p.description).toBe('Cut dock wait times.')
    expect(p.ogDescription).toBe('Cut dock wait times.')
    expect(p.ogImage).toContain('image-abc123def456'.replace('image-', ''))
    expect(p.indexed).toBe(true)
  })

  it('champs vides : valeurs du site (B2)', () => {
    const p = pageSeoPreview({ settings, seo: {}, path: '/' })
    expect(p.title).toBe('Conduit')
    expect(p.description).toBe('Site description')
    expect(p.ogTitle).toBe('Conduit')
  })

  it('page enfant : modèle du layout ; titre par défaut de la page', () => {
    expect(pageSeoPreview({ settings, seo: { metaTitle: 'Articles' }, path: '/blog', defaultTitle: 'Blog' }).title).toBe('Articles — Conduit')
    const fallback = pageSeoPreview({ settings, seo: {}, path: '/blog', defaultTitle: 'Blog' })
    expect(fallback.title).toBe('Blog — Conduit')
    expect(fallback.ogTitle).toBe('Blog — Conduit')
  })

  it('indexation : la page ou le site la coupe', () => {
    expect(pageSeoPreview({ settings, seo: { allowIndexing: false }, path: '/' }).indexed).toBe(false)
    expect(pageSeoPreview({ settings: { ...(settings as object), allowIndexing: false } as never, seo: {}, path: '/' }).indexed).toBe(false)
  })
})

describe('articleSeoPreview (C6, variables résolues)', () => {
  const values = { title: 'Carrier portals: a checklist', excerpt: 'Before you roll out a carrier portal…', slug: 'carrier-portals', cover: 'https://cdn/cover.jpg' }
  const template = { metaTitle: '{{title}} | Conduit Blog', metaDescription: '{{excerpt}}', ogImageField: 'cover' as const, ogImage: null, allowIndexing: true }

  it('titre, description et image de l’article', () => {
    const p = articleSeoPreview({ settings, template, values, cover: { url: values.cover } })
    expect(p.title).toBe('Carrier portals: a checklist | Conduit Blog — Conduit')
    expect(p.ogTitle).toBe('Carrier portals: a checklist | Conduit Blog')
    expect(p.description).toBe('Before you roll out a carrier portal…')
    expect(p.ogImage).toBe('https://cdn/cover.jpg')
  })

  it('variable vide : valeur du site ; image fixe quand aucun champ', () => {
    const p = articleSeoPreview({
      settings,
      template: { ...template, metaDescription: '{{author}}', ogImageField: null },
      values: { ...values, author: '' },
      cover: { url: values.cover },
    })
    expect(p.description).toBe('Site description')
    expect(p.ogImage).not.toBe('https://cdn/cover.jpg')
  })

  it('longueur estimée et résolution des variables', () => {
    expect(estimatedLength('{{title}} | Conduit Blog', values)).toBe('Carrier portals: a checklist | Conduit Blog'.length)
    expect(resolveTemplate('{{title}} {{nope}}', values, 'text')).toEqual({ value: 'Carrier portals: a checklist {{nope}}', empty: [], unknown: ['nope'] })
  })
})

describe('URL affichée', () => {
  it('fil d’Ariane façon Google', () => {
    expect(displayUrl('conduit.com', '/')).toBe('https://conduit.com')
    expect(displayUrl('conduit.com', articlePath('/blog/:slug', 'carrier-portals'))).toBe('https://conduit.com › blog › carrier-portals')
  })
})
