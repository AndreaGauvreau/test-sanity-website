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
})
