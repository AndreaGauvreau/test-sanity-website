import { describe, expect, it } from 'vitest'

import { canFrame } from './frame'

const h = (init: Record<string, string>) => new Headers(init)
const ADMIN = 'https://conduit.com'

describe('canFrame', () => {
  it('sans en-tête : affichable', () => {
    expect(canFrame(h({}), ADMIN, ADMIN)).toBe(true)
  })
  it('X-Frame-Options', () => {
    expect(canFrame(h({ 'x-frame-options': 'DENY' }), ADMIN, ADMIN)).toBe(false)
    expect(canFrame(h({ 'x-frame-options': 'sameorigin' }), ADMIN, ADMIN)).toBe(true)
    expect(canFrame(h({ 'x-frame-options': 'SAMEORIGIN' }), 'http://127.0.0.1:4040', ADMIN)).toBe(false)
  })
  it('CSP frame-ancestors (prioritaire)', () => {
    expect(canFrame(h({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }), ADMIN, ADMIN)).toBe(false)
    expect(canFrame(h({ 'content-security-policy': "frame-ancestors 'self'", 'x-frame-options': 'DENY' }), ADMIN, ADMIN)).toBe(true)
    expect(canFrame(h({ 'content-security-policy': 'frame-ancestors https://conduit.com' }), ADMIN, 'https://www.conduit.com')).toBe(true)
    expect(canFrame(h({ 'content-security-policy': 'frame-ancestors https://*.conduit.com' }), 'https://admin.conduit.com', 'https://x.com')).toBe(true)
    expect(canFrame(h({ 'content-security-policy': 'frame-ancestors https://other.com' }), ADMIN, 'https://x.com')).toBe(false)
    expect(canFrame(h({ 'content-security-policy': 'frame-ancestors *' }), ADMIN, 'https://x.com')).toBe(true)
  })
})
