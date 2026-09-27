/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorHeader, isFakeModel } from './EditorHeader'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

describe('EditorHeader — libellé du modèle (régression : id affiché au lieu du libellé du moteur)', () => {
  it('affiche le libellé du faux Claude, signalé visiblement', () => {
    const label = 'Fake Claude (auto) — no real call'
    render(<EditorHeader backHref="/admin" locked={false} usage={null} model={{ id: 'claude-opus-5-5', label }} />)
    const el = screen.getByText(label)
    expect(el.getAttribute('data-fake')).toBe('true')
    expect(screen.queryByText('Opus 5.5')).toBeNull()
  })

  it('affiche le libellé réel sans marque de faux', () => {
    render(<EditorHeader backHref="/admin" locked={false} usage={null} model={{ id: 'claude-opus-5-5', label: 'Opus 5.5' }} />)
    expect(screen.getByText('Opus 5.5').getAttribute('data-fake')).toBeNull()
  })

  it('repli sur l’id quand le moteur ne fournit pas de libellé', () => {
    render(<EditorHeader backHref="/admin" locked={false} usage={null} model={{ id: 'claude-opus-5-5' }} />)
    expect(screen.getByText('Opus 5.5')).toBeTruthy()
  })

  it('isFakeModel', () => {
    expect(isFakeModel({ id: 'fake-auto' })).toBe(true)
    expect(isFakeModel({ id: 'claude-opus-5-5', label: 'Opus 5.5' })).toBe(false)
  })
})
