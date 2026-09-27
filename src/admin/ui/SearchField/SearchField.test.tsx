/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Input } from '../Input'
import { SearchField } from './SearchField'

afterEach(cleanup)

describe('SearchField', () => {
  it('« / » donne le focus (hors d\'un champ), Kbd affiché quand vide', async () => {
    render(<SearchField />)
    const box = screen.getByRole('searchbox', { name: 'Search' })
    expect(document.querySelector('kbd')?.textContent).toBe('/')
    expect(box.getAttribute('aria-keyshortcuts')).toBe('Slash')
    fireEvent.keyDown(document.body, { key: '/' })
    expect(document.activeElement).toBe(box)
  })

  it('ne vole pas « / » tapé dans un autre champ', () => {
    render(
      <>
        <Input label="Other" />
        <SearchField />
      </>,
    )
    const other = screen.getByLabelText('Other')
    other.focus()
    fireEvent.keyDown(other, { key: '/' })
    expect(document.activeElement).toBe(other)
  })

  it('✕ efface ; Échap efface puis quitte le champ', async () => {
    const onValueChange = vi.fn()
    const onClear = vi.fn()
    render(<SearchField defaultValue="" onValueChange={onValueChange} onClear={onClear} />)
    const box = screen.getByRole('searchbox') as HTMLInputElement
    await userEvent.type(box, 'hero')
    expect(onValueChange).toHaveBeenLastCalledWith('hero')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(box.value).toBe('')
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(box)
    await userEvent.type(box, 'x')
    await userEvent.keyboard('{Escape}')
    expect(box.value).toBe('')
    expect(document.activeElement).toBe(box)
    await userEvent.keyboard('{Escape}')
    expect(document.activeElement).not.toBe(box)
  })
})

describe('Input', () => {
  it('libellé, aide, compteur et erreur reliés par aria', async () => {
    const { rerender } = render(<Input label="Title" maxLength={60} showCount defaultValue="Conduit" />)
    const input = screen.getByLabelText('Title') as HTMLInputElement
    const helper = () => document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent
    expect(helper()).toBe('7 / 60')
    await userEvent.type(input, '!')
    expect(helper()).toBe('8 / 60')
    rerender(<Input label="Title" error="Title is required." />)
    const again = screen.getByLabelText('Title')
    expect(again.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(again.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Title is required.')
  })

  it('libellé masqué reste le nom accessible', () => {
    render(<Input label="Hidden label" hideLabel />)
    expect(screen.getByLabelText('Hidden label')).toBeTruthy()
  })
})
