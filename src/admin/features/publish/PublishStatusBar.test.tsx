/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { autosave } from '@/admin/core/autosave'
import type { PublishStatus } from '@/admin/core/contracts/engine'

const fetchStatus = vi.fn<() => Promise<PublishStatus>>()
vi.mock('@/admin/core/engine/client', () => ({ engineClient: { publish: { status: () => fetchStatus() } } }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
const actions = vi.hoisted(() => ({
  publishChangesAction: vi.fn(),
  retryPublishAction: vi.fn(),
  discardChangeAction: vi.fn(),
  loadDiffAction: vi.fn(),
  rollbackVersionAction: vi.fn(),
}))
vi.mock('./actions', () => actions)

import { PublishStatusBar } from './PublishStatusBar'
import { publishStatusStore } from './use-publish-status'

function status(partial: Partial<PublishStatus> = {}): PublishStatus {
  return { state: 'idle', pending: { content: [], design: [], total: 0 }, deploy: { mode: 'vercel-hook' }, ...partial }
}

const PENDING = status({
  state: 'pending',
  pending: {
    content: [{ id: 'dockSchedulingPage', type: 'dockSchedulingPage', path: 'Home › Hero · Title', summary: 'x', updatedAt: new Date().toISOString() }],
    design: [
      { changeId: 'chg-1', commit: 'abc', title: 'Hero · Title', validatedBy: 'M', validatedAt: new Date().toISOString(), files: [] },
      { changeId: 'chg-2', commit: 'def', title: 'Hero · Lede', validatedBy: 'M', validatedAt: new Date().toISOString(), files: [] },
    ],
    total: 3,
  },
})

const run = (extra: Partial<NonNullable<PublishStatus['run']>>): NonNullable<PublishStatus['run']> => ({
  id: 'r',
  startedAt: new Date().toISOString(),
  startedBy: 'Marie',
  step: 1,
  steps: [],
  ...extra,
})

function renderBar(initial: PublishStatus) {
  fetchStatus.mockResolvedValue(initial)
  act(() => publishStatusStore.set(initial))
  return render(
    <div data-kz-admin="">
      <PublishStatusBar siteUrl="https://conduit.com" />
    </div>,
  )
}

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
  fetchStatus.mockReset()
  Object.values(actions).forEach((fn) => fn.mockReset())
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

describe('PublishStatusBar (G3)', () => {
  it('1 · Everything is published. — Publish grisé, Review et View site présents', async () => {
    renderBar(status())
    const bar = screen.getByRole('banner')
    expect(await within(bar).findByText('Everything is published.')).toBeTruthy()
    expect(within(bar).getByRole('button', { name: 'Publish' })).toHaveProperty('disabled', true)
    expect(within(bar).getByRole('link', { name: /Review/ }).getAttribute('href')).toBe('/admin/publish')
    const view = within(bar).getByRole('link', { name: /View site/ })
    expect(view.getAttribute('href')).toBe('https://conduit.com')
    expect(view.getAttribute('target')).toBe('_blank')
    expect(within(bar).getByText('Draft saved automatically')).toBeTruthy()
  })

  it('2 · Unpublished changes: 3 — Publish publie la liste affichée, puis « Publishing… step 1 / 4 »', async () => {
    const user = userEvent.setup()
    actions.publishChangesAction.mockResolvedValue({ ok: true, data: status({ state: 'publishing', pending: PENDING.pending, run: run({ step: 1 }) }) })
    renderBar(PENDING)
    expect(await screen.findByText('Unpublished changes: 3')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Publish 3 changes' }))
    expect(actions.publishChangesAction).toHaveBeenCalledWith({ expected: ['dockSchedulingPage', 'chg-1', 'chg-2'] })
    expect(await screen.findByText('Publishing… step 1 / 4')).toBeTruthy()
  })

  it('409 conflict : message affiché et état relu', async () => {
    const user = userEvent.setup()
    actions.publishChangesAction.mockResolvedValue({ ok: false, status: 409, code: 'conflict', message: 'The list of changes was updated while you were reviewing it. Check it again, then publish.' })
    renderBar(PENDING)
    await screen.findByText('Unpublished changes: 3')
    const reads = fetchStatus.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Publish 3 changes' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/was updated while you were reviewing/)
    await waitFor(() => expect(fetchStatus.mock.calls.length).toBeGreaterThan(reads))
  })

  it('3 · Publishing… step 2 / 4 — le bouton ignore les clics', async () => {
    const user = userEvent.setup()
    renderBar(status({ state: 'publishing', pending: PENDING.pending, run: run({ step: 2 }) }))
    expect(await screen.findByText('Publishing… step 2 / 4')).toBeTruthy()
    const button = screen.getByRole('button', { name: /Publishing…/ })
    expect(button.getAttribute('aria-busy')).toBe('true')
    await user.click(button)
    expect(actions.publishChangesAction).not.toHaveBeenCalled()
  })

  it('4 · Published at HH:MM — « Published »', async () => {
    const finishedAt = new Date(Date.now() - 500)
    renderBar(status({ state: 'published', run: run({ step: 4, finishedAt: finishedAt.toISOString() }) }))
    const hh = String(finishedAt.getHours()).padStart(2, '0')
    const mm = String(finishedAt.getMinutes()).padStart(2, '0')
    expect(await screen.findByText(`Published at ${hh}:${mm}`)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Published/ })).toBeTruthy()
  })

  it('5 · Publish failed — See error ouvre le journal, Retry relance', async () => {
    const user = userEvent.setup()
    actions.retryPublishAction.mockResolvedValue({ ok: true, data: status({ state: 'publishing', run: run({ step: 3 }) }) })
    renderBar(status({ state: 'failed', pending: { content: [], design: [], total: 1 }, run: run({ step: 3, error: { message: 'Vercel build failed.', log: 'Type error: boom' } }) }))
    expect(await screen.findByText('Publish failed — previous version still live')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'See error' }))
    const dialog = await screen.findByRole('dialog', { name: 'Publish failed' })
    expect(within(dialog).getByText('Vercel build failed.')).toBeTruthy()
    expect(within(dialog).getByText(/Type error: boom/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }))
    expect(actions.retryPublishAction).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Publishing… step 3 / 4')).toBeTruthy()
  })

  it('erreur de lecture du moteur : affichée, jamais avalée', async () => {
    fetchStatus.mockRejectedValue(new Error("The AI engine isn't responding. Try again in a moment."))
    act(() => publishStatusStore.set(PENDING))
    render(<PublishStatusBar siteUrl="https://conduit.com" />)
    await act(() => publishStatusStore.refresh())
    expect((await screen.findByRole('alert')).textContent).toBe("The AI engine isn't responding. Try again in a moment.")
  })

  it('Draft saved automatically : suit l’autosave et relit le compteur après un enregistrement', async () => {
    renderBar(PENDING)
    await screen.findByText('Unpublished changes: 3')
    act(() => autosave.saving())
    expect(screen.getByText('Saving draft…')).toBeTruthy()
    fetchStatus.mockResolvedValue(status({ state: 'pending', pending: { ...PENDING.pending, total: 4 } }))
    act(() => autosave.saved())
    expect(await screen.findByText('Unpublished changes: 4')).toBeTruthy()
    expect(screen.getByText('Draft saved automatically')).toBeTruthy()
    act(() => {
      autosave.saving()
      autosave.failed('This item no longer exists.')
    })
    expect(screen.getByRole('alert').textContent).toBe('Draft not saved: This item no longer exists.')
  })
})
