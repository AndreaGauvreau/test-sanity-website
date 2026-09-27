/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Chip } from './Chip'

afterEach(cleanup)

describe('Chip', () => {
  it('bascule aria-pressed (non contrôlé), au clic et à l\'Espace', async () => {
    const onPressedChange = vi.fn()
    render(<Chip icon="style" onPressedChange={onPressedChange}>Style</Chip>)
    const chip = screen.getByRole('button', { name: 'Style' })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(onPressedChange).toHaveBeenLastCalledWith(true)
    await userEvent.keyboard(' ')
    expect(chip.getAttribute('aria-pressed')).toBe('false')
  })

  it('contrôlé : suit la prop', async () => {
    const onPressedChange = vi.fn()
    render(<Chip pressed onPressedChange={onPressedChange}>Text</Chip>)
    const chip = screen.getByRole('button')
    await userEvent.click(chip)
    expect(onPressedChange).toHaveBeenCalledWith(false)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
  })
})
