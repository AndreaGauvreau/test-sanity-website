/** @vitest-environment jsdom */
import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Drawer, type DrawerCloseReason } from './Drawer'

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

function Demo({ onClose }: { onClose?: (r: DrawerCloseReason) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-kz-admin="">
      <button type="button" onClick={() => setOpen(true)}>
        Open post
      </button>
      <Drawer
        open={open}
        onClose={(reason) => {
          onClose?.(reason)
          setOpen(false)
        }}
        title="Carrier portals: a checklist"
        status={<span>Changed</span>}
        footer={<p>Need another field?</p>}
      >
        <input aria-label="Title" defaultValue="Carrier portals" />
        <input aria-label="Slug" defaultValue="carrier-portals" />
      </Drawer>
    </div>
  )
}

describe('Drawer', () => {
  it('panneau modal nommé par son titre, largeur 810 par défaut, focus sur le premier champ', async () => {
    render(<Demo />)
    await userEvent.click(screen.getByRole('button', { name: 'Open post' }))
    const dialog = await screen.findByRole('dialog', { name: 'Carrier portals: a checklist' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.style.width).toBe('810px')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Title' })))
  })

  it('Échap ferme et rend le focus ; Tab boucle', async () => {
    const onClose = vi.fn()
    render(<Demo onClose={onClose} />)
    const trigger = screen.getByRole('button', { name: 'Open post' })
    await userEvent.click(trigger)
    await screen.findByRole('dialog')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Title' })))
    const slug = screen.getByRole('textbox', { name: 'Slug' })
    slug.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledWith('escape')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('clic sur le voile ferme', async () => {
    const onClose = vi.fn()
    render(<Demo onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open post' }))
    await screen.findByRole('dialog')
    await userEvent.click(document.querySelector('[data-position="fixed"]') as HTMLElement)
    expect(onClose).toHaveBeenCalledWith('scrim')
  })
})
