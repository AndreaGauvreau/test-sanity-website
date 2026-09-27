/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ListItems } from '../OptionList'
import { Select } from './Select'

afterEach(cleanup)

const OPTIONS: ListItems = [
  { value: 'head-end', label: 'End of <head>' },
  { value: 'body-start', label: 'Start of <body>' },
  { value: 'body-mid', label: 'Middle of <body>', disabled: true },
  { value: 'body-end', label: 'End of <body>' },
]

function setup(props: Partial<Parameters<typeof Select>[0]> = {}) {
  const onValueChange = vi.fn()
  render(<Select label="Placement" options={OPTIONS} onValueChange={onValueChange} {...props} />)
  const combo = screen.getByRole('combobox', { name: /Placement/ })
  return { combo, onValueChange }
}

describe('Select', () => {
  it('combobox select-only : libellé, placeholder, fermé', () => {
    const { combo } = setup()
    expect(combo.getAttribute('aria-haspopup')).toBe('listbox')
    expect(combo.getAttribute('aria-expanded')).toBe('false')
    expect(combo.textContent).toContain('Select…')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('souris : ouvre, choisit, referme et rend le focus', async () => {
    const { combo, onValueChange } = setup()
    await userEvent.click(combo)
    const list = await screen.findByRole('listbox')
    expect(combo.getAttribute('aria-expanded')).toBe('true')
    expect(combo.getAttribute('aria-controls')).toBe(list.id)
    await userEvent.click(screen.getByRole('option', { name: 'End of <body>' }))
    expect(onValueChange).toHaveBeenCalledWith('body-end')
    expect(combo.getAttribute('aria-expanded')).toBe('false')
    expect(combo.textContent).toContain('End of <body>')
    expect(document.activeElement).toBe(combo)
  })

  it('clavier : ↓ ouvre, flèches sautent les options désactivées, Entrée choisit', async () => {
    const { combo, onValueChange } = setup()
    combo.focus()
    await userEvent.keyboard('{ArrowDown}')
    await screen.findByRole('listbox')
    const active = () => document.getElementById(combo.getAttribute('aria-activedescendant') ?? '')?.textContent
    expect(active()).toBe('End of <head>')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(active()).toBe('End of <body>')
    await userEvent.keyboard('{ArrowUp}')
    expect(active()).toBe('Start of <body>')
    await userEvent.keyboard('{End}')
    expect(active()).toBe('End of <body>')
    await userEvent.keyboard('{Home}')
    expect(active()).toBe('End of <head>')
    await userEvent.keyboard('{Enter}')
    expect(onValueChange).toHaveBeenLastCalledWith('head-end')
    expect(combo.getAttribute('aria-expanded')).toBe('false')
  })

  it('Échap ferme sans choisir ; option sélectionnée marquée aria-selected', async () => {
    const { combo, onValueChange } = setup({ defaultValue: 'body-start' })
    combo.focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('listbox')
    expect(screen.getByRole('option', { name: 'Start of <body>' }).getAttribute('aria-selected')).toBe('true')
    await userEvent.keyboard('{ArrowDown}{Escape}')
    expect(combo.getAttribute('aria-expanded')).toBe('false')
    expect(onValueChange).not.toHaveBeenCalled()
    expect(combo.textContent).toContain('Start of <body>')
  })

  it('recherche par lettres, fermé ou ouvert', async () => {
    const { combo } = setup()
    combo.focus()
    await userEvent.keyboard('s')
    await screen.findByRole('listbox')
    expect(document.getElementById(combo.getAttribute('aria-activedescendant') ?? '')?.textContent).toBe('Start of <body>')
  })

  it('Tab choisit l\'option active et ferme', async () => {
    const { combo, onValueChange } = setup()
    combo.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await userEvent.tab()
    expect(onValueChange).toHaveBeenCalledWith('body-start')
    await waitFor(() => expect(combo.getAttribute('aria-expanded')).toBe('false'))
  })

  it('contrôlé, désactivé, erreur et champ caché de formulaire', () => {
    render(<Select label="Run" options={OPTIONS} value="body-end" disabled error="Required" name="placement" />)
    const combo = screen.getByRole('combobox', { name: /Run/ })
    expect((combo as HTMLButtonElement).disabled).toBe(true)
    expect(combo.getAttribute('aria-invalid')).toBe('true')
    const helper = document.getElementById(combo.getAttribute('aria-describedby') ?? '')
    expect(helper?.textContent).toBe('Required')
    expect((document.querySelector('input[name=placement]') as HTMLInputElement).value).toBe('body-end')
  })
})
