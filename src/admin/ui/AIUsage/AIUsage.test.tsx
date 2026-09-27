/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AI_USAGE_NOTES, AIUsage, aiUsageNote } from './AIUsage'

/** Carte « AI usage » : coût FACTURÉ dans « Cost », part de l'abonnement Claude à part, note selon ce qui a servi. */

afterEach(cleanup)

const INCLUDED = '≈ $0.30 at API prices — included in your Claude subscription'

function renderCard(props: Partial<Parameters<typeof AIUsage>[0]> = {}) {
  render(
    <div data-kz-admin="">
      <AIUsage totals={{ inputTokens: 245_000, outputTokens: 4_000, costUsd: 0.1, includedUsd: 0.3 }} {...props} />
    </div>,
  )
  return screen.getByRole('heading', { name: 'AI usage' }).closest('section')!
}

describe('AIUsage — facturé / abonnement Claude', () => {
  it('note : facturé (défaut, chargement), abonnement seulement, mélange', () => {
    expect(aiUsageNote(null)).toBe(AI_USAGE_NOTES.billed)
    expect(aiUsageNote({ costUsd: 4.8 })).toBe(AI_USAGE_NOTES.billed)
    expect(aiUsageNote({ costUsd: 0, includedUsd: 0.3 })).toBe(AI_USAGE_NOTES.included)
    expect(aiUsageNote({ costUsd: 0.1, includedUsd: 0.3 })).toBe(AI_USAGE_NOTES.mixed)
  })

  it('Cost = facturé ; la part incluse a sa ligne ; la note suit', () => {
    const card = renderCard({
      features: [{ id: 'editor', label: 'AI editor', usage: { model: 'claude-opus-5-5', inputTokens: 245_000, outputTokens: 4_000, costUsd: 0.1, includedUsd: 0.3 } }],
    })
    expect(within(card).getByText('$0.10')).toBeTruthy()
    expect(within(card).getByText(INCLUDED)).toBeTruthy()
    expect(within(card).getByText(AI_USAGE_NOTES.mixed)).toBeTruthy()
    expect(within(card).getByText('$0.10 + included')).toBeTruthy()
  })

  it('sans abonnement : rien de plus, note d’origine ; chargement : pas de ligne incluse', () => {
    const card = renderCard({ totals: { inputTokens: 1_200_000, outputTokens: 147_000, costUsd: 4.8 } })
    expect(within(card).queryByText(INCLUDED)).toBeNull()
    expect(within(card).getByText(AI_USAGE_NOTES.billed)).toBeTruthy()
    cleanup()
    const loading = renderCard({ loading: true })
    expect(within(loading).queryByText(INCLUDED)).toBeNull()
    expect(within(loading).getByText(AI_USAGE_NOTES.billed)).toBeTruthy()
  })

  it('note imposée ou masquée (`null`)', () => {
    expect(within(renderCard({ note: 'Custom note.' })).getByText('Custom note.')).toBeTruthy()
    cleanup()
    const card = renderCard({ note: null })
    expect(within(card).queryByText(AI_USAGE_NOTES.mixed)).toBeNull()
  })
})
