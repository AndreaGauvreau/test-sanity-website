/** @vitest-environment jsdom */
import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Select } from '../Select'
import { Modal, type ModalCloseReason } from './Modal'

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

function Demo({ onClose, destructive, withSelect }: { onClose?: (r: ModalCloseReason) => void; destructive?: boolean; withSelect?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-kz-admin="">
      <button type="button" onClick={() => setOpen(true)}>
        Edit script
      </button>
      <Modal
        open={open}
        onClose={(reason) => {
          onClose?.(reason)
          setOpen(false)
        }}
        title="Edit script"
        description="Scripts run on the published site."
        tone={destructive ? 'destructive' : 'default'}
        confirmLabel={destructive ? 'Delete' : 'Save'}
        onConfirm={() => setOpen(false)}
      >
        <input aria-label="Name" />
        {withSelect ? <Select label="Placement" options={[{ value: 'a', label: 'Head' }, { value: 'b', label: 'Body' }]} /> : null}
      </Modal>
    </div>
  )
}

async function openModal(props: Parameters<typeof Demo>[0] = {}) {
  render(<Demo {...props} />)
  const trigger = screen.getByRole('button', { name: 'Edit script' })
  await userEvent.click(trigger)
  const dialog = await screen.findByRole(props.destructive ? 'alertdialog' : 'dialog')
  return { trigger, dialog }
}

describe('Modal', () => {
  it('dialog modal nommé et décrit, focus initial sur le premier champ', async () => {
    const { dialog } = await openModal()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog).toHaveProperty('textContent')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Edit script')
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toContain('Scripts run')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' })))
  })

  it('Échap ferme et rend le focus au déclencheur', async () => {
    const onClose = vi.fn()
    const { trigger } = await openModal({ onClose })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' })))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledWith('escape')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('piège du focus : Tab et Maj+Tab bouclent dans la fenêtre', async () => {
    await openModal()
    const input = screen.getByRole('textbox', { name: 'Name' })
    await waitFor(() => expect(document.activeElement).toBe(input))
    const close = screen.getByRole('button', { name: 'Close' })
    const save = screen.getByRole('button', { name: 'Save' })
    save.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(close)
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(save)
  })

  it('clic sur le voile et sur ✕ ; Cancel', async () => {
    const onClose = vi.fn()
    await openModal({ onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenLastCalledWith('close')
    await userEvent.click(screen.getByRole('button', { name: 'Edit script' }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenLastCalledWith('cancel')
    await userEvent.click(screen.getByRole('button', { name: 'Edit script' }))
    await screen.findByRole('dialog')
    const scrim = document.querySelector('[aria-hidden="true"][data-position="fixed"]') as HTMLElement
    await userEvent.click(scrim)
    expect(onClose).toHaveBeenLastCalledWith('scrim')
  })

  it('destructive : alertdialog et bouton danger', async () => {
    await openModal({ destructive: true })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('Échap ferme d’abord la liste d’un Select ouvert dans la fenêtre', async () => {
    const onClose = vi.fn()
    await openModal({ onClose, withSelect: true })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' })))
    const combo = screen.getByRole('combobox', { name: /Placement/ })
    combo.focus()
    await userEvent.keyboard('{ArrowDown}')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
