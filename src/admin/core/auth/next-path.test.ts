import { describe, expect, it } from 'vitest'

import { loginUrlFor, sanitizeNextPath } from './next-path'

describe('sanitizeNextPath', () => {
  it('garde un chemin de l’admin avec sa requête', () => {
    expect(sanitizeNextPath('/admin/pages/home?tab=seo')).toBe('/admin/pages/home?tab=seo')
    expect(sanitizeNextPath('/admin')).toBe('/admin')
  })
  it('refuse les redirections ouvertes et les chemins hors admin', () => {
    for (const bad of ['https://evil.com', '//evil.com/admin', '/\\evil.com', '/blog', '/administrator', '/admin/../blog', 'admin', 'javascript:alert(1)', '/admin\n/x', null, undefined, '']) {
      expect(sanitizeNextPath(bad as string)).toBe('/admin')
    }
  })
  it('évite les boucles (login, callback, API)', () => {
    expect(sanitizeNextPath('/admin/login?next=/admin')).toBe('/admin')
    expect(sanitizeNextPath('/admin/auth/callback')).toBe('/admin')
    expect(sanitizeNextPath('/admin/api/engine/health')).toBe('/admin')
  })
})

describe('loginUrlFor', () => {
  it('construit /admin/login?next=…', () => {
    expect(loginUrlFor('/admin/media')).toBe('/admin/login?next=%2Fadmin%2Fmedia')
    expect(loginUrlFor('/admin')).toBe('/admin/login')
    expect(loginUrlFor('https://evil.com')).toBe('/admin/login')
  })
})
