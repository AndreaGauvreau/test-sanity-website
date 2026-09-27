/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

afterEach(cleanup)

describe('SegmentedControl', () => {
  it('radiogroup : un radio coché, roving tabindex', () => {
    render(
      <SegmentedControl
        aria-label="Viewport"
        defaultValue="tablet"
        items={[
          { value: 'desktop', label: 'Desktop' },
          { value: 'tablet', label: 'Tablet' },
          { value: 'mobile', label: 'Mobile' },
        ]}
      />,
    )
    const group = screen.getByRole('radiogroup', { name: 'Viewport' })
    const radios = screen.getAllByRole('radio')
    expect(group).toBeTruthy()
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1])
  })

  it('flèches : sélectionnent et déplacent le focus (en boucle, désactivé sauté)', async () => {
    const onValueChange = vi.fn()
    render(
      <SegmentedControl
        aria-label="Viewport"
        onValueChange={onValueChange}
        items={[
          { value: 'desktop', label: 'Desktop' },
          { value: 'tablet', label: 'Tablet', disabled: true },
          { value: 'mobile', label: 'Mobile' },
        ]}
      />,
    )
    const [desktop, , mobile] = screen.getAllByRole('radio')
    desktop.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(mobile)
    expect(onValueChange).toHaveBeenLastCalledWith('mobile')
    expect(mobile.getAttribute('aria-checked')).toBe('true')
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(desktop)
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(mobile)
  })

  it('segments à icône : nom accessible = libellé', async () => {
    const onValueChange = vi.fn()
    render(
      <SegmentedControl
        aria-label="Mode"
        defaultValue="view"
        onValueChange={onValueChange}
        items={[
          { value: 'view', label: 'View', icon: 'eye' },
          { value: 'select', label: 'Select', icon: 'select' },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Select' }))
    expect(onValueChange).toHaveBeenCalledWith('select')
  })
})
