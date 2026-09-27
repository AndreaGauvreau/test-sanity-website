/** @vitest-environment jsdom */
import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Popover } from './Popover'

afterEach(cleanup)

function Demo({ onClose = () => {}, nested = false }: { onClose?: (r: string) => void; nested?: boolean }) {
  const anchor = useRef<HTMLButtonElement | null>(null)
  const inner = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(true)
  const [innerOpen, setInnerOpen] = useState(nested)
  return (
    <div data-kz-admin="">
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)}>
        Anchor
      </button>
      <span>Outside</span>
      <Popover
        open={open}
        anchorRef={anchor}
        role="dialog"
        aria-label="Panel"
        initialFocus="first"
        onClose={(r) => {
          onClose(r)
          setOpen(false)
        }}
      >
        <button ref={inner} type="button">
          Inside
        </button>
        <Popover open={innerOpen} anchorRef={inner} role="dialog" aria-label="Inner" onClose={() => setInnerOpen(false)}>
          <span>Nested</span>
        </Popover>
      </Popover>
    </div>
  )
}

describe('Popover', () => {
  it('portail dans [data-kz-admin], focus sur le premier élément, Échap ferme et rend le focus à l\'ancre', async () => {
    const onClose = vi.fn()
    render(<Demo onClose={onClose} />)
    const panel = await screen.findByRole('dialog', { name: 'Panel' })
    expect(panel.closest('[data-kz-admin]')).not.toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' })))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledWith('escape')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Anchor' })))
  })

  it('clic extérieur ferme ; clic sur l\'ancre ou dedans non', async () => {
    const onClose = vi.fn()
    render(<Demo onClose={onClose} />)
    await screen.findByRole('dialog', { name: 'Panel' })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Anchor' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByText('Outside'))
    expect(onClose).toHaveBeenCalledWith('outside')
  })

  it('Échap ne ferme que la couche du dessus', async () => {
    const onClose = vi.fn()
    render(<Demo onClose={onClose} nested />)
    await screen.findByRole('dialog', { name: 'Inner' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Inner' })).toBeNull())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledWith('escape')
  })
})
