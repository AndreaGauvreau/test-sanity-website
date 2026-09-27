/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolLink, ToolLinks } from './ToolLink'

afterEach(cleanup)

describe('ToolLinks / ToolLink', () => {
  it('groupe nommé ; bouton, lien de téléchargement, action danger désactivée mais focalisable', async () => {
    const onReplace = vi.fn()
    const onDelete = vi.fn()
    render(
      <ToolLinks aria-label="File actions">
        <ToolLink icon="replace" label="Replace" onClick={onReplace} />
        <ToolLink icon="download" label="Download" href="/file.jpg" download />
        <ToolLink icon="trash" label="Delete" tone="danger" disabled disabledReason="Used in 2 places" onClick={onDelete} />
      </ToolLinks>,
    )
    expect(screen.getByRole('group', { name: 'File actions' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }))
    expect(onReplace).toHaveBeenCalledTimes(1)
    const link = screen.getByRole('link', { name: 'Download' })
    expect(link.getAttribute('href')).toBe('/file.jpg')
    expect(link.hasAttribute('download')).toBe(true)
    const del = screen.getByRole('button', { name: 'Delete' })
    expect(del.getAttribute('aria-disabled')).toBe('true')
    expect(del.getAttribute('data-tone')).toBe('danger')
    await userEvent.click(del)
    expect(onDelete).not.toHaveBeenCalled()
    ;(document.activeElement as HTMLElement | null)?.blur()
    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()
    expect(document.activeElement).toBe(del)
  })
})
