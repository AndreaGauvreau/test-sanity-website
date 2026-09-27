import { describe, expect, it } from 'vitest'

import {
  bridgeMessage,
  editorMessage,
  MAX_TARGETS,
  normalizeOrigin,
  parseBridgeMessage,
  parseEditorMessage,
  parseTargetRef,
  sameTargetRef,
  type BridgeView,
} from './protocol'
import { toElementTarget, toTargetRef, zoneLabels } from './zones'

const VIEW: BridgeView = { mode: 'select', locked: false, scale: 0.84, selection: [{ zone: 'hero.title', index: 0 }], working: [], review: [] }

describe('protocole du pont', () => {
  it('accepte les messages bien formés, dans les deux sens', () => {
    expect(parseEditorMessage(editorMessage({ type: 'sync', view: VIEW }))).toEqual(editorMessage({ type: 'sync', view: VIEW }))
    expect(parseEditorMessage(editorMessage({ type: 'refresh' }))?.type).toBe('refresh')
    expect(parseBridgeMessage(bridgeMessage({ type: 'hello' }))?.type).toBe('hello')
    expect(parseBridgeMessage(bridgeMessage({ type: 'ready', path: '/' }))).toEqual(bridgeMessage({ type: 'ready', path: '/' }))
    const select = bridgeMessage({ type: 'select', target: { zone: 'features.card.title', index: 1, key: 'appointments', doc: 'dockSchedulingPage' }, additive: true })
    expect(parseBridgeMessage(select)).toEqual(select)
    expect(parseBridgeMessage(bridgeMessage({ type: 'escape' }))?.type).toBe('escape')
  })

  it('ignore les messages mal formés, d’une autre source ou d’une autre version', () => {
    const bad: unknown[] = [
      null,
      'hello',
      42,
      [],
      {},
      { source: 'kz-bridge', v: 2, type: 'hello' },
      { source: 'kz-editor', v: 1, type: 'hello' }, // sens inverse
      { source: 'other', v: 1, type: 'hello' },
      { source: 'kz-bridge', v: 1, type: 'unknown' },
      { source: 'kz-bridge', v: 1, type: 'ready', path: 'https://evil.test/' },
      { source: 'kz-bridge', v: 1, type: 'ready' },
      { source: 'kz-bridge', v: 1, type: 'select', target: { zone: 'hero.title', index: 0 } }, // additive manquant
      { source: 'kz-bridge', v: 1, type: 'select', target: { zone: 'hero.title', index: -1 }, additive: false },
      { source: 'kz-bridge', v: 1, type: 'select', target: { zone: '<img src=x>', index: 0 }, additive: false },
      { source: 'kz-bridge', v: 1, type: 'select', target: { zone: 'hero.title', index: 0, key: 'a"]' }, additive: false },
      { source: 'kz-bridge', v: 1, type: 'select', target: { zone: 'hero.title', index: 1.5 }, additive: false },
    ]
    for (const data of bad) expect(parseBridgeMessage(data)).toBeNull()

    const badViews: unknown[] = [
      { ...VIEW, mode: 'edit' },
      { ...VIEW, locked: 'no' },
      { ...VIEW, scale: 0 },
      { ...VIEW, scale: 2 },
      { ...VIEW, scale: Number.NaN },
      { ...VIEW, selection: 'hero.title' },
      { ...VIEW, working: [{ zone: 'hero.title' }] },
      { ...VIEW, review: Array.from({ length: MAX_TARGETS + 1 }, (_, i) => ({ zone: 'hero.title', index: i })) },
    ]
    for (const view of badViews) expect(parseEditorMessage({ source: 'kz-editor', v: 1, type: 'sync', view })).toBeNull()
  })

  it('ne recopie que les champs connus d’une référence', () => {
    expect(parseTargetRef({ zone: 'hero.title', index: 0, label: 'Injected', extra: 1 })).toEqual({ zone: 'hero.title', index: 0 })
  })

  it('normalise une origine stricte, sans valeur par défaut', () => {
    expect(normalizeOrigin('http://127.0.0.1:4040')).toBe('http://127.0.0.1:4040')
    expect(normalizeOrigin('https://conduit.com/')).toBe('https://conduit.com')
    expect(normalizeOrigin(undefined)).toBeNull()
    expect(normalizeOrigin('')).toBeNull()
    expect(normalizeOrigin('*')).toBeNull()
    expect(normalizeOrigin('https://conduit.com/admin')).toBeNull()
    expect(normalizeOrigin('javascript:alert(1)')).toBeNull()
    expect(normalizeOrigin('ftp://conduit.com')).toBeNull()
  })

  it('compare deux références (zone, rang, doc, clé)', () => {
    expect(sameTargetRef({ zone: 'a', index: 0 }, { zone: 'a', index: 0 })).toBe(true)
    expect(sameTargetRef({ zone: 'a', index: 0, key: 'k' }, { zone: 'a', index: 0 })).toBe(false)
  })
})

describe('libellés des zones', () => {
  const labels = zoneLabels({
    zones: {
      'hero.title': { label: 'Title', section: 'Hero', files: [], selectors: [], controls: [] },
      'features.card': { label: 'Card', section: 'Features', files: [], selectors: [], controls: [] },
    },
  })

  it('forme « Section · Label »', () => {
    expect(labels['hero.title']).toBe('Hero · Title')
  })

  it('recalcule le libellé côté admin et refuse une zone inconnue', () => {
    expect(toElementTarget({ zone: 'features.card', index: 2, key: 'k1' }, labels)).toEqual({ zone: 'features.card', index: 2, key: 'k1', label: 'Features · Card' })
    expect(toElementTarget({ zone: 'hero.unknown', index: 0 }, labels)).toBeNull()
    expect(toElementTarget({ zone: 'toString', index: 0 }, labels)).toBeNull()
    expect(toTargetRef({ zone: 'hero.title', index: 0, label: 'Hero · Title' })).toEqual({ zone: 'hero.title', index: 0 })
  })
})
