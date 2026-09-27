import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildDevSession, decideDevAutologin, hostnameOf, isLocalHost, resetDevWarnings, warnIfDevAutologinRefused } from './dev'

const dev = { NODE_ENV: 'development', ADMIN_DEV_AUTOLOGIN: 'kuartz' }

describe('isLocalHost', () => {
  it('reconnaît 127.0.0.1, localhost, [::1] avec ou sans port', () => {
    expect(isLocalHost('127.0.0.1:4040')).toBe(true)
    expect(isLocalHost('localhost')).toBe(true)
    expect(isLocalHost('[::1]:4040')).toBe(true)
    expect(hostnameOf('[::1]:4040')).toBe('[::1]')
  })
  it('refuse tout le reste', () => {
    expect(isLocalHost('conduit.com')).toBe(false)
    expect(isLocalHost('127.0.0.1.evil.com')).toBe(false)
    expect(isLocalHost('localhost.evil.com:4040')).toBe(false)
    expect(isLocalHost(null)).toBe(false)
  })
})

describe('decideDevAutologin', () => {
  it('accepte en développement sur hôte local', () => {
    expect(decideDevAutologin({ env: dev, host: '127.0.0.1:4040' })).toEqual({ enabled: true, role: 'kuartz' })
  })
  it('refuse hors développement (production, test, absent)', () => {
    for (const NODE_ENV of ['production', 'test', undefined]) {
      expect(decideDevAutologin({ env: { ...dev, NODE_ENV }, host: '127.0.0.1:4040' })).toEqual({ enabled: false, reason: 'not-development' })
    }
  })
  it('refuse un hôte non local, ou un X-Forwarded-Host non local', () => {
    expect(decideDevAutologin({ env: dev, host: 'conduit.com' })).toMatchObject({ enabled: false, reason: 'not-local' })
    expect(decideDevAutologin({ env: dev, host: '127.0.0.1:4040', forwardedHost: 'conduit.com' })).toMatchObject({ enabled: false, reason: 'not-local' })
  })
  it('refuse un rôle invalide, ignore une variable vide', () => {
    expect(decideDevAutologin({ env: { ...dev, ADMIN_DEV_AUTOLOGIN: 'admin' }, host: 'localhost' })).toMatchObject({ reason: 'invalid-role' })
    expect(decideDevAutologin({ env: { ...dev, ADMIN_DEV_AUTOLOGIN: '' }, host: 'localhost' })).toMatchObject({ reason: 'unset' })
  })
  it('applique le sélecteur de rôle et la suspension « off »', () => {
    expect(decideDevAutologin({ env: dev, host: 'localhost', devRoleCookie: 'editor' })).toEqual({ enabled: true, role: 'editor' })
    expect(decideDevAutologin({ env: dev, host: 'localhost', devRoleCookie: 'bogus' })).toEqual({ enabled: true, role: 'kuartz' })
    expect(decideDevAutologin({ env: dev, host: 'localhost', devRoleCookie: 'off' })).toMatchObject({ enabled: false, reason: 'suspended' })
  })
})

describe('warnIfDevAutologinRefused', () => {
  beforeEach(() => resetDevWarnings())
  it('journalise bruyamment une fois par cause', () => {
    const log = vi.fn()
    const refused = decideDevAutologin({ env: { ...dev, NODE_ENV: 'production' }, host: 'conduit.com' })
    warnIfDevAutologinRefused(refused, log)
    warnIfDevAutologinRefused(refused, log)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toMatch(/ADMIN_DEV_AUTOLOGIN is set but IGNORED/)
  })
  it('se tait quand la variable est absente', () => {
    const log = vi.fn()
    warnIfDevAutologinRefused({ enabled: false, reason: 'unset' }, log)
    expect(log).not.toHaveBeenCalled()
  })
})

describe('buildDevSession', () => {
  it('session sans jeton Sanity, marquée dev', () => {
    const s = buildDevSession('client', new Date('2026-09-27T00:00:00Z'), 60)
    expect(s).toMatchObject({ role: 'client', sanityToken: null, dev: true, sanityRoles: ['administrator'], expiresAt: '2026-09-27T00:01:00.000Z' })
  })
})
