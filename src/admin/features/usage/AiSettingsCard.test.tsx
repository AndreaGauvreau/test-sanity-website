/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_AI_SETTINGS, type AiSettings, type AiSettingsState } from '@/admin/core/contracts/engine'
import { EngineClientError } from '@/admin/core/engine/client'

import { AI_SETTINGS_TEXT, AiSettingsCard, EFFORT_HELP, noEffortHelp, priceHint, settingsLabel } from './AiSettingsCard'

/** Carte « AI settings » de B5 en jsdom, avec un FAUX client du moteur (aucun réseau, aucun Claude). */

const BASE: AiSettingsState = { current: { ...DEFAULT_AI_SETTINGS }, defaults: { ...DEFAULT_AI_SETTINGS }, source: 'default' }

const effortRadios = () => screen.getAllByRole('radio') as HTMLButtonElement[]

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
  it('rendu : modèle en cours avec son prix et sa phrase, effort, « Used by the AI editor and Ask AI », prochaine demande ; Save désactivé sans changement', async () => {
    const { client } = fakeClient()
    render(<AiSettingsCard client={client} />)
    const model = await screen.findByRole('combobox', { name: /Model/ })
    expect(model.textContent).toContain('Opus 5.5 · $4 / $20 per M tokens')
    expect(screen.getByText(`Recommended for most changes and questions. ${AI_SETTINGS_TEXT.modelHelp}`)).toBeTruthy()
    expect(screen.getByText('AI editor · Ask AI')).toBeTruthy()
    expect(screen.getByText('Default')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Medium' }).getAttribute('aria-checked')).toBe('true')
    expect(effortRadios().every((radio) => !radio.disabled)).toBe(true)
    expect(screen.getByText(EFFORT_HELP.medium)).toBeTruthy()
    expect(screen.getByText('Used by the AI editor and Ask AI. Engine default: Opus 5.5 · Medium.')).toBeTruthy()
    expect(screen.queryByText(/isn’t affected/)).toBeNull()
    expect(screen.getByText('Changes apply to the next AI editor request and the next Ask AI question. A request already running keeps its settings.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('prix de la source unique (PRICES_PER_MTOK) pour les quatre modèles, Haiku 4.5 compris ; libellé sans effort pour Haiku', () => {
    expect([priceHint('claude-opus-5-5'), priceHint('claude-fable-5-1'), priceHint('claude-sonnet-5'), priceHint('claude-haiku-4-5')]).toEqual([
      '$4 / $20',
      '$10 / $50',
      '$2 / $10',
      '$1 / $5',
    ])
    expect(priceHint('claude-unknown')).toBeNull()
    expect(settingsLabel({ model: 'claude-sonnet-5', effort: 'xhigh' })).toBe('Sonnet 5 · Extra high')
    expect(settingsLabel({ model: 'claude-haiku-4-5', effort: 'xhigh' })).toBe('Haiku 4.5')
  })

  it('menu Model : quatre modèles avec leur prix, Haiku 4.5 compris', async () => {
    const { client } = fakeClient()
    render(<AiSettingsCard client={client} />)
    await userEvent.click(await screen.findByRole('combobox', { name: /Model/ }))
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toHaveLength(4)
    expect(options[3]).toContain('Haiku 4.5')
    expect(options[3]).toContain('$1 / $5')
  })

  it('Haiku 4.5 : « Thinking effort » désactivé et expliqué, niveau gardé et envoyé tel quel ; un autre modèle le réactive', async () => {
    const { client, sent } = fakeClient({ current: { model: 'claude-opus-5-5', effort: 'high' } })
    render(<AiSettingsCard client={client} />)
    await userEvent.click(await screen.findByRole('combobox', { name: /Model/ }))
    await userEvent.click(screen.getByRole('option', { name: /Haiku 4\.5/ }))
    expect(screen.getByRole('combobox', { name: /Model/ }).textContent).toContain('Haiku 4.5 · $1 / $5 per M tokens')
    expect(screen.getByText(`Fastest and cheapest. For simple changes and questions. ${AI_SETTINGS_TEXT.modelHelp}`)).toBeTruthy()
    // Niveau visible (gardé) mais désactivé, avec une ligne qui l'explique à la place de l'aide du niveau.
    expect(effortRadios().every((radio) => radio.disabled)).toBe(true)
    expect(screen.getByRole('radio', { name: 'High' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(noEffortHelp('claude-haiku-4-5'))).toBeTruthy()
    expect(noEffortHelp('claude-haiku-4-5')).toBe('Haiku 4.5 doesn’t use a thinking effort. The level stays saved for the other models.')
    expect(screen.queryByText(EFFORT_HELP.high)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(sent).toEqual([{ model: 'claude-haiku-4-5', effort: 'high' }])
    expect(await screen.findByText('Saved. The next AI editor request and Ask AI question use Haiku 4.5.')).toBeTruthy()
    // Retour à Sonnet 5 : niveau réactivé, toujours « High ».
    await userEvent.click(screen.getByRole('combobox', { name: /Model/ }))
    await userEvent.click(screen.getByRole('option', { name: /Sonnet 5/ }))
    expect(effortRadios().every((radio) => !radio.disabled)).toBe(true)
    expect(screen.getByRole('radio', { name: 'High' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(EFFORT_HELP.high)).toBeTruthy()
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
    expect(await screen.findByText('Saved. The next AI editor request and Ask AI question use Fable 5.1 · Extra high.')).toBeTruthy()
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
