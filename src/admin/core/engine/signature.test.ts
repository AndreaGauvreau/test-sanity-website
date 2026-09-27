import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type { EngineUser } from '../contracts/session'

import {
  constantTimeEqual,
  decodeEngineUser,
  encodeEngineUser,
  hmacSha256Hex,
  signEngineUser,
  toEngineUser,
  verifyEngineBearer,
  verifyEngineUser,
} from './signature'

const SECRET = 'engine-secret-0123456789abcdef0123456789'
const user: EngineUser = { id: 'p1aB2cD3e', name: 'Marie Dupont', email: 'marie@conduit.com', role: 'client' }

describe('hmacSha256Hex — vecteurs connus', () => {
  it('RFC 4231, cas 2 (clé « Jefe »)', async () => {
    expect(await hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
  })
  it('identique à node:crypto (ce que le moteur pourrait calculer autrement)', async () => {
    const encoded = encodeEngineUser(user)
    expect(await hmacSha256Hex(SECRET, encoded)).toBe(createHmac('sha256', SECRET).update(encoded).digest('hex'))
  })
  it('refuse un secret vide', async () => {
    await expect(hmacSha256Hex('', 'x')).rejects.toThrow(/ENGINE_SECRET/)
  })
})

describe('encodage de l’identité', () => {
  it('base64url du JSON, sans remplissage, champs dans l’ordre du contrat', () => {
    const encoded = encodeEngineUser({ ...user, extra: 'ignored' } as EngineUser)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(Buffer.from(encoded, 'base64url').toString('utf8')).toBe(JSON.stringify(user))
  })
  it('aller-retour avec accents (UTF-8)', () => {
    const accented = { ...user, name: 'Hélène Çà' }
    expect(decodeEngineUser(encodeEngineUser(accented))).toEqual(accented)
  })
  it('refuse un rôle inconnu ou une forme incomplète', () => {
    const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
    expect(decodeEngineUser(b64({ ...user, role: 'admin' }))).toBeNull()
    expect(decodeEngineUser(b64({ id: 'x', role: 'client' }))).toBeNull()
    expect(decodeEngineUser('not base64!')).toBeNull()
    expect(decodeEngineUser(null)).toBeNull()
  })
  it('toEngineUser ne transmet jamais le jeton', () => {
    const engineUser = toEngineUser({ user: { id: 'u', name: 'n', email: 'e' }, role: 'kuartz', sanityToken: 'secret' } as never)
    expect(engineUser).toEqual({ id: 'u', name: 'n', email: 'e', role: 'kuartz' })
  })
})

describe('signEngineUser / verifyEngineUser', () => {
  it('signe puis vérifie', async () => {
    const headers = new Headers(await signEngineUser(user, SECRET))
    expect(headers.get('x-kz-user-sig')).toMatch(/^[0-9a-f]{64}$/)
    expect(await verifyEngineUser(headers, SECRET)).toEqual(user)
  })
  it('refuse une identité retouchée (rôle élevé), une autre clé, une signature absente', async () => {
    const signed = await signEngineUser(user, SECRET)
    const forged = new Headers({ ...signed, 'x-kz-user': encodeEngineUser({ ...user, role: 'kuartz' }) })
    expect(await verifyEngineUser(forged, SECRET)).toBeNull()
    expect(await verifyEngineUser(new Headers(signed), `${SECRET}x`)).toBeNull()
    expect(await verifyEngineUser(new Headers({ 'x-kz-user': signed['x-kz-user'] }), SECRET)).toBeNull()
    expect(await verifyEngineUser(new Headers({ ...signed, 'x-kz-user-sig': signed['x-kz-user-sig'].toUpperCase() }), SECRET)).toBeNull()
  })
  it('Bearer à temps constant', () => {
    expect(verifyEngineBearer(`Bearer ${SECRET}`, SECRET)).toBe(true)
    expect(verifyEngineBearer(`Bearer ${SECRET}x`, SECRET)).toBe(false)
    expect(verifyEngineBearer(SECRET, SECRET)).toBe(false)
    expect(verifyEngineBearer(null, SECRET)).toBe(false)
    expect(verifyEngineBearer('Bearer ', '')).toBe(false)
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'ab')).toBe(false)
  })
})
