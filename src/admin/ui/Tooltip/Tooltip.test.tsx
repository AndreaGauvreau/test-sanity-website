/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IconButton } from '../IconButton'
import { Tooltip } from './Tooltip'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Tooltip', () => {
  it('s\'ouvre au focus clavier, décrit le déclencheur et se ferme avec Échap', async () => {
    render(
      <Tooltip label="Sort" shortcut="⌘ S">
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    const trigger = screen.getByRole('button', { name: 'Trigger' })
    await userEvent.tab()
    expect(document.activeElement).toBe(trigger)
    const tip = await screen.findByRole('tooltip')
    expect(tip.textContent).toContain('Sort')
    expect(tip.querySelector('kbd')?.textContent).toBe('⌘ S')
    expect(trigger.getAttribute('aria-describedby')).toBe(tip.id)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('au survol : attend le délai avant d\'apparaître, disparaît à la sortie', async () => {
    vi.useFakeTimers()
    // Sort de la fenêtre « tooltips chauds » laissée par le test précédent.
    vi.setSystemTime(Date.now() + 60_000)
    render(
      <Tooltip label="Later" delay={500}>
        <button type="button">Hover</button>
      </Tooltip>,
    )
    const trigger = screen.getByRole('button')
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(300))
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => vi.advanceTimersByTime(250))
    expect(screen.getByRole('tooltip').textContent).toContain('Later')
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' })
    // Fermeture décidée tout de suite (plus de lien aria-describedby) ; le retrait du DOM suit l'animation de sortie,
    // qui peut dépasser la seconde par défaut de waitFor quand toute la suite tourne (FOLLOWUPS #43).
    expect(trigger.getAttribute('aria-describedby')).toBeNull()
    vi.useRealTimers()
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull(), { timeout: 5000 })
  })

  it('IconButton : infobulle = nom accessible, pas de aria-describedby en double', async () => {
    render(<IconButton icon="trash" label="Delete" />)
    const button = screen.getByRole('button', { name: 'Delete' })
    await userEvent.tab()
    await screen.findByRole('tooltip')
    expect(button.getAttribute('aria-describedby')).toBeNull()
  })

  it('désactivé : rien ne s\'ouvre', async () => {
    render(
      <Tooltip label="Nope" disabled>
        <button type="button">X</button>
      </Tooltip>,
    )
    await userEvent.tab()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
