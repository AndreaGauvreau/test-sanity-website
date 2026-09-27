import { describe, expect, it } from 'vitest'

import { formatDay, formatWhen, requestText, sinceLaunchHint, statusNote } from './format'

const NOW = new Date('2026-09-27T16:00:00Z')

describe('formatWhen (colonne When)', () => {
  it('aujourd’hui, hier, date courte, autre année', () => {
    expect(formatWhen('2026-09-27T14:12:00Z', NOW, 'UTC')).toBe('Today 14:12')
    expect(formatWhen('2026-09-26T08:00:00Z', NOW, 'UTC')).toBe('Yesterday')
    expect(formatWhen('2026-09-24T08:00:00Z', NOW, 'UTC')).toBe('Sep 24')
    expect(formatWhen('2025-12-30T08:00:00Z', NOW, 'UTC')).toBe('Dec 30, 2025')
    expect(formatWhen('nope', NOW, 'UTC')).toBe('—')
  })

  it('suit le fuseau demandé', () => {
    // 23:30 UTC le 26 = 01:30 le 27 à Paris (UTC+2 en septembre).
    expect(formatWhen('2026-09-26T23:30:00Z', NOW, 'Europe/Paris')).toBe('Today 01:30')
    expect(formatWhen('2026-09-26T23:30:00Z', NOW, 'UTC')).toBe('Yesterday')
  })
})

describe('formatDay', () => {
  it('« Sep 2, 2026 »', () => {
    expect(formatDay('2026-09-02T09:00:00Z', 'UTC')).toBe('Sep 2, 2026')
    expect(formatDay('x')).toBe('')
  })
})

describe('requestText et statusNote', () => {
  it('texte de la demande, sinon repli lisible', () => {
    expect(requestText({ feature: 'editor', request: 'Rewrite the CTA label' })).toBe('Rewrite the CTA label')
    expect(requestText({ feature: 'editor', page: '/' })).toBe('Edit on /')
    expect(requestText({ feature: 'editor' })).toBe('Edit request')
    expect(requestText({ feature: 'ask' })).toBe('Question')
  })

  it('statuts sans modification signalés, jamais « done »', () => {
    expect(statusNote('failed')).toBe('Failed')
    expect(statusNote('rejected')).toBe('Nothing changed')
    expect(statusNote('done')).toBeUndefined()
  })
})

describe('sinceLaunchHint (carte Since launch, FOLLOWUPS #33)', () => {
  const allTime = { requests: 3, totals: { inputTokens: 4_900_000, outputTokens: 560_000, costUsd: 18.9 }, since: '2026-09-10T09:00:00Z' }

  it('date de mise en ligne du manifeste (adminConfig.site.launchedAt) : « online since »', () => {
    expect(sinceLaunchHint(allTime, '2026-09-02')).toBe('4.9M input · 560k output tokens · online since Sep 2, 2026')
    // Date seule : lue en UTC, jamais décalée d'un jour par le fuseau du serveur.
    expect(sinceLaunchHint(allTime, '2026-09-02', 'America/Los_Angeles')).toBe('4.9M input · 560k output tokens · online since Sep 2, 2026')
    expect(sinceLaunchHint(allTime, '2026-09-02T08:00:00Z', 'UTC')).toBe('4.9M input · 560k output tokens · online since Sep 2, 2026')
  })

  it('sans date (ou date invalide) : repli sur la première demande', () => {
    expect(sinceLaunchHint(allTime, undefined, 'UTC')).toBe('4.9M input · 560k output tokens · since Sep 10, 2026')
    expect(sinceLaunchHint(allTime, 'soon', 'UTC')).toBe('4.9M input · 560k output tokens · since Sep 10, 2026')
  })

  it('aucune demande', () => {
    const none = { requests: 0, totals: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }
    expect(sinceLaunchHint(none)).toBe('No AI requests yet.')
    expect(sinceLaunchHint(none, '2026-09-02')).toBe('No AI requests yet · online since Sep 2, 2026')
  })
})
