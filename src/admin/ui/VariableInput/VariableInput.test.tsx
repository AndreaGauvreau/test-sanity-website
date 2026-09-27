/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseVariables, resolveVariables, serializeVariables, variablesIn } from './serialize'
import { VariableInput } from './VariableInput'

afterEach(cleanup)

const FIELDS = [
  { name: 'title', label: 'Title' },
  { name: 'excerpt', label: 'Excerpt' },
  { name: 'cover', label: 'Cover' },
]

describe('sérialisation {{champ}}', () => {
  it('parse et resérialise sans perte', () => {
    const value = '{{title}} | Conduit Blog — {{ excerpt }}'
    const segments = parseVariables(value)
    expect(segments).toEqual([
      { kind: 'variable', name: 'title' },
      { kind: 'text', text: ' | Conduit Blog — ' },
      { kind: 'variable', name: 'excerpt' },
    ])
    expect(serializeVariables(segments)).toBe('{{title}} | Conduit Blog — {{excerpt}}')
  })

  it('ignore les accolades incomplètes, liste les champs, résout avec repli', () => {
    expect(parseVariables('a {{ b')).toEqual([{ kind: 'text', text: 'a {{ b' }])
    expect(variablesIn('{{a}} {{b}} {{a}}')).toEqual(['a', 'b'])
    expect(resolveVariables('{{title}} | {{site}}', { title: 'Post' }, (n) => `<${n}>`)).toBe('Post | <site>')
  })
})

describe('VariableInput', () => {
  it('affiche des puces pour les champs, rouge pour un champ inconnu ; textbox nommée et décrite', () => {
    render(<VariableInput label="Meta title" helper="≈ 38 / 60" variables={FIELDS} defaultValue="{{title}} | {{nope}}" />)
    const box = screen.getByRole('textbox', { name: 'Meta title' })
    const chips = box.querySelectorAll('[data-variable]')
    expect([...chips].map((c) => c.getAttribute('data-variable'))).toEqual(['title', 'nope'])
    expect(chips[0].getAttribute('contenteditable')).toBe('false')
    expect(chips[1].getAttribute('title')).toBe('Unknown field: nope')
    expect(document.getElementById(box.getAttribute('aria-describedby') ?? '')?.textContent).toBe('≈ 38 / 60')
  })

  it('bouton « Insert field » : liste au clavier, insertion sérialisée', async () => {
    const onValueChange = vi.fn()
    render(<VariableInput label="Meta title" variables={FIELDS} defaultValue="Hello " onValueChange={onValueChange} />)
    const button = screen.getByRole('button', { name: 'Insert field' })
    await userEvent.click(button)
    const list = await screen.findByRole('listbox', { name: 'Fields' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(list))
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onValueChange).toHaveBeenLastCalledWith('Hello {{excerpt}}')
    expect(screen.getByRole('textbox').querySelectorAll('[data-variable]')).toHaveLength(1)
  })

  it('valeur contrôlée : le DOM suit la prop', () => {
    const { rerender } = render(<VariableInput label="T" variables={FIELDS} value="{{title}}" />)
    rerender(<VariableInput label="T" variables={FIELDS} value="{{cover}} x" />)
    const box = screen.getByRole('textbox')
    expect(box.querySelector('[data-variable]')?.getAttribute('data-variable')).toBe('cover')
    expect(box.textContent).toContain(' x')
  })
})
