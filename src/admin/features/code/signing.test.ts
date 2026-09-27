import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { signScript } from '@/lib/script-signature'

import { normalizeScripts } from './scripts'

/** SEC-04 côté admin : signature des scripts avec SCRIPTS_SIGNING_SECRET, statut « signé » vérifié sur les valeurs brutes. */

vi.mock('server-only', () => ({}))
const { isSigningReady, signItem, withSignatureStatus, SIGNING_MISSING } = await import('./signing')

const SECRET = 'test-secret-'.padEnd(40, 'x')
const RAW = { _key: 'gtm', _type: 'siteScript', name: 'GTM', placement: 'bodyStart', page: 'all', run: 'once', code: '<script>gtm()</script>', enabled: true }

let saved: string | undefined
beforeEach(() => {
  saved = process.env.SCRIPTS_SIGNING_SECRET
  process.env.SCRIPTS_SIGNING_SECRET = SECRET
})
afterEach(() => {
  if (saved === undefined) delete process.env.SCRIPTS_SIGNING_SECRET
  else process.env.SCRIPTS_SIGNING_SECRET = saved
})

describe('signItem', () => {
  it('même signature que src/lib/script-signature (celle que vérifie le site)', async () => {
    const [item] = normalizeScripts([RAW])
    expect(await signItem(item)).toBe(await signScript(SECRET, { ...RAW }))
  })

  it('secret absent ou trop court : erreur claire, jamais de script non signé', async () => {
    const [item] = normalizeScripts([RAW])
    process.env.SCRIPTS_SIGNING_SECRET = 'short'
    expect(isSigningReady()).toBe(false)
    await expect(signItem(item)).rejects.toThrow(SIGNING_MISSING)
    delete process.env.SCRIPTS_SIGNING_SECRET
    await expect(signItem(item)).rejects.toThrow(SIGNING_MISSING)
  })
})

describe('withSignatureStatus', () => {
  it('signé, modifié hors de l’admin, jamais signé', async () => {
    const signature = await signScript(SECRET, RAW)
    const raw = [
      { ...RAW, signature },
      { ...RAW, _key: 'hack', code: '<script>steal()</script>', signature },
      { ...RAW, _key: 'old' },
      // Signé puis modifié dans le Studio (le code change, la signature reste).
      { ...RAW, _key: 'b', signature: await signScript(SECRET, { ...RAW, _key: 'b' }), code: '<script>evil()</script>' },
    ]
    const items = await withSignatureStatus(normalizeScripts(raw), raw)
    expect(items.map((i) => [i.key, i.signed])).toEqual([
      ['gtm', true],
      ['hack', false],
      ['old', false],
      ['b', false],
    ])
  })

  it('valeurs brutes : un « enabled » absent n’est pas signé, même si la lecture le tient pour actif', async () => {
    const { enabled: _e, ...noFlag } = RAW
    const raw = [{ ...noFlag, signature: await signScript(SECRET, RAW) }]
    const [item] = await withSignatureStatus(normalizeScripts(raw), raw)
    expect(item.enabled).toBe(true)
    expect(item.signed).toBe(false)
  })

  it('sans secret : rien n’est signé', async () => {
    const raw = [{ ...RAW, signature: await signScript(SECRET, RAW) }]
    delete process.env.SCRIPTS_SIGNING_SECRET
    const [item] = await withSignatureStatus(normalizeScripts(raw), raw)
    expect(item.signed).toBe(false)
  })
})
