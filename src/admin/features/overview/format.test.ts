import { describe, expect, it } from 'vitest'

import type { PublishStatus } from '@/admin/core/contracts'

import { contentCard, formatAgo, formatDayTime, hintText, productionCard, publishFingerprint, usageCard } from './format'

const TZ = 'Europe/Paris'
const NOW = Date.parse('2026-09-27T14:30:00Z') // 16:30 à Paris

function status(patch: Partial<PublishStatus> = {}): PublishStatus {
  return {
    state: 'pending',
    pending: { content: [], design: [], total: 3 },
    lastPublishedAt: '2026-09-27T14:25:00Z',
    deploy: { mode: 'vercel-hook' },
    ...patch,
  }
}

describe('heures', () => {
  it('formatAgo', () => {
    expect(formatAgo('2026-09-27T14:29:40Z', NOW, TZ)).toBe('just now')
    expect(formatAgo('2026-09-27T14:25:00Z', NOW, TZ)).toBe('5 min ago')
    expect(formatAgo('2026-09-27T12:00:00Z', NOW, TZ)).toBe('2 h ago')
    expect(formatAgo('2026-09-26T10:00:00Z', NOW, TZ)).toBe('yesterday')
    expect(formatAgo('2026-09-23T10:00:00Z', NOW, TZ)).toBe('4 days ago')
    expect(formatAgo('2026-09-01T10:00:00Z', NOW, TZ)).toBe('Sep 1')
    expect(formatAgo('nope', NOW, TZ)).toBe('')
  })
  it('formatDayTime (fuseau du lecteur)', () => {
    expect(formatDayTime('2026-09-27T12:02:00Z', NOW, TZ)).toBe('today 14:02')
    expect(formatDayTime('2026-09-26T07:10:00Z', NOW, TZ)).toBe('yesterday 09:10')
    expect(formatDayTime('2026-09-12T12:02:00Z', NOW, TZ)).toBe('Sep 12, 14:02')
  })
})

describe('cartes de B1', () => {
  it('Production : Ready + « Vercel · deployed today 14:02 »', () => {
    const card = productionCard(status({ lastPublishedAt: '2026-09-27T12:02:00Z' }))
    expect(card.value).toBe('Ready')
    expect(hintText(card.hint, NOW, TZ)).toBe('Vercel · deployed today 14:02')
    expect(hintText(productionCard(status({ deploy: { mode: 'local' }, lastPublishedAt: undefined })).hint, NOW, TZ)).toBe(
      'Local mode · no publication from the admin yet',
    )
  })
  it('Production : Building…, Error, Unavailable', () => {
    const run = { id: 'r', startedAt: '2026-09-27T14:29:00Z', startedBy: 'Marie', step: 3 as const, steps: [] }
    expect(productionCard(status({ state: 'publishing', run }))).toMatchObject({ value: 'Building…', tone: 'working' })
    expect(productionCard(status({ state: 'failed' }))).toMatchObject({ value: 'Error', tone: 'error' })
    expect(productionCard(null)).toMatchObject({ value: 'Unavailable', tone: 'muted' })
  })
  it('Content : « 3 changes · Unpublished · last publish 5 min ago », « Up to date »', () => {
    const card = contentCard(status())
    expect(card.value).toBe('3 changes')
    expect(hintText(card.hint, NOW, TZ)).toBe('Unpublished · last publish 5 min ago')
    expect(contentCard(status({ pending: { content: [], design: [], total: 1 } })).value).toBe('1 change')
    const none = contentCard(status({ pending: { content: [], design: [], total: 0 } }))
    expect(none.value).toBe('Up to date')
    expect(hintText(none.hint, NOW, TZ)).toBe('Last publish 5 min ago')
    expect(hintText(contentCard(status({ lastPublishedAt: undefined })).hint, NOW, TZ)).toBe('Unpublished · never published')
    expect(contentCard(null).tone).toBe('muted')
  })
  it('AI usage this month : « $4.80 · 1.2M input · 147k output tokens » ; mois vide : $0.00', () => {
    const card = usageCard({ inputTokens: 1_204_000, outputTokens: 147_000, costUsd: 4.8 })
    expect(card.value).toBe('$4.80')
    expect(hintText(card.hint, NOW)).toBe('1.2M input · 147k output tokens')
    expect(usageCard(null)).toMatchObject({ value: '$0.00', hint: { text: '0 input · 0 output tokens' } })
    expect(usageCard('unavailable').tone).toBe('muted')
  })
  it('empreinte de publication (rafraîchissement)', () => {
    expect(publishFingerprint(null)).toBe('none')
    expect(publishFingerprint(status())).toBe('pending|2026-09-27T14:25:00Z|3')
  })
})
