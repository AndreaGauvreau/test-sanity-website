import { vercelStegaCombine } from '@vercel/stega'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { editAttrs, isEditorPreview, publishedId } from './preview'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('editAttrs', () => {
  it('ne rend rien hors du mode aperçu (HTML public inchangé)', () => {
    vi.stubEnv('KZ_EDITOR_PREVIEW', '')
    expect(isEditorPreview()).toBe(false)
    expect(editAttrs('hero.title', { doc: 'drafts.dockSchedulingPage', key: 'k1' })).toEqual({})
  })

  it('ne réagit qu’à la valeur exacte « 1 »', () => {
    vi.stubEnv('KZ_EDITOR_PREVIEW', 'true')
    expect(editAttrs('hero.title')).toEqual({})
  })

  it('rend zone, document publié et clé en mode aperçu', () => {
    vi.stubEnv('KZ_EDITOR_PREVIEW', '1')
    expect(editAttrs('features.card', { doc: 'drafts.dockSchedulingPage', key: 'custom-rules' })).toEqual({
      'data-edit': 'features.card',
      'data-edit-doc': 'dockSchedulingPage',
      'data-edit-key': 'custom-rules',
    })
    expect(editAttrs(null, { doc: 'post-1' })).toEqual({ 'data-edit-doc': 'post-1' })
  })
})

describe('publishedId', () => {
  it('retire drafts. et versions.<release>.', () => {
    expect(publishedId('drafts.post-1')).toBe('post-1')
    expect(publishedId('versions.r123.post-1')).toBe('post-1')
    expect(publishedId('post-1')).toBe('post-1')
  })

  it('retire l’encodage stega (Draft Mode)', () => {
    const encoded = vercelStegaCombine('drafts.faq-1', { origin: 'sanity.io', href: '/studio/intent/edit/id=faq-1' })
    expect(encoded).not.toBe('drafts.faq-1')
    expect(publishedId(encoded)).toBe('faq-1')
  })
})
