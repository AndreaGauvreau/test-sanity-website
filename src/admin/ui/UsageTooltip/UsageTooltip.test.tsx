/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { UsageTooltip } from './UsageTooltip'

afterEach(() => cleanup())

describe('UsageTooltip', () => {
  it('miniature sur mesure (`preview`) à la place de l’image et du cadre ; montée seulement à l’ouverture', async () => {
    render(
      <UsageTooltip
        title="hero-truck.jpg · used in 2 places"
        places={[
          { id: 'a', label: 'Home › Hero — background', preview: <span data-testid="custom">page</span>, image: '/capture.png', highlight: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, href: 'https://conduit.com/' },
          { id: 'b', label: 'Blog › Post — cover', image: '/capture-2.png', highlight: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 } },
        ]}
      >
        <button type="button">Used ×2</button>
      </UsageTooltip>,
    )
    expect(screen.queryByTestId('custom')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Used ×2' }))
    const dialog = await screen.findByRole('dialog', { name: 'hero-truck.jpg · used in 2 places' })
    const custom = screen.getByTestId('custom')
    const [first, second] = Array.from(dialog.querySelectorAll('[class*="miniature"]'))
    expect(first.contains(custom)).toBe(true)
    // Emplacement avec `preview` : ni image ni cadre du kit ; l'autre garde les siens.
    expect(first.querySelector('img')).toBeNull()
    expect(first.children).toHaveLength(1)
    expect(second.querySelector('img')?.getAttribute('src')).toBe('/capture-2.png')
    expect(second.children).toHaveLength(2)
    expect(screen.getByRole('link', { name: /View/ }).getAttribute('href')).toBe('https://conduit.com/')
  })
})
