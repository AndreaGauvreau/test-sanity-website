/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
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

describe('EditorHeader — coût de la conversation (facturé / abonnement Claude)', () => {
  const MODEL = { id: 'claude-opus-5-5', label: 'Opus 5.5' }
  const base = { model: 'claude-opus-5-5', inputTokens: 120_000, outputTokens: 2_800, costKind: 'billed' as const }

  it('abonnement : « Included », prix API seulement dans l’infobulle et la ligne lue, jamais comme un coût', () => {
    render(<EditorHeader backHref="/admin" locked={false} model={MODEL} usage={{ ...base, costUsd: 0, includedUsd: 0.39 }} />)
    const region = screen.getByLabelText('Conversation usage')
    expect(screen.getByText('Included')).toBeTruthy()
    const line = '120k input · 2.8k output · included in your Claude subscription (≈ $0.39 at API prices)'
    expect(within(region).getByTitle(line)).toBeTruthy()
    expect(region.textContent).toContain(line)
    expect(region.textContent).not.toContain('$0.00')
  })

  it('mélange : coût facturé + « included »', () => {
    render(<EditorHeader backHref="/admin" locked={false} model={MODEL} usage={{ ...base, costUsd: 0.02, includedUsd: 0.18 }} />)
    expect(screen.getByText('$0.02 + included')).toBeTruthy()
  })

  it('clé API : coût facturé, « ~ » s’il est estimé (inchangé)', () => {
    render(<EditorHeader backHref="/admin" locked={false} model={MODEL} usage={{ ...base, costUsd: 0.39, includedUsd: 0, costKind: 'estimated' }} />)
    expect(screen.getByText('~$0.39')).toBeTruthy()
    expect(screen.queryByText('Included')).toBeNull()
  })
})
