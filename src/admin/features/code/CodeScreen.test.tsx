/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { autosave } from '@/admin/core/autosave'
import { ToastProvider } from '@/admin/ui'
import adminConfig from '@/admin.config'

import { pageOptions, type ScriptItem } from './scripts'

/** Écran B3 en jsdom avec des server actions simulées : tableau, état vide, Edit, activation, suppression confirmée. */

const actions = vi.hoisted(() => ({
  saveScriptAction: vi.fn(),
  setScriptEnabledAction: vi.fn(),
  deleteScriptAction: vi.fn(),
  moveScriptAction: vi.fn(),
}))
vi.mock('./actions', () => actions)

const { CodeScreen } = await import('./CodeScreen')

const PAGES = pageOptions(adminConfig, { blog: 12 })
const SCRIPTS: ScriptItem[] = [
  { key: 'css', name: 'CSS_base', placement: 'headEnd', page: 'all', run: 'once', code: '<style>img{}</style>', enabled: true },
  { key: 'hj', name: 'Hotjar', placement: 'bodyEnd', page: 'blog/slug', run: 'everyPageVisit', code: '<script>hj()</script>', enabled: false },
]

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true, key: 'x' })
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

function setup(scripts = SCRIPTS) {
  render(
    <div data-kz-admin="">
      <ToastProvider>
        <CodeScreen scripts={scripts} pages={PAGES} />
      </ToastProvider>
    </div>,
  )
  return userEvent.setup()
}

describe('CodeScreen', () => {
  it('tableau du Figma : Name · Placement · Type · Page · Status', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Code' })).toBeTruthy()
    const rows = within(screen.getByRole('table', { name: 'Scripts' })).getAllByRole('row')
    expect(rows[0].textContent).toBe('NamePlacementTypePageStatusActions')
    expect(rows[1].textContent).toBe('CSS_baseEnd of <head>CSSAll pagesActive')
    expect(rows[2].textContent).toBe('HotjarEnd of <body>JavaScript/blog/:slugDisabled')
  })

  it('état vide', async () => {
    const user = setup([])
    expect(screen.getByRole('heading', { name: 'No scripts yet' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add script' }))
    expect(await screen.findByRole('dialog', { name: 'New Script' })).toBeTruthy()
  })

  it('clic sur le nom = Edit, valeurs du script dans la fenêtre', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Hotjar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Script' })
    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe('Hotjar')
    expect(within(dialog).getByRole('button', { name: 'Insert field' })).toBeTruthy()
  })

  it('Enable depuis le menu ⋯ : server action + état de la Top bar', async () => {
    const user = setup()
    const spy = vi.spyOn(autosave, 'saved')
    await user.click(screen.getByRole('button', { name: 'Actions for Hotjar' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Enable' }))
    await waitFor(() => expect(actions.setScriptEnabledAction).toHaveBeenCalledWith({ key: 'hj', enabled: true }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(await screen.findByText('Script enabled. It runs when you publish.')).toBeTruthy()
  })

  it('Move up désactivé pour le premier script', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Actions for CSS_base' }))
    expect((await screen.findByRole('menuitem', { name: 'Move up' })).getAttribute('aria-disabled')).toBe('true')
  })

  it('Delete demande confirmation, puis appelle la server action', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Actions for CSS_base' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete this script?' })
    expect(actions.deleteScriptAction).not.toHaveBeenCalled()
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(actions.deleteScriptAction).toHaveBeenCalledWith({ key: 'css' }))
  })

  it('échec du serveur : toast d’erreur et état « failed » de la Top bar', async () => {
    actions.moveScriptAction.mockResolvedValue({ ok: false, error: "You don't have access to this." })
    const failed = vi.spyOn(autosave, 'failed')
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Actions for Hotjar' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Move up' }))
    expect(await screen.findByText("You don't have access to this.")).toBeTruthy()
    expect(failed).toHaveBeenCalledWith("You don't have access to this.")
  })
})
