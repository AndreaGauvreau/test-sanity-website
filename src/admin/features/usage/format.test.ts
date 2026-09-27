import { describe, expect, it } from 'vitest'

import { formatDay, formatWhen, requestText, statusNote } from './format'

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
