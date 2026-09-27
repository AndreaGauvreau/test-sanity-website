/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Publication, PublishStatus } from '@/admin/core/contracts/engine'

const fetchStatus = vi.fn<() => Promise<PublishStatus>>()
vi.mock('@/admin/core/engine/client', () => ({ engineClient: { publish: { status: () => fetchStatus() } } }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const actions = vi.hoisted(() => ({
  publishChangesAction: vi.fn(),
  retryPublishAction: vi.fn(),
  discardChangeAction: vi.fn(),
  loadDiffAction: vi.fn(),
  rollbackVersionAction: vi.fn(),
}))
vi.mock('./actions', () => actions)

import { PendingView } from './PendingView'
import { publishStatusStore } from './use-publish-status'
import { VersionsView, type VersionsData } from './VersionsView'

const now = Date.now()
const PENDING: PublishStatus = {
  state: 'pending',
  pending: {
    content: [
      { id: 'dockSchedulingPage', type: 'dockSchedulingPage', path: 'Home › Hero · Title', summary: '“Dock scheduling, solved.”', author: 'Marie', updatedAt: new Date(now - 12 * 60_000).toISOString(), viewPath: '/' },
      { id: 'post-demo-x', type: 'post', path: 'Blog › Carrier portals: a checklist', summary: 'Body and excerpt edited', author: 'Marie', updatedAt: new Date(now - 5 * 60_000).toISOString(), viewPath: '/blog/x' },
    ],
    design: [{ changeId: 'chg-hero', commit: 'abc', title: 'Hero · Title — size → Heading XL', validatedBy: 'Marie', validatedAt: new Date(now - 5 * 60_000).toISOString(), files: [] }],
    total: 3,
    lastValidatedAt: new Date(now - 5 * 60_000).toISOString(),
  },
  deploy: { mode: 'vercel-hook' },
}

function renderPending(initial: PublishStatus | null, opts: { canDiff?: boolean; error?: string } = {}) {
  if (initial) {
    fetchStatus.mockResolvedValue(initial)
    act(() => publishStatusStore.set(initial))
  }
  return render(
    <div data-kz-admin="">
      <PendingView
        initialStatus={initial}
        initialError={opts.error ?? null}
        canDiff={opts.canDiff ?? false}
        siteUrl="https://conduit.com"
        domain="conduit.com"
        kinds={{ collectionTypes: ['post'], settingsType: 'siteSettings' }}
      />
    </div>,
  )
}

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
  fetchStatus.mockReset()
  refresh.mockReset()
  Object.values(actions).forEach((fn) => fn.mockReset())
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

describe('E1 · Pending', () => {
  it('groupes Content / Design, lignes du Figma, View ↗ vers le site, bouton « Publish 3 changes »', () => {
    renderPending(PENDING)
    const content = screen.getByRole('region', { name: 'Content' })
    expect(within(content).getByText('Sanity · drafts')).toBeTruthy()
    expect(within(content).getByText('Home › Hero · Title')).toBeTruthy()
    expect(within(content).getByText('“Dock scheduling, solved.” · Marie · 12 min ago')).toBeTruthy()
    expect(within(content).getByRole('link', { name: /View Blog › Carrier portals/ }).getAttribute('href')).toBe('https://conduit.com/blog/x')
    const design = screen.getByRole('region', { name: 'Design' })
    expect(within(design).getByText('git · draft → Vercel')).toBeTruthy()
    expect(within(design).getByText('AI editor · validated by Marie · 5 min ago')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish 3 changes' })).toBeTruthy()
    expect(screen.getByText('Content only: live in seconds. With code: about 1 minute.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'After “Publish”' })).toBeTruthy()
    expect(screen.getByText('Live on conduit.com')).toBeTruthy()
  })

  it('droits du diff : client sans « Diff » ni tag KUARTZ', () => {
    renderPending(PENDING, { canDiff: false })
    expect(screen.queryByRole('button', { name: /^Diff of/ })).toBeNull()
    expect(screen.queryByText('KUARTZ')).toBeNull()
  })

  it('droits du diff : Kuartz ouvre le diff (chargement puis lignes colorées)', async () => {
    const user = userEvent.setup()
    actions.loadDiffAction.mockResolvedValue({ ok: true, data: { diff: '@@ -1 +1 @@\n-  font: a;\n+  font: b;' } })
    renderPending(PENDING, { canDiff: true })
    expect(screen.getByText('KUARTZ')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Diff of Hero · Title — size → Heading XL' }))
    const dialog = await screen.findByRole('dialog', { name: 'Diff · Hero · Title — size → Heading XL' })
    expect(actions.loadDiffAction).toHaveBeenCalledWith({ changeId: 'chg-hero' })
    const added = await within(dialog).findByText('+  font: b;', { normalizer: (text) => text })
    expect(added.getAttribute('data-kind')).toBe('add')
  })

  it('diff refusé ou en erreur : message et « Try again »', async () => {
    const user = userEvent.setup()
    actions.loadDiffAction.mockResolvedValue({ ok: false, status: 403, code: 'forbidden', message: "You don't have access to this." })
    renderPending(PENDING, { canDiff: true })
    await user.click(screen.getByRole('button', { name: /^Diff of/ }))
    const dialog = await screen.findByRole('dialog')
    expect((await within(dialog).findByRole('alert')).textContent).toMatch("You don't have access to this.")
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('Discard : confirmation, puis la ligne disparaît (état renvoyé par le moteur)', async () => {
    const user = userEvent.setup()
    const after: PublishStatus = { ...PENDING, pending: { ...PENDING.pending, content: PENDING.pending.content.slice(1), total: 2 } }
    actions.discardChangeAction.mockResolvedValue({ ok: true, data: after })
    renderPending(PENDING)
    await user.click(screen.getByRole('button', { name: 'Discard Home › Hero · Title' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard this draft?' })
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))
    expect(actions.discardChangeAction).toHaveBeenCalledWith({ kind: 'content', id: 'dockSchedulingPage' })
    await waitFor(() => expect(screen.queryByText('Home › Hero · Title')).toBeNull())
    expect(screen.getByRole('button', { name: 'Publish 2 changes' })).toBeTruthy()
  })

  it('Discard refusé : le message reste dans la fenêtre', async () => {
    const user = userEvent.setup()
    actions.discardChangeAction.mockResolvedValue({ ok: false, status: 409, code: 'publishing', message: 'A publish is running.' })
    renderPending(PENDING)
    await user.click(screen.getByRole('button', { name: 'Discard Hero · Title — size → Heading XL' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard this AI editor change?' })
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('A publish is running.')
  })

  it('Publish : expected = ids affichés ; 409 conflict → message et relecture', async () => {
    const user = userEvent.setup()
    actions.publishChangesAction.mockResolvedValue({ ok: false, status: 409, code: 'conflict', message: 'The list of changes was updated while you were reviewing it. Check it again, then publish.' })
    renderPending(PENDING)
    await user.click(screen.getByRole('button', { name: 'Publish 3 changes' }))
    expect(actions.publishChangesAction).toHaveBeenCalledWith({ expected: ['dockSchedulingPage', 'post-demo-x', 'chg-hero'] })
    expect((await screen.findByRole('alert')).textContent).toMatch(/Check it again, then publish/)
    expect(fetchStatus).toHaveBeenCalled()
  })

  it('vide : « Everything is published. », Publish grisé', () => {
    renderPending({ state: 'idle', pending: { content: [], design: [], total: 0 }, deploy: { mode: 'local' } })
    expect(screen.getByRole('heading', { name: 'Everything is published.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish' })).toHaveProperty('disabled', true)
  })

  it('échec : l’étape en échec porte le message, Retry remplace Publish', async () => {
    renderPending({
      ...PENDING,
      state: 'failed',
      run: {
        id: 'r',
        startedAt: '',
        startedBy: 'Marie',
        step: 3,
        steps: [
          { step: 1, label: '', status: 'done' },
          { step: 2, label: '', status: 'done' },
          { step: 3, label: '', status: 'failed' },
          { step: 4, label: '', status: 'waiting' },
        ],
        error: { message: 'Vercel build failed.', log: 'log' },
      },
    })
    expect(screen.getByText('Vercel build failed.')).toBeTruthy()
    expect(screen.getByText('Failed:', { exact: false })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'See error' })).toBeTruthy()
  })

  it('moteur injoignable au rendu serveur : message et « Try again »', async () => {
    fetchStatus.mockRejectedValue(new Error("The AI engine isn't responding. Try again in a moment."))
    renderPending(null, { error: "The AI engine isn't responding. Try again in a moment." })
    const alerts = await screen.findAllByRole('alert')
    expect(alerts[0].textContent).toMatch("The AI engine isn't responding.")
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

// ─── E2 ────────────────────────────────────────────────────────────────────

const pub = (number: number, status: Publication['status'], extra: Partial<Publication> = {}): Publication => ({
  number,
  at: new Date(now - number * 3_600_000).toISOString(),
  by: 'Andrea (Kuartz)',
  content: [{ id: `c${number}`, path: `FAQ › Question ${number}` }],
  design: [],
  commit: `7f3c2a1${number}000000`,
  tag: `publication-${number}`,
  deployUrl: `https://conduit-${number}.vercel.app`,
  status,
  ...extra,
})

const VERSIONS: VersionsData = { publications: [pub(13, 'live'), pub(12, 'previous'), pub(11, 'failed', { deployUrl: undefined })], rollback: { available: true } }

describe('E2 · Versions', () => {
  it('liste (Live, Failed), fiche de la version choisie, flèches ↑ ↓', async () => {
    const user = userEvent.setup()
    render(<VersionsView initial={VERSIONS} initialError={null} canRollback={false} />)
    const list = screen.getByRole('list', { name: 'Versions' })
    const items = within(list).getAllByRole('button')
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByText('Live')).toBeTruthy()
    expect(within(items[2]).getByText('Failed')).toBeTruthy()
    expect(items[0].getAttribute('aria-current')).toBe('true')
    expect(screen.getByText('publication-13 · 7f3c2a1')).toBeTruthy()

    await user.click(items[1])
    expect(screen.getByText('publication-12 · 7f3c2a1')).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByText('Failed', { selector: 'section *' })).toBeTruthy()
    expect(document.activeElement).toBe(within(list).getAllByRole('button')[2])
    expect(screen.getByRole('button', { name: 'View' })).toHaveProperty('disabled', true)
  })

  it('client : pas de « Roll back to this version »', () => {
    render(<VersionsView initial={VERSIONS} initialError={null} canRollback={false} />)
    expect(screen.queryByRole('button', { name: /Roll back/ })).toBeNull()
    expect(screen.getByText('View opens this version’s code with today’s content.')).toBeTruthy()
  })

  it('Kuartz, mode local : bouton grisé et raison affichée', () => {
    render(<VersionsView initial={{ ...VERSIONS, rollback: { available: false, reason: 'Not in local mode.' } }} initialError={null} canRollback />)
    expect(screen.getByRole('button', { name: 'Roll back to this version' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Not in local mode.')).toBeTruthy()
  })

  it('Kuartz : confirmation obligatoire ; 501 du moteur → message clair dans la fenêtre', async () => {
    const user = userEvent.setup()
    actions.rollbackVersionAction.mockResolvedValue({
      ok: false,
      status: 501,
      code: 'not_implemented',
      message: 'Roll back isn’t available in local mode: this site has no Vercel deployment to return to.',
    })
    render(<VersionsView initial={VERSIONS} initialError={null} canRollback />)
    await user.click(within(screen.getByRole('list', { name: 'Versions' })).getAllByRole('button')[1])
    await user.click(screen.getByRole('button', { name: 'Roll back to this version' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Roll back to publication-12 · 7f3c2a1?' })
    await user.click(within(dialog).getByRole('button', { name: 'Roll back' }))
    expect(actions.rollbackVersionAction).toHaveBeenCalledWith({ number: 12 })
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/isn’t available in local mode/)
  })

  it('Kuartz : retour arrière réussi → version en ligne', async () => {
    const user = userEvent.setup()
    actions.rollbackVersionAction.mockResolvedValue({ ok: true, data: pub(12, 'live') })
    render(<VersionsView initial={VERSIONS} initialError={null} canRollback />)
    await user.click(within(screen.getByRole('list', { name: 'Versions' })).getAllByRole('button')[1])
    await user.click(screen.getByRole('button', { name: 'Roll back to this version' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Roll back' }))
    expect((await screen.findByRole('status')).textContent).toBe('publication-12 · 7f3c2a1 is live again.')
    expect(refresh).toHaveBeenCalled()
  })

  it('vide et erreur', () => {
    const { unmount } = render(<VersionsView initial={{ publications: [], rollback: { available: false } }} initialError={null} canRollback />)
    expect(screen.getByRole('heading', { name: 'No versions yet' })).toBeTruthy()
    unmount()
    render(<VersionsView initial={null} initialError="The AI engine isn't responding." canRollback />)
    expect(screen.getByRole('alert').textContent).toMatch("The AI engine isn't responding.")
  })
})
