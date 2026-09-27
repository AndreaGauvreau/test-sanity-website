/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button, buttonClassName } from './Button'

afterEach(cleanup)

describe('Button', () => {
  it('rend un bouton type="button" avec son libellé et ses classes de variante', () => {
    render(<Button variant="secondary" size="small">Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.getAttribute('type')).toBe('button')
    expect(button.className).toBe(buttonClassName({ variant: 'secondary', size: 'small' }))
  })

  it('appelle onClick, sauf désactivé', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Go</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<Button onClick={onClick} disabled>Go</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('loading : aria-busy, loader, clics ignorés mais focus conservé', async () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Saving…</Button>)
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.querySelector('[data-icon="loader"]')).not.toBeNull()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    button.blur()
    await userEvent.tab()
    expect(document.activeElement).toBe(button)
  })

  it('icônes gauche et droite décoratives', () => {
    render(<Button iconLeft="plus" iconRight="chevron-down">Add</Button>)
    const icons = screen.getByRole('button').querySelectorAll('svg')
    expect(icons).toHaveLength(2)
    icons.forEach((svg) => expect(svg.getAttribute('aria-hidden')).toBe('true'))
  })
})
