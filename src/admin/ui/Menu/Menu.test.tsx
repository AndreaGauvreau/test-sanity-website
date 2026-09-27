/** @vitest-environment jsdom */
import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Menu, MenuGroup, MenuItem, MenuSeparator } from './Menu'

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

function setup(onSelect = vi.fn()) {
  render(
    <div data-kz-admin="">
      <Menu trigger={<button type="button">Sort</button>}>
        <MenuGroup label="Sort by">
          <MenuItem selected onSelect={() => onSelect('date')}>
            Date added
          </MenuItem>
          <MenuItem selected={false} onSelect={() => onSelect('name')}>
            Name
          </MenuItem>
          <MenuItem selected={false} disabled onSelect={() => onSelect('size')}>
            File size
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem danger onSelect={() => onSelect('delete')}>
          Delete
        </MenuItem>
      </Menu>
      <button type="button">After</button>
    </div>,
  )
  return { trigger: screen.getByRole('button', { name: 'Sort' }), onSelect }
}

const focusedText = () => document.activeElement?.textContent

describe('Menu', () => {
  it('bouton de menu : aria-haspopup, aria-expanded, menu nommé par le déclencheur', async () => {
    const { trigger } = setup()
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(trigger)
    const menu = await screen.findByRole('menu', { name: 'Sort' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id)
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
    expect(screen.getByRole('menuitemradio', { name: 'Date added' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('group', { name: 'Sort by' })).toBeTruthy()
  })

  it('clavier : ↓ ouvre sur le premier, flèches en boucle (désactivé sauté), Home / End, lettre', async () => {
    const { trigger } = setup()
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}')
    await screen.findByRole('menu')
    await waitFor(() => expect(focusedText()).toBe('Date added'))
    await userEvent.keyboard('{ArrowDown}')
    expect(focusedText()).toBe('Name')
    await userEvent.keyboard('{ArrowDown}')
    expect(focusedText()).toBe('Delete')
    await userEvent.keyboard('{ArrowDown}')
    expect(focusedText()).toBe('Date added')
    await userEvent.keyboard('{End}')
    expect(focusedText()).toBe('Delete')
    await userEvent.keyboard('{Home}')
    expect(focusedText()).toBe('Date added')
    await userEvent.keyboard('n')
    expect(focusedText()).toBe('Name')
    // Roving tabindex : seul l'élément actif est à 0.
    const items = [...screen.getAllByRole('menuitemradio'), screen.getByRole('menuitem')]
    expect(items.filter((el) => el.tabIndex === 0).map((el) => el.textContent)).toEqual(['Name'])
  })

  it('↑ ouvre sur le dernier ; Entrée choisit, ferme et rend le focus', async () => {
    const { trigger, onSelect } = setup()
    trigger.focus()
    await userEvent.keyboard('{ArrowUp}')
    await screen.findByRole('menu')
    await waitFor(() => expect(focusedText()).toBe('Delete'))
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('delete')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('Échap et Tab referment et rendent le focus au déclencheur', async () => {
    const { trigger } = setup()
    await userEvent.click(trigger)
    await screen.findByRole('menu')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(document.activeElement).toBe(trigger)
    await userEvent.click(trigger)
    await screen.findByRole('menu')
    await userEvent.tab()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('élément désactivé : clic sans effet ; clic sur un élément : action', async () => {
    const { trigger, onSelect } = setup()
    await userEvent.click(trigger)
    await screen.findByRole('menu')
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'File size' }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeTruthy()
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Name' }))
    expect(onSelect).toHaveBeenCalledWith('name')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('ouvert sans clic (contrôlé) alors que le panneau est encore masqué : le focus va au premier élément dès qu’il est visible', async () => {
    // Le navigateur refuse le focus d'un élément sous `visibility: hidden` (Popover pas encore positionné) :
    // jsdom ne le fait pas, on le simule.
    const realFocus = HTMLElement.prototype.focus
    const spy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      const surface = this.closest<HTMLElement>('[data-kz-popover]')
      if (surface && surface.style.visibility === 'hidden') return
      realFocus.call(this, options)
    })
    try {
      function Controlled() {
        const [open, setOpen] = useState(false)
        return (
          <div data-kz-admin="">
            <textarea aria-label="Code" onChange={(event) => setOpen(event.target.value.endsWith('{{'))} />
            <Menu open={open} onOpenChange={setOpen} aria-label="Fields" trigger={<button type="button">Insert field</button>}>
              <MenuItem>Title</MenuItem>
              <MenuItem>Slug</MenuItem>
            </Menu>
          </div>
        )
      }
      render(<Controlled />)
      await userEvent.type(screen.getByRole('textbox', { name: 'Code' }), '{{{{')
      await screen.findByRole('menu', { name: 'Fields' })
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Title' })))
    } finally {
      spy.mockRestore()
    }
  })
})
