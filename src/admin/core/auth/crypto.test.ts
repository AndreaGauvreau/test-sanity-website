import { describe, expect, it } from 'vitest'

import { openSession, sealSession } from './crypto'

const SECRET = 'x'.repeat(48)
const base = {
  user: { id: 'p1aB2cD3e', name: 'Marie', email: 'marie@conduit.com' },
  role: 'client' as const,
  sanityRoles: ['administrator'],
  sanityToken: 'sk-user-token-123456',
  dev: false,
}

describe('session crypto (JWE)', () => {
  it('chiffre puis déchiffre la session, expiresAt = now + ttl', async () => {
    const now = new Date('2026-09-27T10:00:00Z')
    const { value, session } = await sealSession(base, SECRET, { now, ttlSeconds: 3600 })
    expect(session.expiresAt).toBe('2026-09-27T11:00:00.000Z')
    expect(value.split('.')).toHaveLength(5) // JWE compact
    expect(value).not.toContain('sk-user-token') // chiffré, pas seulement signé
    const opened = await openSession(value, SECRET, { now: new Date('2026-09-27T10:30:00Z') })
    expect(opened).toEqual(session)
  })

  it('refuse une session expirée', async () => {
    const now = new Date('2026-09-27T10:00:00Z')
    const { value } = await sealSession(base, SECRET, { now, ttlSeconds: 60 })
    expect(await openSession(value, SECRET, { now: new Date('2026-09-27T10:02:00Z') })).toBeNull()
  })

  it('refuse un autre secret, un cookie retouché, une valeur vide', async () => {
    const { value } = await sealSession(base, SECRET)
    expect(await openSession(value, 'y'.repeat(48))).toBeNull()
    const tampered = value.slice(0, -4) + (value.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    expect(await openSession(tampered, SECRET)).toBeNull()
    expect(await openSession('', SECRET)).toBeNull()
    expect(await openSession('not.a.jwe.at.all', SECRET)).toBeNull()
  })

  it('exige un secret d’au moins 32 caractères', async () => {
    await expect(sealSession(base, 'short')).rejects.toThrow(/ADMIN_SESSION_SECRET/)
    await expect(openSession('x', undefined)).rejects.toThrow(/ADMIN_SESSION_SECRET/)
  })
})
