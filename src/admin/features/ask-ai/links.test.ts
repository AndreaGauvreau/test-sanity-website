import { describe, expect, it } from 'vitest'
import adminConfig from '@/admin.config'
import { askRoutes, editorHref, findAskRoute, isSafeAskHref, normalizeAskHref, resolveAskLinks, screenOf } from './links'

describe('catalogue des écrans d’Ask AI', () => {
  it('libellés du Figma : Open Media, Open Home, Open Home in AI editor', () => {
    const routes = askRoutes(adminConfig, 'client')
    const label = (href: string) => routes.find((r) => r.href === href)?.label
    expect(label('/admin/media')).toBe('Open Media')
    expect(label('/admin/pages/home')).toBe('Open Home')
    expect(label('/admin/editor?page=home')).toBe('Open Home in AI editor')
    // Page et collection de même nom : la page est précisée.
    expect(label('/admin/pages/blog')).toBe('Open Blog page')
    expect(label('/admin/cms/blog')).toBe('Open Blog')
    expect(label('/admin/pages/blog/slug/seo')).toBe('Open Post page SEO')
    // Blog n'a pas d'éditeur IA.
    expect(label('/admin/editor?page=blog')).toBeUndefined()
  })

  it('selon le rôle : Code (Kuartz), Team (client), aucun des deux (editor)', () => {
    const has = (role: 'kuartz' | 'client' | 'editor', href: string) => askRoutes(adminConfig, role).some((r) => r.href === href)
    expect([has('kuartz', '/admin/settings/code'), has('client', '/admin/settings/code'), has('editor', '/admin/settings/code')]).toEqual([true, false, false])
    expect([has('kuartz', '/admin/settings/team'), has('client', '/admin/settings/team'), has('editor', '/admin/settings/team')]).toEqual([false, true, false])
  })

  it('normalisation et refus des liens étrangers', () => {
    expect(normalizeAskHref(' “/admin/media”. ')).toBe('/admin/media')
    expect(normalizeAskHref('http://127.0.0.1:4040/admin/media/')).toBe('/admin/media')
    expect(normalizeAskHref('https://evil.example/phish')).toBeNull()
    expect(normalizeAskHref('/admin//evil.example')).toBeNull()
    expect(normalizeAskHref('/admin/../studio')).toBeNull()
    expect(normalizeAskHref('javascript:alert(1)')).toBeNull()
    const routes = askRoutes(adminConfig, 'editor')
    expect(findAskRoute(routes, '/admin/settings/team')).toBeNull()
    expect(resolveAskLinks(routes, ['/admin/media', '/admin/media', '/admin/cms/blog', '/admin/cms/faq', '/admin/publish'])).toHaveLength(3)
  })

  it('écran ouvert : le plus long préfixe, l’éditeur par sa page', () => {
    const routes = askRoutes(adminConfig, 'kuartz')
    expect(screenOf(routes, '/admin/cms/blog/post-1')?.href).toBe('/admin/cms/blog')
    expect(screenOf(routes, '/admin/pages/home/seo')?.href).toBe('/admin/pages/home/seo')
    expect(screenOf(routes, '/admin')?.href).toBe('/admin')
    expect(screenOf(routes, '/admin/editor?page=home')?.href).toBe(editorHref('home'))
    expect(screenOf(routes, '/somewhere')).toBeNull()
  })

  it('isSafeAskHref : chemins de l’admin seulement', () => {
    expect(isSafeAskHref('/admin/media')).toBe(true)
    expect(isSafeAskHref('/admin/editor?page=home')).toBe(true)
    expect(isSafeAskHref('/admin')).toBe(true)
    for (const bad of ['https://evil.example', '//evil.example', '/admin/../x', 'javascript:alert(1)', '/adminx', '/admin/a?next=https://x', 42]) {
      expect(isSafeAskHref(bad)).toBe(false)
    }
  })
})
