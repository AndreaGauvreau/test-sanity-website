/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AskRequest, AskResponse } from '@/admin/core/contracts'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/pages/home' }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
// La server action (modules serveur) n'est jamais chargée ici : les services sont injectés.
vi.mock('./actions', () => ({ getAskAiInfo: vi.fn() }))

import { AskAiProvider, useAskAi } from './AskAiProvider'
import { STORAGE_KEY, serializeTurns } from './conversation'
import type { AskAiInfo } from './info'
import type { AskAiServices } from './useAskConversation'

const INFO: AskAiInfo = { ok: true, userId: 'dev-client', model: 'claude-haiku-4-5-20251001', month: { inputTokens: 1_200_000, outputTokens: 147_000, costUsd: 4.8 } }
const USAGE = { model: 'claude-haiku-4-5-20251001', inputTokens: 2100, outputTokens: 240, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.003, costKind: 'billed' as const, access: 'none' as const, durationMs: 700 }
const ANSWER: AskResponse = {
  answer: 'On Home › Hero (background) and on the post “How to cut dock wait times” (cover).',
  links: [
    { label: 'Open Media', href: '/admin/media' },
    { label: 'Open Home', href: '/admin/pages/home' },
    { label: 'Phish', href: 'https://evil.example' },
  ],
  refusedChange: false,
  usage: USAGE,
}

function services(overrides: Partial<AskAiServices> = {}) {
  const ask = vi.fn<AskAiServices['ask']>(async () => ANSWER)
  const getInfo = vi.fn<AskAiServices['getInfo']>(async () => INFO)
  return { ask, getInfo, ...overrides }
}

function Trigger() {
  const { open, isOpen } = useAskAi()
  return (
    <button type="button" onClick={open} aria-expanded={isOpen}>
      Ask AI
    </button>
  )
}

function renderAsk(s: AskAiServices = services()) {
  const user = userEvent.setup()
  render(
    <div data-kz-admin="">
      <AskAiProvider services={s}>
        <Trigger />
      </AskAiProvider>
    </div>,
  )
  return { user, s }
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Ask AI' }))
  const dialog = await screen.findByRole('dialog', { name: 'Ask AI' })
  const input = within(dialog).getByRole('textbox', { name: 'Question for Ask AI' })
  await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
  await waitFor(() => expect(document.activeElement).toBe(input))
  return { dialog, input }
}

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
  window.sessionStorage.clear()
  // jsdom : scrollTo absent sur les éléments.
  Element.prototype.scrollTo = function scrollTo() {}
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

describe('Ask AI — coût facturé / abonnement Claude', () => {
  it('abonnement : « Included » dans la réponse et le pied (détail au prix de l’API), jamais présenté comme facturé', async () => {
    const s = services({
      getInfo: vi.fn<AskAiServices['getInfo']>(async () => ({
        ok: true,
        userId: 'dev-client',
        model: 'claude-haiku-4-5-20251001',
        month: { inputTokens: 142_000, outputTokens: 3_100, costUsd: 0, includedUsd: 0.3 },
      })),
      ask: vi.fn<AskAiServices['ask']>(async () => ({ ...ANSWER, usage: { ...USAGE, access: 'subscription' as const } })),
    })
    const { user } = renderAsk(s)
    const { dialog, input } = await openPanel(user)
    const footer = within(dialog).getByText('This month: 142k input · 3.1k output · Included')
    expect(footer.getAttribute('title')).toBe('This month: 142k input · 3.1k output · included in your Claude subscription (≈ $0.30 at API prices)')
    await user.type(input, 'Where is the hero image used?')
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    await within(dialog).findByText(ANSWER.answer)
    expect(within(dialog).getByText('Included')).toBeTruthy()
    expect(within(dialog).getByText('2.1k input · 240 output · included in your Claude subscription (≈ $0.003 at API prices)')).toBeTruthy()
    expect(within(dialog).queryByText('2.1k input · 240 output · $0.003')).toBeNull()
  })

  it('mélange sur le mois : coût facturé + « included »', async () => {
    const s = services({
      getInfo: vi.fn<AskAiServices['getInfo']>(async () => ({
        ok: true,
        userId: 'dev-client',
        model: 'claude-haiku-4-5-20251001',
        month: { inputTokens: 142_000, outputTokens: 3_100, costUsd: 0.1, includedUsd: 0.3 },
      })),
    })
    const { user } = renderAsk(s)
    const { dialog } = await openPanel(user)
    expect(within(dialog).getByText('This month: 142k input · 3.1k output · $0.10 + included')).toBeTruthy()
  })
})

describe('Ask AI — panneau', () => {
  it('s’ouvre depuis useAskAi().open, en-tête du Figma, focus dans le champ', async () => {
    const { user } = renderAsk()
    const { dialog } = await openPanel(user)
    expect(within(dialog).getByText('Questions only — it doesn’t change anything.')).toBeTruthy()
    expect(within(dialog).getByText('Haiku 4.5')).toBeTruthy()
    expect(within(dialog).getByText('This month: 1.2M input · 147k output · $4.80')).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'Usage' }).getAttribute('href')).toBe('/admin/settings/usage')
    expect(screen.getByRole('button', { name: 'Ask AI' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('⌘ ↵ envoie : question, réponse, liens de l’admin seulement, consommation ; Entrée seule n’envoie pas', async () => {
    const { user, s } = renderAsk()
    const { dialog, input } = await openPanel(user)
    await user.type(input, 'Where is the hero image used?{Enter}')
    expect(s.ask).not.toHaveBeenCalled()
    await user.clear(input)
    await user.type(input, 'Where is the hero image used?')
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    await within(dialog).findByText(ANSWER.answer)
    expect(s.ask).toHaveBeenCalledTimes(1)
    const [request] = vi.mocked(s.ask).mock.calls[0] as [AskRequest, unknown]
    expect(request).toEqual({ question: 'Where is the hero image used?', history: [], screen: '/admin/pages/home' })
    expect((input as HTMLTextAreaElement).value).toBe('')
    expect(within(dialog).getByText('Where is the hero image used?')).toBeTruthy()
    const links = within(dialog).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Open Media', '/admin/media'],
      ['Open Home', '/admin/pages/home'],
      ['Usage', '/admin/settings/usage'],
    ])
    expect(within(dialog).getByText('2.1k input · 240 output · $0.003')).toBeTruthy()
    // Ctrl + Entrée (Windows, Linux) envoie aussi, avec l'historique de la réponse précédente.
    await user.type(input, 'And the favicon?')
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(s.ask).toHaveBeenCalledTimes(2))
    const [second] = vi.mocked(s.ask).mock.calls[1] as [AskRequest, unknown]
    expect(second.history).toEqual([
      { role: 'user', text: 'Where is the hero image used?' },
      { role: 'assistant', text: ANSWER.answer },
    ])
  })

  it('demande de modification : refus du Figma + « Open Home in AI editor »', async () => {
    const s = services({
      ask: vi.fn(async () => ({
        answer: 'I can’t change anything. To edit a text on the page, open it in the AI editor.',
        links: [{ label: 'Open Home in AI editor', href: '/admin/editor?page=home' }],
        refusedChange: true,
        usage: USAGE,
      })),
    })
    const { user } = renderAsk(s)
    const { dialog, input } = await openPanel(user)
    await user.type(input, 'Change the hero title to “Docks, solved.”')
    await user.click(within(dialog).getByRole('button', { name: 'Send' }))
    await within(dialog).findByText('I can’t change anything. To edit a text on the page, open it in the AI editor.')
    expect(within(dialog).getByRole('link', { name: 'Open Home in AI editor' }).getAttribute('href')).toBe('/admin/editor?page=home')
  })

  it('Échap et ✕ ferment ; le focus revient au bouton ; la conversation reste', async () => {
    const { user } = renderAsk()
    const { input } = await openPanel(user)
    await user.type(input, 'Where?')
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    await screen.findByText(ANSWER.answer)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ask AI' }))

    const { dialog } = await openPanel(user)
    expect(within(dialog).getByText(ANSWER.answer)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Close Ask AI' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ask AI' }))
  })

  it('Échap déjà traité (menu, édition sur place) : le panneau reste ouvert', async () => {
    const { user } = renderAsk()
    await openPanel(user)
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      event.preventDefault()
      document.body.dispatchEvent(event)
    })
    expect(screen.getByRole('dialog', { name: 'Ask AI' })).toBeTruthy()
  })

  it('persistance : la conversation de session revient pour le même utilisateur, pas pour un autre', async () => {
    const turns = [{ id: 'old', question: 'Old question', status: 'answered' as const, answer: 'Old answer', links: [], usage: USAGE }]
    window.sessionStorage.setItem(STORAGE_KEY, serializeTurns(turns, 'dev-client'))
    const first = renderAsk()
    const { dialog } = await openPanel(first.user)
    expect(within(dialog).getByText('Old answer')).toBeTruthy()
    cleanup()

    window.sessionStorage.setItem(STORAGE_KEY, serializeTurns(turns, 'someone-else'))
    const second = renderAsk()
    const opened = await openPanel(second.user)
    expect(within(opened.dialog).queryByText('Old answer')).toBeNull()
  })

  it('erreur : message clair + « Try again » qui renvoie la question', async () => {
    const ask = vi
      .fn<AskAiServices['ask']>()
      .mockRejectedValueOnce(Object.assign(new Error('Claude is busy (rate limit): try again in a moment.'), { status: 503 }))
      .mockResolvedValueOnce(ANSWER)
    const { user } = renderAsk(services({ ask }))
    const { dialog, input } = await openPanel(user)
    await user.type(input, 'Where?')
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    await within(dialog).findByText('Claude is busy (rate limit): try again in a moment.')
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    await within(dialog).findByText(ANSWER.answer)
    expect(ask).toHaveBeenCalledTimes(2)
    expect(within(dialog).getAllByText('Where?')).toHaveLength(1)
  })

  it('droits : Ask AI refusé → message, champ désactivé', async () => {
    const { user } = renderAsk(services({ getInfo: vi.fn(async () => ({ ok: false as const, code: 'forbidden' as const, error: 'You don’t have access to Ask AI.' })) }))
    await user.click(screen.getByRole('button', { name: 'Ask AI' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ask AI' })
    await within(dialog).findByText('You don’t have access to Ask AI.')
    expect((within(dialog).getByRole('textbox', { name: 'Question for Ask AI' }) as HTMLTextAreaElement).disabled).toBe(true)
    expect((within(dialog).getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('attente : « Thinking… », une seule question à la fois', async () => {
    let resolve!: (value: AskResponse) => void
    const ask = vi.fn<AskAiServices['ask']>(() => new Promise((r) => (resolve = r)))
    const { user } = renderAsk(services({ ask }))
    const { dialog, input } = await openPanel(user)
    await user.type(input, 'First')
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    expect(await within(dialog).findByText('Thinking…')).toBeTruthy()
    await user.type(input, 'Second')
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    expect(ask).toHaveBeenCalledTimes(1)
    expect((input as HTMLTextAreaElement).value).toBe('Second')
    await act(async () => resolve(ANSWER))
    await within(dialog).findByText(ANSWER.answer)
  })
})
