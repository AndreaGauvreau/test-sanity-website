import { describe, expect, it } from 'vitest'

import {
  contentItemMeta,
  designItemMeta,
  formatClock,
  formatDateTime,
  formatRelative,
  formatShortDate,
  formatVersionWhen,
  pendingHeaderMeta,
  pendingTabLabel,
  publishButtonLabel,
  shortName,
  versionId,
  versionLabel,
} from './format'

// Heures locales construites avec new Date(y, m, d, h, min) : indépendantes du fuseau de la machine de test.
const NOW = new Date(2026, 8, 26, 14, 32).getTime()
const MIN = 60_000

describe('formats de la publication', () => {
  it('heure 24 h', () => {
    expect(formatClock(new Date(2026, 8, 26, 9, 5))).toBe('09:05')
    expect(formatClock(NOW)).toBe('14:32')
    expect(formatClock('not a date')).toBe('')
  })

  it('temps relatif (E1)', () => {
    expect(formatRelative(NOW - 20_000, NOW)).toBe('just now')
    expect(formatRelative(NOW + 60_000, NOW)).toBe('just now')
    expect(formatRelative(NOW - 12 * MIN, NOW)).toBe('12 min ago')
    expect(formatRelative(NOW - 5 * MIN, NOW)).toBe('5 min ago')
    expect(formatRelative(NOW - 2 * 60 * MIN, NOW)).toBe('2 h ago')
    expect(formatRelative(new Date(2026, 8, 24, 10, 0), NOW)).toBe('Sep 24')
  })

  it('date courte, avec l’année si elle diffère', () => {
    expect(formatShortDate(new Date(2026, 8, 2), NOW)).toBe('Sep 2')
    expect(formatShortDate(new Date(2025, 11, 31), NOW)).toBe('Dec 31, 2025')
  })

  it('date d’une version (E2 : « 2 h ago », « Today 09:10 », « Sep 24 »)', () => {
    expect(formatVersionWhen(NOW - 2 * 60 * MIN, NOW)).toBe('2 h ago')
    expect(formatVersionWhen(new Date(2026, 8, 26, 9, 10), NOW)).toBe('Today 09:10')
    expect(formatVersionWhen(new Date(2026, 8, 25, 18, 0), NOW)).toBe('Yesterday 18:00')
    expect(formatVersionWhen(new Date(2026, 8, 24, 16, 42), NOW)).toBe('Sep 24')
  })

  it('fiche de version : « Sep 26, 2026 · 09:10 »', () => {
    expect(formatDateTime(new Date(2026, 8, 26, 9, 10))).toBe('Sep 26, 2026 · 09:10')
  })

  it('libellés du Figma', () => {
    expect(publishButtonLabel(3)).toBe('Publish 3 changes')
    expect(publishButtonLabel(1)).toBe('Publish 1 change')
    expect(publishButtonLabel(0)).toBe('Publish')
    expect(pendingTabLabel(3)).toBe('Pending (3)')
    expect(pendingTabLabel(0)).toBe('Pending (0)')
  })

  it('méta de l’en-tête', () => {
    expect(pendingHeaderMeta(3, new Date(NOW - 5 * MIN).toISOString(), NOW)).toBe('3 changes waiting · last validated 5 min ago')
    expect(pendingHeaderMeta(1, undefined, NOW)).toBe('1 change waiting')
    expect(pendingHeaderMeta(0, undefined, NOW)).toBe('Everything is published.')
  })

  it('méta des lignes de E1', () => {
    expect(
      contentItemMeta({ summary: '“Dock scheduling, solved.”', author: 'Marie', updatedAt: new Date(NOW - 12 * MIN).toISOString() }, NOW),
    ).toBe('“Dock scheduling, solved.” · Marie · 12 min ago')
    expect(contentItemMeta({ summary: 'Body and excerpt edited', updatedAt: new Date(NOW - 5 * MIN).toISOString() }, NOW)).toBe(
      'Body and excerpt edited · 5 min ago',
    )
    expect(designItemMeta({ validatedBy: 'Marie', validatedAt: new Date(NOW - 5 * MIN).toISOString() }, NOW)).toBe(
      'AI editor · validated by Marie · 5 min ago',
    )
  })

  it('versions : nom court, libellé de liste et identifiant', () => {
    expect(shortName('Andrea (Kuartz)')).toBe('Andrea')
    expect(shortName('Marie')).toBe('Marie')
    expect(versionLabel({ at: new Date(2026, 8, 2, 10, 0).toISOString(), by: 'Andrea (Kuartz)', note: 'first delivery' }, NOW)).toBe(
      'Sep 2 · Andrea · first delivery',
    )
    expect(versionId({ number: 12, tag: 'publication-12', commit: '7f3c2a1b9d8e4f60' })).toBe('publication-12 · 7f3c2a1')
    expect(versionId({ number: 3 })).toBe('publication-3')
  })
})
