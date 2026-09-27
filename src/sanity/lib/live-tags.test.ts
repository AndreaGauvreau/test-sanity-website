import { describe, expect, it } from 'vitest'

import { MAX_LIVE_TAGS, knownLiveTags } from './live-tags'

describe('knownLiveTags (SEC-02)', () => {
  it('garde les sync tags du Content Lake, sans doublon', () => {
    expect(knownLiveTags(['sanity:s1:1p8chw', 'sanity:s1:1p8chw', 'sanity:s1:Ab_9-x'])).toEqual(['sanity:s1:1p8chw', 'sanity:s1:Ab_9-x'])
  })

  it('écarte tout autre tag (préfixe, format, type), et les entrées qui ne sont pas un tableau', () => {
    expect(knownLiveTags(['sanity:', 'sanity:posts', 'sanity:s1:', 'sanity:s1:a b', 'other:s1:abc', 42, null])).toEqual([])
    expect(knownLiveTags(`sanity:s1:${'a'.repeat(200)}`)).toEqual([])
    expect(knownLiveTags({ tags: ['sanity:s1:abc'] })).toEqual([])
    expect(knownLiveTags(undefined)).toEqual([])
  })

  it('nombre borné : au plus MAX_LIVE_TAGS tags traités', () => {
    const many = Array.from({ length: 5000 }, (_, i) => `sanity:s1:t${i}`)
    expect(knownLiveTags(many)).toHaveLength(MAX_LIVE_TAGS)
  })
})
