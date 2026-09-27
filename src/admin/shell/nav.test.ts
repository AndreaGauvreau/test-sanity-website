import { describe, expect, it } from 'vitest'

import { adminConfig } from '@/admin.config'

import {
  DEFAULT_KUARTZ_HUB_URL,
  buildShellNav,
  isExternalHref,
  resolveHubUrl,
  resolveShellLocation,
  toShellRouteConfig,
  type ShellNavSection,
} from './nav'

const counts = { blog: 12, testimonials: 3, faq: 9 }

function labels(sections: ShellNavSection[], id: string): string[] {
  return sections.find((s) => s.id === id)!.items.map((i) => i.label)
}

describe('buildShellNav — éléments selon le rôle', () => {
  it('Kuartz : SITE SETTINGS = General · Code (tag KUARTZ) · Usage, pas de Team', () => {
    const nav = buildShellNav(adminConfig, 'kuartz', counts)
    expect(labels(nav, 'settings')).toEqual(['General', 'Code', 'Usage'])
    const code = nav[0].items.find((i) => i.id === 'settings.code')!
    expect(code).toMatchObject({ tag: 'kuartz', icon: 'code', href: '/admin/settings/code' })
  })

  it('client : General · Team (tag CLIENT) · Usage, pas de Code', () => {
    const nav = buildShellNav(adminConfig, 'client', counts)
    expect(labels(nav, 'settings')).toEqual(['General', 'Team', 'Usage'])
    expect(nav[0].items.find((i) => i.id === 'settings.team')).toMatchObject({ tag: 'client', icon: 'team' })
  })

  it('editor : ni Code ni Team (question 11)', () => {
    expect(labels(buildShellNav(adminConfig, 'editor', counts), 'settings')).toEqual(['General', 'Usage'])
  })

  it('sections dans l’ordre du Figma, libellés en capitales', () => {
    expect(buildShellNav(adminConfig, 'client', counts).map((s) => s.label)).toEqual(['SITE SETTINGS', 'PAGES', 'CMS', 'ASSETS'])
  })

  it('PAGES : « Home » (maison) puis le chemin des autres pages ; la page listing porte sa page article « slug: N »', () => {
    const pages = buildShellNav(adminConfig, 'client', counts).find((s) => s.id === 'pages')!.items
    expect(pages.map((p) => [p.label, p.icon, p.href])).toEqual([
      ['Home', 'house', '/admin/pages/home'],
      ['/blog', 'page', '/admin/pages/blog'],
      ['/testimonials', 'page', '/admin/pages/testimonials'],
      ['/faq', 'page', '/admin/pages/faq'],
    ])
    expect(pages[0].children).toBeUndefined()
    // Compte de la page article = celui de sa collection (post → blog, testimonial → testimonials, faq → faq).
    expect(pages.slice(1).map((p) => p.children)).toEqual([
      [{ id: 'page:blog:article', label: 'slug:', icon: 'database', href: '/admin/pages/blog/slug/seo', count: 12 }],
      [{ id: 'page:testimonials:article', label: 'slug:', icon: 'database', href: '/admin/pages/testimonials/slug/seo', count: 3 }],
      [{ id: 'page:faq:article', label: 'slug:', icon: 'database', href: '/admin/pages/faq/slug/seo', count: 9 }],
    ])
  })

  it('CMS : une ligne par collection avec son nombre d’éléments ; compte inconnu → null', () => {
    const cms = buildShellNav(adminConfig, 'client', { blog: 12, testimonials: null }).find((s) => s.id === 'cms')!.items
    expect(cms.map((c) => [c.label, c.icon, c.href, c.count])).toEqual([
      ['Blog', 'database', '/admin/cms/blog', 12],
      ['Testimonials', 'database', '/admin/cms/testimonials', null],
      ['FAQ', 'database', '/admin/cms/faq', null],
    ])
  })

  it('ASSETS : Media', () => {
    const assets = buildShellNav(adminConfig, 'kuartz').find((s) => s.id === 'assets')!.items
    expect(assets).toEqual([{ id: 'media', label: 'Media', icon: 'image', href: '/admin/media' }])
  })

  it('icône inconnue du kit → database ; id encodé dans l’URL', () => {
    const nav = buildShellNav(
      { pages: [], collections: [{ ...adminConfig.collections[0], id: 'a b', icon: 'nope' }] },
      'client',
    )
    expect(nav.map((s) => s.id)).toEqual(['settings', 'cms', 'assets'])
    expect(nav[1].items[0]).toMatchObject({ icon: 'database', href: '/admin/cms/a%20b' })
  })
})

describe('resolveShellLocation — actif selon l’URL', () => {
  const routes = toShellRouteConfig(adminConfig)
  const cases: [string, string | null, string | null][] = [
    ['/admin', null, 'Overview'],
    ['/admin/', null, 'Overview'],
    ['/admin/settings/general', 'settings.general', 'General'],
    ['/admin/settings/code', 'settings.code', 'Code'],
    ['/admin/settings/team', 'settings.team', 'Team'],
    ['/admin/settings/usage', 'settings.usage', 'Usage'],
    ['/admin/settings/constructor', null, null],
    ['/admin/pages/home', 'page:home', 'Home'],
    ['/admin/pages/home/seo', 'page:home', 'Home'],
    ['/admin/pages/blog', 'page:blog', 'Blog'],
    ['/admin/pages/blog/slug/seo', 'page:blog:article', 'Blog article page'],
    ['/admin/pages/home/slug/seo', 'page:home', 'Home'],
    ['/admin/pages/unknown', null, null],
    ['/admin/cms/blog', 'cms:blog', 'Blog'],
    ['/admin/cms/blog/post-demo-1', 'cms:blog', 'Blog'],
    ['/admin/cms/faq?q=x', 'cms:faq', 'FAQ'],
    ['/admin/media', 'media', 'Media'],
    ['/admin/publish', null, 'Publish'],
    ['/admin/publish/versions', null, 'Versions'],
    ['/admin/kit', null, null],
    ['/adminx', null, null],
    ['/', null, null],
  ]
  it.each(cases)('%s → %s', (path, activeId, screen) => {
    expect(resolveShellLocation(path, routes)).toEqual({ activeId, screen })
  })

  it('null / chemin mal encodé : pas d’erreur', () => {
    expect(resolveShellLocation(null, routes)).toEqual({ activeId: null, screen: null })
    expect(resolveShellLocation('/admin/cms/%E0%A4%A', routes)).toEqual({ activeId: null, screen: null })
  })

  it('toShellRouteConfig ne garde que id, libellé et présence d’une page article', () => {
    expect(JSON.stringify(routes)).not.toContain('fields')
    expect(routes.pages.find((p) => p.id === 'blog')?.article).toBe(true)
  })
})

describe('liens', () => {
  it('resolveHubUrl : URL http(s) valide, sinon le site de Kuartz', () => {
    expect(resolveHubUrl('https://hub.example.com/projects')).toBe('https://hub.example.com/projects')
    expect(resolveHubUrl(undefined)).toBe(DEFAULT_KUARTZ_HUB_URL)
    expect(resolveHubUrl('javascript:alert(1)')).toBe(DEFAULT_KUARTZ_HUB_URL)
    expect(resolveHubUrl('https://user:pw@hub.example.com')).toBe(DEFAULT_KUARTZ_HUB_URL)
    expect(resolveHubUrl('not a url')).toBe(DEFAULT_KUARTZ_HUB_URL)
  })

  it('isExternalHref', () => {
    expect(isExternalHref('https://kuartz.studio')).toBe(true)
    expect(isExternalHref('//evil.com')).toBe(true)
    expect(isExternalHref('/admin/media')).toBe(false)
  })
})
