/** @vitest-environment jsdom */
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Préférence « mouvement réduit » pilotée par le test (serveur : false ; navigateur : au choix).
const reduced = vi.hoisted(() => ({ value: false as boolean | null }))
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reduced.value }
})

import { SelectionBar } from './SelectionBar'

afterEach(() => {
  reduced.value = false
})

function html(pref: boolean | null) {
  reduced.value = pref
  return renderToString(<SelectionBar selectedCount={2} totalCount={5} onClear={() => {}} onDelete={() => {}} deletableCount={1} />)
}

describe('SelectionBar', () => {
  it('même balisage initial avec ou sans mouvement réduit (pas d’écart d’hydratation)', () => {
    // Le serveur ne connaît pas la préférence (null) ; le navigateur peut la connaître dès le premier rendu.
    const server = html(null)
    expect(html(true)).toBe(server)
    expect(html(false)).toBe(server)
  })

  it('annonce le compte et déduit le mode de suppression', () => {
    const out = html(false)
    expect(out).toContain('data-delete="partial"')
    expect(out).toContain('Delete 1 unused')
    expect(out).toContain('1 used file is locked')
  })
})
