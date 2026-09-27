/** @vitest-environment jsdom */
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PublishStatus } from '@/admin/core/contracts/engine'
import type { CollectionDef } from '@/admin/core/contracts/manifest'
import { ToastProvider } from '@/admin/ui'
import adminConfig from '@/admin.config'

import { buildRows } from '../lib/rows'

// ─── Faux Next, server actions et moteur ────────────────────────────────────

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router, useSelectedLayoutSegment: () => null }))

const actions = vi.hoisted(() => ({
  createItemAction: vi.fn(),
  deleteItemsAction: vi.fn(),
  reorderAction: vi.fn(),
  saveFieldAction: vi.fn(),
  statusAction: vi.fn(),
}))
vi.mock('../server/actions', () => actions)

const engine = vi.hoisted(() => ({
  stage: vi.fn(),
  unstage: vi.fn(),
  status: vi.fn(),
}))
vi.mock('./stage-client', () => ({
  stageClient: { stage: engine.stage, unstage: engine.unstage },
  loadPublishStatus: engine.status,
}))

import { CollectionScreen, deleteManyDescription } from './CollectionScreen'

const blog = adminConfig.collections.find((c) => c.id === 'blog')!

function doc(id: string, title: string) {
  return {
    _id: id,
    _type: 'post',
    _updatedAt: '2026-09-01T00:00:00Z',
    title,
    slug: { _type: 'slug', current: id.replace(/^drafts\./, '') },
    publishedAt: '2026-09-08T08:00:00.000Z',
    orderRank: id.includes('live') ? 'a0' : 'a1',
  }
}

const rows = buildRows(blog, [doc('live-1', 'Live post'), doc('drafts.new-1', 'New draft')], { projectId: 'p', dataset: 'development' })

function status(content: PublishStatus['pending']['content'] = []): PublishStatus {
  return { state: content.length ? 'pending' : 'idle', pending: { content, design: [], total: content.length }, deploy: { mode: 'local' } }
}

function renderScreen() {
  return render(
    <ToastProvider>
      <CollectionScreen collection={blog} rows={rows} />
    </ToastProvider>,
  )
}

async function openStatusMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
  const row = screen.getByRole('button', { name: `Open ${title}` }).closest('[role="row"]') as HTMLElement
  await user.click(within(row).getByRole('button', { name: /^Status:/ }))
}

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true
  Object.values(router).forEach((f) => f.mockReset())
  Object.values(actions).forEach((f) => f.mockReset())
  Object.values(engine).forEach((f) => f.mockReset())
  engine.status.mockResolvedValue(status())
  try {
    sessionStorage.clear()
  } catch {
    // jsdom sans stockage : sans effet.
  }
})
afterEach(() => {
  cleanup()
  MotionGlobalConfig.skipAnimations = false
})

describe('CollectionScreen (C3) — FOLLOWUPS #31', () => {
  it('Delete draft : router.refresh() après la suppression (comptes de la sidebar)', async () => {
    actions.statusAction.mockResolvedValue({ ok: true, status: null, row: null })
    const user = userEvent.setup()
    renderScreen()
    await openStatusMenu(user, 'New draft')
    await user.click(await screen.findByRole('menuitem', { name: 'Delete draft' }))
    await user.click(await screen.findByRole('button', { name: 'Delete draft' }))
    expect(actions.statusAction).toHaveBeenCalledWith({ collectionId: 'blog', id: 'new-1', action: 'delete-draft' })
    expect(router.refresh).toHaveBeenCalled()
  })

  it('Unpublish d’un élément en ligne : programmé au moteur (publish.stage), statut « Unpublishing », refresh', async () => {
    engine.stage.mockResolvedValue(status([{ id: 'live-1', type: 'post', path: 'Blog › Live post', summary: 'Will be unpublished', action: 'unpublish', updatedAt: '2026-09-27T00:00:00Z' }]))
    const user = userEvent.setup()
    renderScreen()
    await openStatusMenu(user, 'Live post')
    await user.click(await screen.findByRole('menuitem', { name: 'Unpublish' }))
    await user.click(await screen.findByRole('button', { name: 'Unpublish' }))
    expect(engine.stage).toHaveBeenCalledWith({ kind: 'unpublish', id: 'live-1' })
    expect(await screen.findByRole('button', { name: 'Status: Unpublishing' })).toBeTruthy()
    expect(router.refresh).toHaveBeenCalled()
  })

  it('état programmé relu au chargement ; « Keep online » annule (publish.unstage)', async () => {
    engine.status.mockResolvedValue(status([{ id: 'live-1', type: 'document', path: 'live-1', summary: '', action: 'unpublish', updatedAt: '2026-09-27T00:00:00Z' }]))
    engine.unstage.mockResolvedValue(status())
    const user = userEvent.setup()
    renderScreen()
    await user.click(await screen.findByRole('button', { name: 'Status: Unpublishing' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Keep online' }))
    expect(engine.unstage).toHaveBeenCalledWith('live-1')
    expect(await screen.findAllByRole('button', { name: 'Status: Live' })).toHaveLength(1)
  })

  it('sélection : brouillon supprimé tout de suite, élément en ligne programmé, refresh', async () => {
    actions.deleteItemsAction.mockResolvedValue({ ok: true, deleted: ['new-1'], skipped: [] })
    engine.stage.mockResolvedValue(status([{ id: 'live-1', type: 'post', path: 'Blog › Live post', summary: 'Will be deleted', action: 'delete', updatedAt: '2026-09-27T00:00:00Z' }]))
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }))
    await user.click(await screen.findByRole('button', { name: 'Delete 2' }))
    await act(async () => {
      await user.click(await screen.findByRole('button', { name: 'Delete' }))
    })
    expect(actions.deleteItemsAction).toHaveBeenCalledWith({ collectionId: 'blog', ids: ['new-1'] })
    expect(engine.stage).toHaveBeenCalledWith({ kind: 'delete', id: 'live-1' })
    expect(router.refresh).toHaveBeenCalled()
  })

  it('texte de confirmation de la suppression multiple', () => {
    expect(deleteManyDescription({ drafts: ['a'], live: ['b', 'c'] }, 'post', 'posts')).toBe(
      'This draft has never been published: it is deleted for good now. The 2 live posts stay on the site until the next Publish, then they are removed and deleted.',
    )
  })
})

describe('CollectionScreen (C3) — kit CMSCell / CMSRow (FOLLOWUPS #40)', () => {
  const manual: CollectionDef = { ...blog, defaultSort: { field: 'orderRank', direction: 'asc' } }

  function renderWith(collection: CollectionDef) {
    return render(
      <ToastProvider>
        <CollectionScreen collection={collection} rows={rows} />
      </ToastProvider>,
    )
  }

  it('poignée : bouton du kit (CMSCell type=handle + gripProps) nommé, décrit, et qui soulève la ligne au clavier', async () => {
    const user = userEvent.setup()
    renderWith(manual)
    const grip = screen.getByRole('button', { name: 'Reorder Live post' })
    expect(grip.closest('[role="cell"]')?.getAttribute('data-type')).toBe('handle')
    expect(grip.getAttribute('data-grip')).toBe('live-1')
    expect(grip.getAttribute('aria-describedby')).toContain('blog-reorder-help')
    expect(grip.getAttribute('aria-disabled')).toBeNull()
    // La case de la ligne est dans la même cellule du kit.
    expect(within(grip.closest('[role="cell"]') as HTMLElement).getByRole('checkbox', { name: 'Select Live post' })).toBeTruthy()
    grip.focus()
    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Reorder Live post' }).getAttribute('aria-pressed')).toBe('true')
    await user.keyboard('{Escape}')
  })

  it('tri autre que « Manual order » : poignée aria-disabled', () => {
    renderWith(blog)
    expect(screen.getByRole('button', { name: 'Reorder Live post' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('collection sans ordre manuel : pas de poignée', () => {
    renderWith({ ...blog, orderable: false })
    expect(screen.queryByRole('button', { name: /^Reorder / })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Select Live post' })).toBeTruthy()
  })

  it('remplissage avant Row open : un seul par ligne, posé par CMSRow (plus de .filler ici)', () => {
    const { container } = renderWith(blog)
    const [header, ...body] = Array.from(container.querySelectorAll<HTMLElement>('[role="row"]'))
    const spacers = (row: HTMLElement) => Array.from(row.children).filter((el) => el.tagName === 'SPAN' && el.getAttribute('aria-hidden') === 'true')
    expect(spacers(header)).toHaveLength(0)
    expect(body).toHaveLength(2)
    for (const row of body) {
      const fillers = spacers(row)
      expect(fillers).toHaveLength(1)
      expect(fillers[0].hasAttribute('data-row-filler')).toBe(true)
    }
  })
})
