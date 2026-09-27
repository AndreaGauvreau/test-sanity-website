/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { autosave } from '@/admin/core/autosave'
import type { FilterCondition } from '@/admin/ui'

import { DEFAULT_RICH_TEXT, richTextConfigFor } from '../lib/portable-text'
import { ListTools } from './ListTools'
import { RichTextField } from './RichTextField/RichTextField'
import { createFieldSaver } from './useFieldSaver'
import { moveIndex, neighbourOffset, targetFromOffset, useReorder } from './useReorder'

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  MotionGlobalConfig.skipAnimations = false
})

describe('createFieldSaver (sauvegarde automatique)', () => {
  it('attend la fin de la frappe, envoie la DERNIÈRE valeur, signale la Top bar', async () => {
    vi.useFakeTimers()
    const saving = vi.spyOn(autosave, 'saving')
    const saved = vi.spyOn(autosave, 'saved')
    const save = vi.fn(async () => ({ ok: true as const }))
    const saver = createFieldSaver<string>(save, { delay: 600 })
    saver.change('C')
    saver.change('Ca')
    saver.change('Car')
    await vi.advanceTimersByTimeAsync(599)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('Car')
    expect(saving).toHaveBeenCalled()
    expect(saved).toHaveBeenCalled()
  })

  it('une frappe pendant l’envoi repart juste après ; flush envoie tout de suite', async () => {
    let release: () => void = () => {}
    const save = vi.fn(
      (value: string) =>
        new Promise<{ ok: true }>((resolve) => {
          if (value === 'a') release = () => resolve({ ok: true })
          else resolve({ ok: true })
        }),
    )
    const saver = createFieldSaver<string>(save, { delay: 0 })
    saver.change('a')
    const first = saver.flush()
    await Promise.resolve()
    saver.change('ab')
    const second = saver.flush()
    release()
    await first
    await second
    expect(save.mock.calls.map((c) => c[0])).toEqual(['a', 'ab'])
  })

  it('erreur du serveur remontée ; cancel abandonne la valeur en attente', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const failed = vi.spyOn(autosave, 'failed')
    const save = vi.fn(async () => ({ ok: false as const, error: 'Title must be 90 characters or fewer.' }))
    const saver = createFieldSaver<string>(save, { delay: 100, onError })
    saver.change('x')
    await vi.advanceTimersByTimeAsync(100)
    expect(onError).toHaveBeenLastCalledWith('Title must be 90 characters or fewer.')
    expect(failed).toHaveBeenCalledWith('Title must be 90 characters or fewer.')
    saver.change('y')
    saver.cancel()
    await vi.advanceTimersByTimeAsync(500)
    expect(save).toHaveBeenCalledTimes(1)
  })
})

describe('glisser-déposer : calculs', () => {
  it('moveIndex, position cible, décalage des voisines', () => {
    expect(moveIndex(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(targetFromOffset(3, -90, 45, 9)).toBe(1)
    expect(targetFromOffset(0, -500, 45, 9)).toBe(0)
    expect(targetFromOffset(0, 5000, 45, 9)).toBe(8)
    // La ligne 3 monte en 1 : les lignes 1 et 2 descendent d'une hauteur.
    expect([0, 1, 2, 3, 4].map((i) => neighbourOffset(i, 3, 1, 45))).toEqual([0, 45, 45, 0, 0])
    expect([0, 1, 2, 3].map((i) => neighbourOffset(i, 0, 2, 45))).toEqual([0, -45, -45, 0])
  })
})

function ReorderHarness({ onDrop }: { onDrop: (id: string, from: number, to: number) => void }) {
  const items = ['First', 'Second', 'Third']
  const reorder = useReorder({ count: items.length, enabled: true, onDrop })
  const display = reorder.drag?.mode === 'keyboard' ? moveIndex(items, reorder.drag.from, reorder.drag.to) : items
  return (
    <div>
      {display.map((item, index) => (
        <div key={item} data-row="">
          <button type="button" data-grip={item} aria-label={`Reorder ${item}`} {...reorder.gripProps(item, index, item)}>
            ⠿
          </button>
        </div>
      ))}
      <p role="status">{reorder.announcement}</p>
    </div>
  )
}

describe('useReorder au clavier', () => {
  it('Espace soulève, flèches déplacent, Espace dépose ; chaque étape est annoncée', () => {
    const onDrop = vi.fn()
    render(<ReorderHarness onDrop={onDrop} />)
    const grip = screen.getByLabelText('Reorder Third')
    grip.focus()
    fireEvent.keyDown(grip, { key: ' ' })
    expect(screen.getByRole('status').textContent).toContain('Third picked up. Position 3 of 3.')
    fireEvent.keyDown(screen.getByLabelText('Reorder Third'), { key: 'ArrowUp' })
    fireEvent.keyDown(screen.getByLabelText('Reorder Third'), { key: 'ArrowUp' })
    expect(screen.getByRole('status').textContent).toBe('Position 1 of 3.')
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Reorder Third', 'Reorder First', 'Reorder Second'])
    fireEvent.keyDown(screen.getByLabelText('Reorder Third'), { key: ' ' })
    expect(onDrop).toHaveBeenCalledWith('Third', 2, 0)
    expect(screen.getByRole('status').textContent).toBe('Third dropped at position 1 of 3.')
  })

  it('Échap annule sans écrire', () => {
    const onDrop = vi.fn()
    render(<ReorderHarness onDrop={onDrop} />)
    const grip = screen.getByLabelText('Reorder First')
    fireEvent.keyDown(grip, { key: 'Enter' })
    fireEvent.keyDown(screen.getByLabelText('Reorder First'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByLabelText('Reorder First'), { key: 'Escape' })
    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toContain('Reorder cancelled')
    expect(screen.getAllByRole('button')[0].getAttribute('aria-label')).toBe('Reorder First')
  })
})

function ToolsHarness({ onAdd = () => {} }: { onAdd?: () => void }) {
  const [search, setSearch] = useState('')
  const [conditions, setConditions] = useState<FilterCondition[]>([])
  const [sort, setSort] = useState({ by: 'updated' as 'updated' | 'title', direction: 'desc' as 'asc' | 'desc' })
  return (
    <div data-kz-admin="">
      <ListTools
        add={{ label: 'New post', onAdd }}
        sort={{ options: [{ value: 'updated', label: 'Last updated' }, { value: 'title', label: 'Title' }], directions: [{ value: 'desc', label: 'Newest first' }, { value: 'asc', label: 'Oldest first' }], value: sort, onChange: setSort }}
        filter={{ fields: [{ value: 'status', label: 'Status', options: [{ value: 'live', label: 'Live' }] }], conditions, onChange: setConditions }}
        search={{ value: search, onChange: setSearch, label: 'Search Blog' }}
      />
      <output data-testid="state">{JSON.stringify({ search, sort, n: conditions.length })}</output>
      <button type="button" onClick={() => setConditions([{ id: 'x', field: 'status', operator: 'is', value: 'live' }])}>
        Apply filter
      </button>
    </div>
  )
}

describe('ListTools (G5)', () => {
  it('+ appelle onAdd ; ⌕ devient un champ, Échap vide et referme', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<ToolsHarness onAdd={onAdd} />)
    await user.click(screen.getByRole('button', { name: 'New post' }))
    expect(onAdd).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Search' }))
    const field = screen.getByRole('searchbox', { name: 'Search Blog' })
    expect(document.activeElement).toBe(field)
    await user.type(field, 'carrier')
    expect(screen.getByTestId('state').textContent).toContain('"search":"carrier"')
    await user.keyboard('{Escape}')
    expect(screen.getByTestId('state').textContent).toContain('"search":""')
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy()
  })

  it('tri : un seul critère coché ; le filtre actif est signalé sur l’icône', async () => {
    const user = userEvent.setup()
    render(<ToolsHarness />)
    await user.click(screen.getByRole('button', { name: 'Sort' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Title' }))
    expect(screen.getByTestId('state').textContent).toContain('"by":"title"')
    expect((screen.getByRole('menuitemradio', { name: 'Title' })).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByRole('menuitemradio', { name: 'Last updated' })).getAttribute('aria-checked')).toBe('false')
    await user.keyboard('{Escape}')
    await act(async () => {
      screen.getByRole('button', { name: 'Apply filter' }).click()
    })
    expect((screen.getByRole('button', { name: 'Filter (1 active)' })).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('RichTextField', () => {
  const value = [
    { _type: 'block', _key: 'b1', style: 'h2', markDefs: [], children: [{ _type: 'span', _key: 's1', text: 'Why portals fail', marks: [] }] },
    { _type: 'block', _key: 'b2', style: 'normal', markDefs: [], children: [{ _type: 'span', _key: 's2', text: 'Carrier portals only work if carriers use them.', marks: [] }] },
  ]

  it('outils du Figma pour le corps d’article, en barre d’outils nommée ; valeur affichée', async () => {
    render(<RichTextField label="Body" initialValue={value} config={DEFAULT_RICH_TEXT} onChange={() => {}} />)
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    const names = Array.from(toolbar.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['Heading 2', 'Heading 3', 'Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Link'])
    // Un seul arrêt de tabulation (barre d'outils APG).
    expect(Array.from(toolbar.querySelectorAll('button')).filter((b) => b.tabIndex === 0)).toHaveLength(1)
    // Lien désactivé sans sélection.
    expect((screen.getByRole('button', { name: 'Link' })).getAttribute('aria-disabled')).toBe('true')
    expect((await screen.findByText('Why portals fail')).closest('h2')).toBeTruthy()
    expect(screen.getByText('Body').id).toBeTruthy()
  })

  it('FAQ : seulement gras, italique et lien', () => {
    render(<RichTextField label="Answer" initialValue={[]} config={richTextConfigFor('faq', 'answer')} onChange={() => {}} />)
    const names = Array.from(screen.getByRole('toolbar').querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['Bold', 'Italic', 'Link'])
  })

  it('flèches dans la barre d’outils', async () => {
    const user = userEvent.setup()
    render(<RichTextField label="Body" initialValue={value} config={DEFAULT_RICH_TEXT} onChange={() => {}} />)
    const first = screen.getByRole('button', { name: 'Heading 2' })
    first.focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Heading 3' }))
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Link' }))
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(first)
  })

  it('erreur annoncée et liée au champ', () => {
    render(<RichTextField label="Body" initialValue={[]} config={DEFAULT_RICH_TEXT} onChange={() => {}} error="Body is required." id="body" />)
    expect(screen.getByRole('alert').textContent).toBe('Body is required.')
    expect(document.getElementById('body')?.getAttribute('aria-describedby')).toBe('body-message')
  })
})
