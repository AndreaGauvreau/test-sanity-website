/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_AI_SETTINGS, type AiSettings, type AiSettingsState } from '@/admin/core/contracts/engine'
import { EngineClientError } from '@/admin/core/engine/client'

import { AI_SETTINGS_TEXT, AiSettingsCard, EFFORT_HELP, priceHint } from './AiSettingsCard'

/** Carte « AI settings » de B5 en jsdom, avec un FAUX client du moteur (aucun réseau, aucun Claude). */

const BASE: AiSettingsState = { current: { ...DEFAULT_AI_SETTINGS }, defaults: { ...DEFAULT_AI_SETTINGS }, source: 'default', askModel: 'claude-haiku-4-5' }

function fakeClient(initial: Partial<AiSettingsState> = {}, options: { saveError?: EngineClientError; loadError?: EngineClientError } = {}) {
  let state: AiSettingsState = { ...BASE, ...initial }
  const sent: AiSettings[] = []
  const claude = {
    settings: vi.fn(async () => {
      if (options.loadError) throw options.loadError
      return state
    }),
    saveSettings: vi.fn(async (input: AiSettings) => {
      sent.push(input)
      if (options.saveError) throw options.saveError
      state = { ...state, current: { ...input }, source: 'saved', updatedAt: '2026-09-28T10:00:00.000Z' }
      return state
    }),
  }
  return { client: { claude }, claude, sent }
}

afterEach(cleanup)

describe('AiSettingsCard', () => {
  it('rendu : modèle en cours avec son prix, effort, Ask AI non concerné, prochaine demande ; Save désactivé sans changement', async () => {
    const { client } = fakeClient()
    render(<AiSettingsCard client={client} />)
    const model = await screen.findByRole('combobox', { name: /Model/ })
    expect(model.textContent).toContain('Opus 5.5 · $4 / $20 per M tokens')
    expect(screen.getByText('Default')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Medium' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(EFFORT_HELP.medium)).toBeTruthy()
    expect(screen.getByText(/Ask AI isn’t affected: it always uses Haiku 4\.5\./)).toBeTruthy()
    expect(screen.getByText(AI_SETTINGS_TEXT.nextRequest)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('prix de la source unique (PRICES_PER_MTOK) pour les trois modèles', () => {
    expect([priceHint('claude-opus-5-5'), priceHint('claude-fable-5-1'), priceHint('claude-sonnet-5')]).toEqual(['$4 / $20', '$10 / $50', '$2 / $10'])
    expect(priceHint('claude-unknown')).toBeNull()
  })

  it('Save : envoie modèle et effort, puis « Saved » et la prochaine demande ; revenir à l’état enregistré redésactive Save', async () => {
    const { client, sent } = fakeClient()
    render(<AiSettingsCard client={client} />)
    await userEvent.click(await screen.findByRole('combobox', { name: /Model/ }))
    await userEvent.click(screen.getByRole('option', { name: /Fable 5\.1/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Extra high' }))
    expect(screen.getByText(EFFORT_HELP.xhigh)).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    await userEvent.click(save)
    expect(sent).toEqual([{ model: 'claude-fable-5-1', effort: 'xhigh' }])
    expect(await screen.findByText('Saved. The next AI editor request uses Fable 5.1 · Extra high.')).toBeTruthy()
    expect(screen.getByText('Saved')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    // Changer puis revenir : rien à enregistrer.
    await userEvent.click(screen.getByRole('radio', { name: 'Low' }))
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
    await userEvent.click(screen.getByRole('radio', { name: 'Extra high' }))
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('erreur à l’enregistrement : message lisible, choix gardé, Save de nouveau possible', async () => {
    const { client, claude } = fakeClient({}, { saveError: new EngineClientError(400, 'bad_request', 'Choose a thinking effort: low, medium, high, xhigh, max.') })
    render(<AiSettingsCard client={client} />)
    await screen.findByRole('combobox', { name: /Model/ })
    await userEvent.click(screen.getByRole('radio', { name: 'High' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Couldn’t save the AI settings. Choose a thinking effort: low, medium, high, xhigh, max.')
    expect(screen.getByRole('radio', { name: 'High' }).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
    expect(claude.saveSettings).toHaveBeenCalledTimes(1)
  })

  it('moteur injoignable : Callout d’erreur + Retry', async () => {
    const { client, claude } = fakeClient({}, { loadError: new EngineClientError(502, 'unavailable', 'The AI engine isn’t reachable.') })
    render(<AiSettingsCard client={client} />)
    expect((await screen.findByRole('alert')).textContent).toContain(AI_SETTINGS_TEXT.unreachable)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(claude.settings).toHaveBeenCalledTimes(2))
  })

  it('modèle par défaut hors liste (EDITOR_MODEL) : affiché, Save exige un modèle de la liste', async () => {
    const { client } = fakeClient({ current: { model: 'claude-opus-5', effort: 'high' }, defaults: { model: 'claude-opus-5', effort: 'high' } })
    render(<AiSettingsCard client={client} />)
    expect((await screen.findByRole('combobox', { name: /Model/ })).textContent).toContain('claude-opus-5 (engine default)')
    expect(screen.getByText(AI_SETTINGS_TEXT.chooseModel)).toBeTruthy()
    await userEvent.click(screen.getByRole('radio', { name: 'Low' }))
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
