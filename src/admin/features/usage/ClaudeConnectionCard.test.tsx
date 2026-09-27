/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ClaudeAccessInput, ClaudeAccessState } from '@/admin/core/contracts/engine'
import { EngineClientError } from '@/admin/core/engine/client'

import { ClaudeConnectionCard, CLAUDE_CONNECTION_TEXT } from './ClaudeConnectionCard'

/**
 * Carte « Claude connection » de B5 en jsdom, avec un FAUX client du moteur (aucun réseau, aucun Claude). Clés de TEST.
 */

const API_KEY = `sk-ant-api03-${'T3st'.repeat(22)}-ABCD`
const OAT = `sk-ant-oat01-${'x'.repeat(95)}`
const NOW = () => new Date('2026-09-27T12:00:00Z')

const BASE: ClaudeAccessState = { mode: 'local', subscriptionAllowed: true, access: 'none', source: 'none', saved: null, envApiKey: false, machine: { loggedIn: true }, problem: 'No Claude access is configured yet.' }

function fakeClient(initial: Partial<ClaudeAccessState> = {}, options: { testOk?: boolean; saveError?: EngineClientError } = {}) {
  let state: ClaudeAccessState = { ...BASE, ...initial }
  const sent: ClaudeAccessInput[] = []
  const claude = {
    access: vi.fn(async () => state),
    save: vi.fn(async (input: ClaudeAccessInput) => {
      sent.push(input)
      if (options.saveError) throw options.saveError
      const { problem: _p, ...rest } = state
      state =
        input.kind === 'api-key'
          ? { ...rest, access: 'api-key', source: 'stored', saved: 'api-key', keyHint: `sk-ant-…${input.apiKey.slice(-4)}` }
          : { ...rest, access: 'subscription', source: 'machine', saved: 'subscription' }
      return state
    }),
    test: vi.fn(async () => {
      state = { ...state, lastTest: { at: '2026-09-27T11:59:00Z', ok: options.testOk ?? true, message: options.testOk === false ? 'Invalid API key: Anthropic refused it.' : 'Connected — the API key was accepted by Anthropic.' } }
      return state
    }),
    clear: vi.fn(async () => {
      state = { ...BASE }
      return state
    }),
  }
  return { client: { claude }, claude, sent }
}

afterEach(cleanup)

describe('ClaudeConnectionCard', () => {
  it('LOCAL : « Use my Claude subscription », sans clé à coller, test lancé automatiquement', async () => {
    const { client, claude, sent } = fakeClient()
    render(<ClaudeConnectionCard adminLocal client={client} now={NOW} />)
    expect(await screen.findByText('Not connected')).toBeTruthy()
    expect(screen.queryByLabelText('Anthropic API key')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Use my Claude subscription' }))
    await waitFor(() => expect(claude.test).toHaveBeenCalledTimes(1))
    expect(sent).toEqual([{ kind: 'subscription' }])
    expect(await screen.findByText('Connected')).toBeTruthy()
    expect(screen.getByText('Using your Claude subscription')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
  })

  it('LOCAL, machine non connectée : marche à suivre (claude puis /login)', async () => {
    const { client } = fakeClient({ machine: { loggedIn: false } })
    render(<ClaudeConnectionCard adminLocal client={client} now={NOW} />)
    expect(await screen.findByText(CLAUDE_CONNECTION_TEXT.notSignedIn)).toBeTruthy()
  })

  it('PRODUCTION (admin hors localhost) : champ password vide, clé envoyée une fois, puis seulement « Connected · sk-ant-…XXXX »', async () => {
    const { client, claude, sent } = fakeClient()
    render(<ClaudeConnectionCard adminLocal={false} client={client} now={NOW} />)
    const input = (await screen.findByLabelText('Anthropic API key')) as HTMLInputElement
    expect(input.type).toBe('password')
    expect(input.value).toBe('')
    expect(input.autocomplete).toBe('off')
    expect(screen.queryByRole('button', { name: 'Use my Claude subscription' })).toBeNull()
    await userEvent.type(input, API_KEY)
    await userEvent.click(screen.getByRole('button', { name: 'Save and test' }))
    await waitFor(() => expect(claude.test).toHaveBeenCalledTimes(1))
    expect(sent).toEqual([{ kind: 'api-key', apiKey: API_KEY }])
    expect(await screen.findByText('Connected · sk-ant-…ABCD')).toBeTruthy()
    expect(screen.queryByLabelText('Anthropic API key')).toBeNull()
    expect(document.body.innerHTML).not.toContain(API_KEY)
    expect(screen.getByRole('button', { name: 'Replace' })).toBeTruthy()
    expect(await screen.findByText(/Last test: Today/)).toBeTruthy()
  })

  it('un jeton sk-ant-oat est refusé AVANT tout envoi, message clair', async () => {
    const { client, claude } = fakeClient({ mode: 'hosted', subscriptionAllowed: false, machine: undefined })
    render(<ClaudeConnectionCard adminLocal client={client} now={NOW} />)
    await userEvent.type(await screen.findByLabelText('Anthropic API key'), OAT)
    await userEvent.click(screen.getByRole('button', { name: 'Save and test' }))
    expect(await screen.findByText(/subscription token \(sk-ant-oat…\), not an API key/)).toBeTruthy()
    expect(claude.save).not.toHaveBeenCalled()
  })

  it('test en échec : état « Connection error » et message lisible ; Disconnect efface', async () => {
    const { client, claude } = fakeClient({ access: 'api-key', source: 'stored', saved: 'api-key', keyHint: 'sk-ant-…WXYZ', problem: undefined }, { testOk: false })
    render(<ClaudeConnectionCard adminLocal={false} client={client} now={NOW} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText('Connection error')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Invalid API key')
    expect(screen.getByText('API key · sk-ant-…WXYZ')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(claude.clear).toHaveBeenCalled())
    expect(await screen.findByText('Not connected')).toBeTruthy()
  })

  it('ANTHROPIC_API_KEY de l’environnement : l’écran dit qu’elle est prioritaire', async () => {
    const { client } = fakeClient({ access: 'api-key', source: 'env', envApiKey: true, keyHint: 'sk-ant-…9Q2x', problem: undefined })
    render(<ClaudeConnectionCard adminLocal client={client} now={NOW} />)
    expect(await screen.findByText(CLAUDE_CONNECTION_TEXT.envKey)).toBeTruthy()
    expect(screen.getByTestId('claude-current').textContent).toBe('API key from the engine environment · sk-ant-…9Q2x')
  })

  it('moteur injoignable : erreur et Retry', async () => {
    const { client, claude } = fakeClient()
    claude.access.mockRejectedValueOnce(new EngineClientError(502, 'unavailable', 'The AI engine is not running.'))
    render(<ClaudeConnectionCard adminLocal client={client} now={NOW} />)
    expect((await screen.findByRole('alert')).textContent).toContain('The AI engine is not running.')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Not connected')).toBeTruthy()
  })
})
