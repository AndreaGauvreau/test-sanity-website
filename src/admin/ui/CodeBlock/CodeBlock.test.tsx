/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeBlock } from './CodeBlock'
import { tokenizeCode } from './highlight'

afterEach(cleanup)

describe('tokenizeCode', () => {
  it('balises, accolades JSON et champs {{…}}', () => {
    expect(tokenizeCode('<script>{ "a": "{{title}}" }</script>')).toEqual([
      { kind: 'text', text: '<' },
      { kind: 'tag', text: 'script' },
      { kind: 'text', text: '>' },
      { kind: 'brace', text: '{' },
      { kind: 'text', text: ' "a": "' },
      { kind: 'value', text: '{{title}}' },
      { kind: 'text', text: '" ' },
      { kind: 'brace', text: '}' },
      { kind: 'text', text: '</' },
      { kind: 'tag', text: 'script' },
      { kind: 'text', text: '>' },
    ])
  })

  it('reconstitue exactement le texte', () => {
    const code = '<a href="x">{{a}}</a>\n{ }'
    expect(tokenizeCode(code).map((t) => t.text).join('')).toBe(code)
  })
})

describe('CodeBlock', () => {
  it('éditable : textarea nommée, valeur transmise, numéros de ligne', async () => {
    const onValueChange = vi.fn()
    render(<CodeBlock label="Code" defaultValue={'<script>\n</script>'} onValueChange={onValueChange} />)
    const area = screen.getByRole('textbox', { name: 'Code' })
    await userEvent.type(area, 'x')
    expect(onValueChange).toHaveBeenLastCalledWith('<script>\n</script>x')
  })

  it('lecture seule : pas de champ, région focalisable décrite par la note', () => {
    render(<CodeBlock label="JSON-LD" value="{}" readOnly />)
    expect(screen.queryByRole('textbox')).toBeNull()
    const region = screen.getByRole('region', { name: 'JSON-LD' })
    expect(region.tabIndex).toBe(0)
    expect(document.getElementById(region.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Written in code by Kuartz')
  })
})
