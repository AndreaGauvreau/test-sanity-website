import { describe, expect, it } from 'vitest'

import type { PageDef } from '@/admin/core/contracts'

import { decideEditorAccess, editablePageForPath, editorHrefFor, normalizePublicPath } from './editor-access'

// Bouton « Edit with AI » du site en ligne (question 9) : décision pure de la route editor-access.
const PAGES = [
  { id: 'home', label: 'Home', path: '/', aiEditor: true },
  { id: 'blog', label: 'Blog', path: '/blog', aiEditor: false },
  { id: 'pricing', label: 'Pricing', path: '/pricing', aiEditor: true },
  { id: 'posts', label: 'Posts', path: '/blog/:slug', aiEditor: true },
] as unknown as PageDef[]

describe('normalizePublicPath', () => {
  it('garde le chemin, sans requête, fragment ni barre finale', () => {
    expect(normalizePublicPath('/')).toBe('/')
    expect(normalizePublicPath('/pricing/')).toBe('/pricing')
    expect(normalizePublicPath('/pricing?x=1#top')).toBe('/pricing')
  })

  it('refuse ce qui n’est pas un chemin relatif sûr', () => {
    for (const raw of [null, undefined, 42, '', 'pricing', '//evil.com', 'https://evil.com/', '/a\\b', '/a\u0000', `/${'a'.repeat(600)}`]) {
      expect(normalizePublicPath(raw), String(raw)).toBeNull()
    }
  })
})

describe('decideEditorAccess', () => {
  it('sans rôle : refus', () => {
    expect(decideEditorAccess({ role: null, path: '/', pages: PAGES })).toEqual({ canEdit: false })
    expect(decideEditorAccess({ role: undefined, path: '/', pages: PAGES })).toEqual({ canEdit: false })
  })

  it('rôle sans ai.editor : refus', () => {
    const can = () => false
    expect(decideEditorAccess({ role: 'kuartz', path: '/', pages: PAGES, can })).toEqual({ canEdit: false })
  })

  it('page sans aiEditor, motif, page inconnue : refus', () => {
    for (const path of ['/blog', '/blog/:slug', '/blog/hello', '/nope']) {
      expect(decideEditorAccess({ role: 'client', path, pages: PAGES }), path).toEqual({ canEdit: false })
    }
  })

  it('page ouverte à l’éditeur : lien vers l’éditeur, retour vers l’écran admin de la page', () => {
    expect(decideEditorAccess({ role: 'editor', path: '/pricing/', pages: PAGES })).toEqual({
      canEdit: true,
      href: '/admin/editor?page=pricing&back=%2Fadmin%2Fpages%2Fpricing',
    })
  })

  it('id de page hostile dans le manifeste : jamais de lien', () => {
    const pages = [{ id: '../x', label: 'X', path: '/x', aiEditor: true }] as unknown as PageDef[]
    expect(editablePageForPath(pages, '/x')).toBeNull()
  })

  it('editorHrefFor : back accepté par sanitizeNextPath', () => {
    expect(editorHrefFor('home')).toBe('/admin/editor?page=home&back=%2Fadmin%2Fpages%2Fhome')
  })
})
