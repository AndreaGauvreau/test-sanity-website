/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingRow } from '../SettingRow'
import { Switch } from './Switch'

afterEach(cleanup)

describe('Switch', () => {
  it('role="switch" nommé par son libellé ; clic sur le texte, Espace et Entrée basculent', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch label="Search engines" onCheckedChange={onCheckedChange} />)
    const sw = screen.getByRole('switch', { name: 'Search engines' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(screen.getByText('Search engines'))
    expect(sw.getAttribute('aria-checked')).toBe('true')
    sw.focus()
    await userEvent.keyboard(' ')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await userEvent.keyboard('{Enter}')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(onCheckedChange).toHaveBeenCalledTimes(3)
  })

  it('désactivé : ne bascule pas', async () => {
    render(<Switch label="Locked" disabled defaultChecked />)
    const sw = screen.getByRole('switch', { name: 'Locked' })
    await userEvent.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('champ caché on / off', async () => {
    render(<Switch aria-label="Index" name="index" />)
    const input = document.querySelector('input[name=index]') as HTMLInputElement
    expect(input.value).toBe('off')
    await userEvent.click(screen.getByRole('switch', { name: 'Index' }))
    expect(input.value).toBe('on')
  })
})

describe('SettingRow', () => {
  it('le Switch est nommé par le titre et décrit par la description', () => {
    render(<SettingRow title="Search engines" description="Allow search engines to index this page." defaultChecked />)
    const sw = screen.getByRole('switch', { name: 'Search engines' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(document.getElementById(sw.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Allow search engines to index this page.')
  })
})
