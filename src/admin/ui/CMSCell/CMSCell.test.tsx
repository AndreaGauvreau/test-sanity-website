/** @vitest-environment jsdom */
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CMSCell, CMSRow, CMSTable } from './CMSCell'

afterEach(cleanup)

function EditableTitle({ onCommit = vi.fn() }: { onCommit?: (v: string) => void }) {
  const [value, setValue] = useState('Carrier portals')
  const [editing, setEditing] = useState(false)
  return (
    <CMSTable aria-label="Blog posts">
      <CMSRow header>
        <CMSCell type="handle" checkboxLabel="Select all" />
        <CMSCell type="header" width={240}>
          Title
        </CMSCell>
      </CMSRow>
      <CMSRow onOpen={() => {}} openLabel="Open Carrier portals">
        <CMSCell type="handle" checkboxLabel="Select Carrier portals" />
        <CMSCell
          type="title"
          editing={editing}
          onEditRequest={() => setEditing(true)}
          onCommit={(v) => {
            onCommit(v)
            setValue(v)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
          inputLabel="Title"
        >
          {value}
        </CMSCell>
      </CMSRow>
    </CMSTable>
  )
}

describe('CMSCell', () => {
  it('table, lignes, en-têtes ; poignée seulement dans le corps ; bouton open', () => {
    render(<EditableTitle />)
    expect(screen.getByRole('table', { name: 'Blog posts' })).toBeTruthy()
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeTruthy()
    expect(document.querySelectorAll('[data-icon="grip"]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Open Carrier portals' })).toBeTruthy()
  })

  it('clic : édition sur place ; Entrée valide', async () => {
    const onCommit = vi.fn()
    render(<EditableTitle onCommit={onCommit} />)
    await userEvent.click(screen.getByText('Carrier portals'))
    const input = screen.getByRole('textbox', { name: 'Title' })
    expect(document.activeElement).toBe(input)
    await userEvent.type(input, ': a checklist{Enter}')
    expect(onCommit).toHaveBeenCalledWith('Carrier portals: a checklist')
    expect(screen.getByText('Carrier portals: a checklist')).toBeTruthy()
  })

  it('Échap annule', async () => {
    const onCommit = vi.fn()
    render(<EditableTitle onCommit={onCommit} />)
    await userEvent.click(screen.getByText('Carrier portals'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), ' X{Escape}')
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Carrier portals')).toBeTruthy()
  })

  it('poignée focalisable (gripProps) : bouton nommé, dans l’ordre de tabulation, événements transmis', async () => {
    const onKeyDown = vi.fn()
    render(
      <CMSTable aria-label="Blog posts">
        <CMSRow>
          <CMSCell
            type="handle"
            checkboxLabel="Select Carrier portals"
            gripLabel="Reorder Carrier portals"
            gripProps={{ onKeyDown, 'aria-pressed': false, 'data-grip': 'p1' }}
          />
        </CMSRow>
      </CMSTable>,
    )
    const grip = screen.getByRole('button', { name: 'Reorder Carrier portals' })
    expect(grip.getAttribute('type')).toBe('button')
    expect(grip.getAttribute('data-grip')).toBe('p1')
    expect(grip.getAttribute('aria-pressed')).toBe('false')
    await userEvent.tab()
    expect(document.activeElement).toBe(grip)
    await userEvent.keyboard(' ')
    expect(onKeyDown).toHaveBeenCalled()
    // La case reste la suivante dans l'ordre de tabulation.
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select Carrier portals' }))
  })

  it('sans gripProps : poignée décorative (masquée, hors tabulation)', () => {
    const { container } = render(
      <CMSTable aria-label="Blog posts">
        <CMSRow>
          <CMSCell type="handle" checkboxLabel="Select Carrier portals" />
        </CMSRow>
      </CMSTable>,
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('[data-icon="grip"]')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('Row open : précédé d’une cellule de remplissage extensible (bord droit même si les colonnes sont étroites)', () => {
    render(
      <CMSTable aria-label="FAQ">
        <CMSRow onOpen={() => {}} openLabel="Open Question">
          <CMSCell type="title">Question</CMSCell>
        </CMSRow>
      </CMSTable>,
    )
    const open = screen.getByRole('button', { name: 'Open Question' })
    const rowOpen = open.parentElement as HTMLElement
    const filler = rowOpen.previousElementSibling as HTMLElement
    expect(filler.hasAttribute('data-row-filler')).toBe(true)
    expect(filler.getAttribute('aria-hidden')).toBe('true')
  })
})
