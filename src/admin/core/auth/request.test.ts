import { describe, expect, it } from 'vitest'

import { isSameOriginRequest, requestOrigin, shouldUseSecureCookies } from './request'

const h = (init: Record<string, string>) => new Headers(init)

describe('request helpers', () => {
  it('origine : http en local, https ailleurs, X-Forwarded-* prioritaires', () => {
    expect(requestOrigin(h({ host: '127.0.0.1:4040' }))).toBe('http://127.0.0.1:4040')
    expect(requestOrigin(h({ host: 'conduit.com' }))).toBe('https://conduit.com')
    expect(requestOrigin(h({ host: 'internal:3000', 'x-forwarded-host': 'conduit.com', 'x-forwarded-proto': 'https' }))).toBe('https://conduit.com')
  })
  it('cookie Secure hors localhost seulement', () => {
    expect(shouldUseSecureCookies(h({ host: '127.0.0.1:4040' }))).toBe(false)
    expect(shouldUseSecureCookies(h({ host: 'conduit.com' }))).toBe(true)
  })
  it('même origine : accepte l’origine de la requête, refuse cross-site et same-site (aperçu 4042)', () => {
    expect(isSameOriginRequest(h({ host: '127.0.0.1:4040', origin: 'http://127.0.0.1:4040' }))).toBe(true)
    expect(isSameOriginRequest(h({ host: '127.0.0.1:4040' }))).toBe(true)
    expect(isSameOriginRequest(h({ host: '127.0.0.1:4040', origin: 'http://127.0.0.1:4042' }))).toBe(false)
    expect(isSameOriginRequest(h({ host: '127.0.0.1:4040', origin: 'https://evil.com' }))).toBe(false)
    expect(isSameOriginRequest(h({ host: '127.0.0.1:4040', 'sec-fetch-site': 'same-site' }))).toBe(false)
    expect(isSameOriginRequest(h({ host: '127.0.0.1:4040', origin: 'null' }))).toBe(false)
  })
})
