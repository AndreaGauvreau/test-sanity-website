import { describe, expect, it } from 'vitest'

import type { PublishStatus } from '@/admin/core/contracts/engine'

import { BAR_TEXT, deriveBarView, expectedIds, pollDelay, POLL_ACTIVE_MS, POLL_ERROR_MS, POLL_IDLE_MS, PUBLISHED_HOLD_MS } from './bar-state'

const NOW = new Date(2026, 8, 26, 14, 32, 10).getTime()

function status(partial: Partial<PublishStatus> & { total?: number } = {}): PublishStatus {
  const { total = 0, ...rest } = partial
  return {
    state: 'idle',
    pending: { content: [], design: [], total },
    deploy: { mode: 'vercel-hook' },
    ...rest,
  }
}

const run = (step: 1 | 2 | 3 | 4, extra: Partial<NonNullable<PublishStatus['run']>> = {}): NonNullable<PublishStatus['run']> => ({
  id: 'run-1',
  startedAt: new Date(NOW - 5000).toISOString(),
  startedBy: 'Marie',
  step,
  steps: [],
  ...extra,
})

describe('barre du haut (G3) — les 5 états, textes exacts', () => {
  it('1 · rien à publier : « Everything is published. », Publish grisé', () => {
    const v = deriveBarView(status(), NOW)
    expect(v).toMatchObject({ state: 'idle', text: 'Everything is published.', canPublish: false, showSeeError: false })
  })

  it('2 · en attente : « Unpublished changes: 3 », Publish actif', () => {
    const v = deriveBarView(status({ state: 'pending', total: 3 }), NOW)
    expect(v).toMatchObject({ state: 'pending', text: 'Unpublished changes: 3', count: 3, canPublish: true })
  })

  it('le compteur suit la liste même si le moteur dit « idle »', () => {
    expect(deriveBarView(status({ state: 'idle', total: 2 }), NOW)).toMatchObject({ state: 'pending', text: 'Unpublished changes: 2' })
  })

  it('3 · publication : « Publishing… step 2 / 4 », tout clic ignoré', () => {
    const v = deriveBarView(status({ state: 'publishing', total: 3, run: run(2) }), NOW)
    expect(v).toMatchObject({ state: 'publishing', text: 'Publishing… step 2 / 4', canPublish: false })
    // Étape absente ou hors bornes : ramenée entre 1 et 4.
    expect(deriveBarView(status({ state: 'publishing' }), NOW).text).toBe('Publishing… step 1 / 4')
    expect(deriveBarView(status({ state: 'publishing', run: run(4, { step: 9 as 4 }) }), NOW).text).toBe('Publishing… step 4 / 4')
  })

  it('4 · publié : « Published at 14:32 », « ✓ Published » pendant la confirmation', () => {
    const finishedAt = new Date(2026, 8, 26, 14, 32, 9).toISOString()
    const v = deriveBarView(status({ state: 'published', run: run(4, { finishedAt }) }), NOW)
    expect(v).toMatchObject({ state: 'published', text: 'Published at 14:32', canPublish: false })
    expect(v.publishedUntil).toBe(Date.parse(finishedAt) + PUBLISHED_HOLD_MS)
  })

  it('4 → 1 après la confirmation ; 4 → 2 si de nouveaux brouillons arrivent', () => {
    const finishedAt = new Date(NOW - PUBLISHED_HOLD_MS - 1).toISOString()
    expect(deriveBarView(status({ state: 'published', run: run(4, { finishedAt }) }), NOW)).toMatchObject({
      state: 'idle',
      text: 'Everything is published.',
    })
    const fresh = new Date(NOW - 500).toISOString()
    expect(deriveBarView(status({ state: 'published', total: 1, run: run(4, { finishedAt: fresh }) }), NOW)).toMatchObject({
      state: 'pending',
      text: 'Unpublished changes: 1',
    })
  })

  it('4 · sans heure de fin : « Published just now. » n’est jamais affiché sans date (retour au repos)', () => {
    expect(deriveBarView(status({ state: 'published' }), NOW).state).toBe('idle')
    expect(BAR_TEXT.published('')).toBe('Published just now.')
  })

  it('5 · échec : « Publish failed — previous version still live », See error + Retry', () => {
    const v = deriveBarView(status({ state: 'failed', total: 1, run: run(3, { error: { message: 'Build failed', log: '…' } }) }), NOW)
    expect(v).toMatchObject({ state: 'failed', text: 'Publish failed — previous version still live', showSeeError: true, canPublish: false })
    expect(deriveBarView(status({ state: 'failed', run: run(3) }), NOW).showSeeError).toBe(false)
  })

  it('chargement : pas encore d’état', () => {
    expect(deriveBarView(null, NOW)).toMatchObject({ state: 'idle', canPublish: false, text: BAR_TEXT.loading })
  })
})

describe('liste attendue et sondage', () => {
  it('expected = ids de contenu puis ids de modification, dans l’ordre de E1', () => {
    const s = status({
      state: 'pending',
      total: 2,
      pending: {
        content: [{ id: 'dockSchedulingPage', type: 'dockSchedulingPage', path: 'Home', summary: 'x', updatedAt: '' }],
        design: [{ changeId: 'chg-1', commit: 'abc', title: 't', validatedBy: 'M', validatedAt: '', files: [] }],
        total: 2,
      },
    })
    expect(expectedIds(s)).toEqual(['dockSchedulingPage', 'chg-1'])
    expect(expectedIds(null)).toEqual([])
  })

  it('~1 s pendant une publication, ~5 s au repos, plus lent après une erreur', () => {
    expect(pollDelay(status({ state: 'publishing' }), false)).toBe(POLL_ACTIVE_MS)
    expect(pollDelay(status({ state: 'pending' }), false)).toBe(POLL_IDLE_MS)
    expect(pollDelay(null, false)).toBe(POLL_IDLE_MS)
    expect(pollDelay(status({ state: 'publishing' }), true)).toBe(POLL_ERROR_MS)
  })
})
