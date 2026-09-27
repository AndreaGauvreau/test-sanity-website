import { describe, expect, it, vi } from 'vitest'

// src/sanity/env.ts exige le projet et le dataset à l'import (urlFor).
vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'test1234')
vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'development')
const { articleMetadata, layoutMetadata, pageMetadata, robotsFor } = await import('./seo')

const settings = {
  title: 'Conduit',
  description: 'Site description',
  allowIndexing: true,
  faviconLight: 'https://cdn/light.png',
  faviconDark: null,
  socialImage: null,
  scripts: null,
}

describe('métadonnées', () => {
  it('sans réglages : sortie d’avant l’admin (modèle « — Conduit », rien d’autre)', () => {
    expect(layoutMetadata(null)).toEqual({
      title: { template: '%s — Conduit', default: 'Conduit' },
      openGraph: { siteName: 'Conduit', type: 'website', locale: 'en_US' },
      twitter: { card: 'summary_large_image' },
    })
    expect(pageMetadata({ settings: null, seo: null, defaultTitle: 'Blog' })).toEqual({ title: 'Blog' })
  })

  it('accueil : meta title + suffixe, og:title sans suffixe, description de la page', () => {
    const meta = pageMetadata({ settings, seo: { metaTitle: 'Dock', metaDescription: 'Page' }, segmentRoot: true })
    expect(meta.title).toBe('Dock — Conduit')
    expect(meta.description).toBe('Page')
    expect(meta.openGraph).toMatchObject({ title: 'Dock', description: 'Page' })
    expect(meta.robots).toBeUndefined()
  })

  it('description du site en repli ; favicon clair seul', () => {
    expect(pageMetadata({ settings, seo: {}, defaultTitle: 'Blog' }).description).toBe('Site description')
    expect(layoutMetadata(settings).icons).toEqual({ icon: [{ url: 'https://cdn/light.png' }] })
  })

  it('noindex : le site l’emporte sur la page', () => {
    expect(robotsFor({ ...settings, allowIndexing: false }, true)).toEqual({ index: false, follow: false })
    expect(robotsFor(settings, false)).toEqual({ index: false, follow: false })
    expect(robotsFor(settings, null)).toBeUndefined()
  })

  it('page article : variables remplacées ; variable vide → valeur du site', () => {
    const meta = articleMetadata({
      settings,
      template: { metaTitle: '{{title}} | Blog', metaDescription: '{{excerpt}}', ogImageField: 'cover', ogImage: null, allowIndexing: false },
      values: { title: 'Carrier portals', excerpt: '' },
      cover: { url: 'https://cdn/cover.jpg', alt: 'Cover' },
    })
    expect(meta.title).toBe('Carrier portals | Blog')
    expect(meta.description).toBe('Site description')
    expect(meta.openGraph).toMatchObject({ type: 'article', images: [{ url: 'https://cdn/cover.jpg', alt: 'Cover' }] })
    expect(meta.robots).toEqual({ index: false, follow: false })
  })
})
