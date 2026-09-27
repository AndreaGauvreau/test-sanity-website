/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { autosave } from '@/admin/core/autosave'

// Les vraies server actions ne sont jamais chargées : le formulaire reçoit de fausses actions.
vi.mock('./actions', () => ({
  saveGeneralValueAction: vi.fn(),
  removeGeneralImageAction: vi.fn(),
}))

const { GeneralForm } = await import('./GeneralForm')
import type { GeneralView } from './view'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const LIGHT = { ref: 'image-a-64x64-png', url: 'https://cdn.sanity.io/images/p/d/a-64x64.png', width: 64, height: 64 }
const SOCIAL = { ref: 'image-s-1200x630-jpg', url: 'https://cdn.sanity.io/images/p/d/s-1200x630.jpg', width: 1200, height: 630 }

function view(patch: Partial<GeneralView['values']> = {}): GeneralView {
  return {
    values: {
      title: 'Conduit — Dock Scheduling',
      description: 'Schedule dock appointments, cut wait times and keep carriers in the loop — in one place.',
      allowIndexing: true,
      faviconLight: LIGHT,
      faviconDark: null,
      socialImage: SOCIAL,
      ...patch,
    },
    missing: false,
    hasDraft: false,
    site: { name: 'Conduit', domain: 'conduit.com', url: 'https://conduit.com' },
  }
}

function setup(canEdit = true, v = view()) {
  const actions = {
    save: vi.fn(async (_input: unknown) => ({ ok: true as const })),
    upload: vi.fn(async (_form: FormData) => ({ ok: true as const, image: { ...LIGHT, ref: 'image-b-64x64-png', url: 'https://cdn.sanity.io/images/p/d/b-64x64.png' } })),
    remove: vi.fn(async (_input: unknown) => ({ ok: true as const })),
  }
  const utils = render(<GeneralForm view={v} canEdit={canEdit} actions={actions} />)
  return { actions, ...utils }
}

describe('GeneralForm (B2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  it('affiche les valeurs, les compteurs et les aperçus du Figma', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: /General/ })).toBeTruthy()
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Conduit — Dock Scheduling')
    expect(screen.getByText('25 / 60')).toBeTruthy()
    expect(screen.getByText('88 / 160')).toBeTruthy()
    expect(screen.getByLabelText('Google search result preview').textContent).toContain('https://conduit.com')
    expect(screen.getByLabelText('Social card preview').textContent).toContain('Schedule dock appointments, cut wait times…')
    expect(screen.getByRole('switch', { name: 'Search engines' }).getAttribute('aria-checked')).toBe('true')
    // Favicon sombre absent : le clair sert partout.
    expect(screen.getByText('No dark favicon: the light one is used everywhere.')).toBeTruthy()
  })

  it('enregistre en brouillon 600 ms après la dernière frappe (autosave de la Top bar)', async () => {
    const { actions } = setup()
    const states: string[] = []
    const unsubscribe = autosave.subscribe(() => states.push(autosave.get().status))
    const input = screen.getByLabelText('Title')
    fireEvent.change(input, { target: { value: 'Conduit' } })
    fireEvent.change(input, { target: { value: 'Conduit — Docks' } })
    // L'aperçu suit la frappe tout de suite.
    expect(screen.getByLabelText('Google search result preview').textContent).toContain('Conduit — Docks')
    await act(async () => {
      vi.advanceTimersByTime(599)
    })
    expect(actions.save).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(actions.save).toHaveBeenCalledExactlyOnceWith({ field: 'title', value: 'Conduit — Docks' })
    await waitFor(() => expect(states).toEqual(['saving', 'saved']))
    unsubscribe()
  })

  it('au-delà de 60 caractères : compteur d’avertissement, saisie libre, rien n’est envoyé', async () => {
    const { actions } = setup()
    const input = screen.getByLabelText('Title')
    fireEvent.change(input, { target: { value: 'x'.repeat(65) } })
    expect((input as HTMLInputElement).value).toHaveLength(65)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('65').className).toMatch(/over/)
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(actions.save).not.toHaveBeenCalled()
  })

  it('titre vidé : erreur « Title is required. », rien n’est envoyé', async () => {
    const { actions } = setup()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } })
    expect(screen.getByText('Title is required.')).toBeTruthy()
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(actions.save).not.toHaveBeenCalled()
  })

  it('refus du serveur : message sous le champ et état d’erreur de l’autosave', async () => {
    const { actions } = setup()
    actions.save.mockResolvedValueOnce({ ok: false, error: 'Sanity write access is not configured (SANITY_API_WRITE_TOKEN is missing).' } as never)
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New description' } })
    fireEvent.blur(screen.getByLabelText('Description'))
    expect(actions.save).toHaveBeenCalledWith({ field: 'description', value: 'New description' })
    await waitFor(() => expect(screen.getByText(/SANITY_API_WRITE_TOKEN is missing/)).toBeTruthy())
    expect(autosave.get().status).toBe('error')
  })

  it('indexation : envoi immédiat ; retour arrière si refusé', async () => {
    const { actions } = setup()
    const sw = screen.getByRole('switch', { name: 'Search engines' })
    fireEvent.click(sw)
    expect(actions.save).toHaveBeenCalledWith({ field: 'allowIndexing', value: false })
    await waitFor(() => expect(screen.getByText(/won’t index any page/)).toBeTruthy())
    actions.save.mockResolvedValueOnce({ ok: false, error: "You don't have access to this." } as never)
    fireEvent.click(sw)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("You don't have access to this."))
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('favicon : envoi du fichier (FormData slot + file) puis aperçu mis à jour', async () => {
    const { actions, container } = setup()
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]')
    const file = new File([new Uint8Array([0x89, 0x50])], 'dark.png', { type: 'image/png' })
    fireEvent.change(inputs[1], { target: { files: [file] } })
    await waitFor(() => expect(actions.upload).toHaveBeenCalled())
    const form = actions.upload.mock.calls[0][0]
    expect(form.get('slot')).toBe('faviconDark')
    expect((form.get('file') as File).name).toBe('dark.png')
    await waitFor(() => expect(screen.queryByText('No dark favicon: the light one is used everywhere.')).toBeNull())
  })

  it('fichier de plus de 5 Mo : refusé sans appel', async () => {
    const { actions, container } = setup()
    const input = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[2]
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [big] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/larger than 5 MB/))
    expect(actions.upload).not.toHaveBeenCalled()
  })

  it('pastille × : retire l’image ; la remet si le serveur refuse', async () => {
    const { actions } = setup()
    actions.remove.mockResolvedValueOnce({ ok: false, error: 'Sanity isn’t responding.' } as never)
    fireEvent.click(screen.getByRole('button', { name: 'Remove social preview image' }))
    expect(actions.remove).toHaveBeenCalledWith({ slot: 'socialImage' })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Sanity isn’t responding.'))
    expect(screen.getByRole('button', { name: 'Remove social preview image' })).toBeTruthy()
  })

  it('lecture seule sans content.write', () => {
    setup(false)
    expect(screen.getByText('You can view these settings but not change them.')).toBeTruthy()
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
  })
})
