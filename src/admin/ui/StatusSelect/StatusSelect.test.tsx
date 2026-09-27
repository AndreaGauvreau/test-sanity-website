/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatusSelect } from './StatusSelect'

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

describe('StatusSelect', () => {
  it('pastille = bouton de menu nommé par le statut ; actions par défaut selon l’état', async () => {
    const onAction = vi.fn()
    render(
      <div data-kz-admin="">
        <StatusSelect status="changed" onAction={onAction} />
      </div>,
    )
    const trigger = screen.getByRole('button', { name: 'Status: Changed' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.textContent).toBe('Changed')
    await userEvent.click(trigger)
    const item = await screen.findByRole('menuitem', { name: 'Discard changes' })
    await userEvent.click(item)
    expect(onAction).toHaveBeenCalledWith('discard')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('clavier : Entrée ouvre sur la première action, Entrée la choisit', async () => {
    const onAction = vi.fn()
    render(
      <div data-kz-admin="">
        <StatusSelect status="live" onAction={onAction} />
      </div>,
    )
    const trigger = screen.getByRole('button', { name: 'Status: Live' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menu')
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Unpublish'))
    await userEvent.keyboard('{Enter}')
    expect(onAction).toHaveBeenCalledWith('unpublish')
  })

  it('sans action : simple pastille (pas de bouton)', () => {
    render(<StatusSelect status="draft" actions={[]} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Draft')).toBeTruthy()
  })
})
