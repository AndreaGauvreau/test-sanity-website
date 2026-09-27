/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import adminConfig from '@/admin.config'

import { ScriptDialog, type ScriptDialogProps } from './ScriptDialog'
import { DEFAULT_SCRIPT, pageOptions } from './scripts'

/** Script dialog (G6) en jsdom : validation, champs d'une page article (Insert field, « {{ »), erreurs du serveur. */

const PAGES = pageOptions(adminConfig, { blog: 12 })

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

function setup(props: Partial<ScriptDialogProps> = {}) {
  const onSave = vi.fn<ScriptDialogProps['onSave']>(async () => undefined)
  const onClose = vi.fn()
  render(
    <div data-kz-admin="">
      <ScriptDialog open mode="new" initial={DEFAULT_SCRIPT} pages={PAGES} onSave={onSave} onClose={onClose} {...props} />
    </div>,
  )
  return { onSave, onClose, user: userEvent.setup() }
}

/** Le focus initial de la fenêtre arrive à la frame suivante : l'attendre avant d'interagir. */
const ready = () => waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Name')))

const code = () => screen.getByLabelText('Code', { selector: 'textarea' }) as HTMLTextAreaElement

describe('ScriptDialog', () => {
  it('fenêtre nommée, focus sur Name, astuce par défaut', async () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'New Script' })
    expect(dialog).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Name')))
    expect(dialog.textContent).toContain('tags in “End of <body>” for faster page loading.')
    expect(screen.queryByRole('button', { name: 'Insert field' })).toBeNull()
  })

  it('refuse d’enregistrer sans nom ni code, avec les messages sous les champs', async () => {
    const { onSave, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Name is required.')).toBeTruthy()
    expect(screen.getByText('Code is required.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Name'))
  })

  it('enregistre les valeurs (nom rogné) et avertit d’une balise non fermée sans bloquer', async () => {
    const { onSave, user } = setup()
    await ready()
    await user.type(screen.getByLabelText('Name'), '  Hotjar  ')
    await user.click(code())
    await user.paste('<script>hj(')
    expect(screen.getByText(/isn’t closed/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ name: 'Hotjar', placement: 'bodyEnd', page: 'all', run: 'once', code: '<script>hj(' })
  })

  it('page article : Insert field insère {{champ}} au curseur', async () => {
    const { user } = setup({ mode: 'edit', initial: { ...DEFAULT_SCRIPT, name: 'JSON-LD', page: 'blog/slug', code: '<script>"x"</script>' } })
    expect(screen.getByRole('dialog', { name: 'Edit Script' }).textContent).toContain('Blog article page: type {{ or use “Insert field”')
    await ready()
    const textarea = code()
    textarea.focus()
    textarea.setSelectionRange(9, 9)
    await user.click(screen.getByRole('button', { name: 'Insert field' }))
    const menu = await screen.findByRole('menu', { name: 'Blog fields' })
    expect(menu.textContent).toContain('{{category}}')
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Excerpt/ }))
    expect(code().value).toBe('<script>"{{excerpt}}x"</script>')
    await waitFor(() => expect(document.activeElement).toBe(code()))
  })

  it('page article : taper {{ ouvre la liste et le champ remplace les accolades', async () => {
    const { user } = setup({ initial: { ...DEFAULT_SCRIPT, name: 'JSON-LD', page: 'blog/slug', code: '' } })
    await ready()
    await user.click(code())
    await user.keyboard('<script>{{{{')
    const menu = await screen.findByRole('menu', { name: 'Blog fields' })
    // Focus initial posé par le Menu du kit (ouverture sans clic), sans contournement dans la fenêtre (FOLLOWUPS #40).
    await waitFor(() => expect(document.activeElement).toBe(menu.querySelector('[role^="menuitem"]')))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Title/ }))
    expect(code().value).toBe('<script>{{title}}')
  })

  it('champ inconnu sur une page article : avertissement', async () => {
    setup({ initial: { ...DEFAULT_SCRIPT, name: 'x', page: 'blog/slug', code: '<script>"{{price}}"</script>' } })
    expect(screen.getByText('{{price}} isn’t a field of Blog: left as written.')).toBeTruthy()
  })

  it('affiche l’erreur du serveur et garde la fenêtre ouverte', async () => {
    const { user, onSave } = setup({ initial: { ...DEFAULT_SCRIPT, name: 'x', code: '<style></style>' } })
    onSave.mockResolvedValueOnce({ error: "You don't have access to this." })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toContain("You don't have access to this.")
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('Échap et Cancel ferment', async () => {
    const { user, onClose } = setup()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
