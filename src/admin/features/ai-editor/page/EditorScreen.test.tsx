/** @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useEditorStore } from '../state/context'
import type { EditorStore } from '../state/store'
import { EditorScreen } from './EditorScreen'

// La sidebar (editor-sidebar) et l'aperçu sont remplacés : seul le câblage de l'écran vers le magasin est testé ici.
let store: EditorStore | null = null
vi.mock('../sidebar', () => ({
  EditorSidebar: function SidebarProbe() {
    store = useEditorStore()
    return null
  },
}))
vi.mock('../canvas', () => ({ EditorCanvas: () => null }))

afterEach(() => {
  cleanup()
  store = null
})

describe('EditorScreen — « ‹ Admin » (G1, FOLLOWUPS #29)', () => {
  it('transmet `backHref` (écran d’origine, même onglet) au magasin de l’éditeur', () => {
    render(<EditorScreen pageId="home" path="/" pageLabel="Home" labels={{}} backHref="/admin/pages/home/seo" />)
    expect(store!.get().backHref).toBe('/admin/pages/home/seo')
    expect(store!.get().pageId).toBe('home')
  })

  it('sans `back` : null (la sidebar revient à /admin/pages/<id>)', () => {
    render(<EditorScreen pageId="home" path="/" pageLabel="Home" labels={{}} />)
    expect(store!.get().backHref).toBeNull()
  })
})
