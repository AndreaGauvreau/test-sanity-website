import { generateKeyPairSync, sign as nodeSign, verify as nodeVerify } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type { EngineUser } from '../contracts/session'

import {
  constantTimeEqual,
  decodeEngineIdentity,
  encodeEngineIdentity,
  engineIdentityHeaders,
  signEngineUser,
  toEngineUser,
  verifyEngineBearer,
  verifyEngineUser,
} from './signature'

// Paire de clés Ed25519 générée pour le test (jamais de clé réelle ici).
function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKey,
    publicKey,
    priv: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    pub: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  }
}
const K = keyPair()
const OTHER = keyPair()
const NOW = 1_790_000_000
const SECRET = 'engine-secret-0123456789abcdef0123456789'
const user: EngineUser = { id: 'p1aB2cD3e', name: 'Marie Dupont', email: 'marie@conduit.com', role: 'client' }

async function signedHeaders(u: EngineUser = user, now = NOW, key = K.priv): Promise<Record<string, string>> {
  return engineIdentityHeaders(await signEngineUser(u, key, now))
}

describe('encodage de l’identité', () => {
  it('base64url du JSON, sans remplissage, champs du contrat + iat/exp', async () => {
    const { header } = await signEngineUser({ ...user, extra: 'ignored' } as EngineUser, K.priv, NOW)
    expect(header).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))).toEqual({ ...user, iat: NOW, exp: NOW + 60 })
  })
  it('aller-retour avec accents (UTF-8)', () => {
    const accented = { ...user, name: 'Hélène Çà', iat: NOW, exp: NOW + 60 }
    expect(decodeEngineIdentity(encodeEngineIdentity(accented))).toEqual(accented)
  })
  it('refuse un rôle inconnu, une forme incomplète, des dates non entières', () => {
    const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
    expect(decodeEngineIdentity(b64({ ...user, role: 'admin', iat: NOW, exp: NOW + 60 }))).toBeNull()
    expect(decodeEngineIdentity(b64({ id: 'x', role: 'client', iat: NOW, exp: NOW }))).toBeNull()
    expect(decodeEngineIdentity(b64({ ...user }))).toBeNull()
    expect(decodeEngineIdentity(b64({ ...user, iat: '1', exp: NOW }))).toBeNull()
    expect(decodeEngineIdentity(b64({ ...user, iat: NOW + 0.5, exp: NOW + 60 }))).toBeNull()
    expect(decodeEngineIdentity('not base64!')).toBeNull()
    expect(decodeEngineIdentity(null)).toBeNull()
  })
  it('toEngineUser ne transmet jamais le jeton', () => {
    const engineUser = toEngineUser({ user: { id: 'u', name: 'n', email: 'e' }, role: 'kuartz', sanityToken: 'secret' } as never)
    expect(engineUser).toEqual({ id: 'u', name: 'n', email: 'e', role: 'kuartz' })
  })
})

describe('signEngineUser / verifyEngineUser (Ed25519, SEC-10)', () => {
  it('signe avec la clé privée, vérifie avec la clé publique (Headers et en-têtes Node)', async () => {
    const signed = await signEngineUser(user, K.priv, NOW)
    expect(signed.signature).toMatch(/^[A-Za-z0-9_-]{86}$/)
    expect(await verifyEngineUser(new Headers(engineIdentityHeaders(signed)), K.pub, NOW)).toEqual(user)
    // IncomingHttpHeaders : objet simple, valeurs éventuellement en tableau.
    expect(await verifyEngineUser({ 'x-kz-user': signed.header, 'x-kz-user-sig': [signed.signature] }, K.pub, NOW + 10)).toEqual(user)
  })
  it('interopérable avec node:crypto (le moteur peut vérifier autrement)', async () => {
    const signed = await signEngineUser(user, K.priv, NOW)
    expect(nodeVerify(null, Buffer.from(signed.header), K.publicKey, Buffer.from(signed.signature, 'base64url'))).toBe(true)
    const header = encodeEngineIdentity({ ...user, iat: NOW, exp: NOW + 60 })
    const signature = nodeSign(null, Buffer.from(header), K.privateKey).toString('base64url')
    expect(await verifyEngineUser({ 'x-kz-user': header, 'x-kz-user-sig': signature }, K.pub, NOW)).toEqual(user)
  })
  it('régression SEC-10 : le Bearer ENGINE_SECRET ne permet PAS de forger une identité', async () => {
    // Ancien schéma : HMAC-SHA256(ENGINE_SECRET) en hex. Refusé, quelle que soit sa forme.
    const header = encodeEngineIdentity({ ...user, role: 'kuartz', iat: NOW, exp: NOW + 60 })
    const { createHmac } = await import('node:crypto')
    const hmacHex = createHmac('sha256', SECRET).update(header).digest('hex')
    const hmacB64 = createHmac('sha256', SECRET).update(header).digest('base64url')
    expect(await verifyEngineUser({ 'x-kz-user': header, 'x-kz-user-sig': hmacHex }, K.pub, NOW)).toBeNull()
    expect(await verifyEngineUser({ 'x-kz-user': header, 'x-kz-user-sig': hmacB64 }, K.pub, NOW)).toBeNull()
    // Signé par une autre clé privée : refusé.
    expect(await verifyEngineUser(await signedHeaders({ ...user, role: 'kuartz' }, NOW, OTHER.priv), K.pub, NOW)).toBeNull()
  })
  it('refuse une identité retouchée (rôle élevé), une signature absente ou altérée', async () => {
    const signed = await signedHeaders()
    const forged = { ...signed, 'x-kz-user': encodeEngineIdentity({ ...user, role: 'kuartz', iat: NOW, exp: NOW + 60 }) }
    expect(await verifyEngineUser(forged, K.pub, NOW)).toBeNull()
    expect(await verifyEngineUser({ 'x-kz-user': signed['x-kz-user'] }, K.pub, NOW)).toBeNull()
    const sig = signed['x-kz-user-sig']
    const flipped = `${sig.slice(0, 10)}${sig[10] === 'A' ? 'B' : 'A'}${sig.slice(11)}`
    expect(await verifyEngineUser({ ...signed, 'x-kz-user-sig': flipped }, K.pub, NOW)).toBeNull()
    expect(await verifyEngineUser(signed, 'not-a-key', NOW)).toBeNull()
  })
  it('dates : exp dépassé, iat trop dans le futur, durée > 120 s → refus ; marge de 30 s acceptée', async () => {
    const signed = await signedHeaders(user, NOW)
    expect(await verifyEngineUser(signed, K.pub, NOW + 60)).toEqual(user)
    expect(await verifyEngineUser(signed, K.pub, NOW + 61)).toBeNull()
    expect(await verifyEngineUser(signed, K.pub, NOW - 30)).toEqual(user)
    expect(await verifyEngineUser(signed, K.pub, NOW - 31)).toBeNull()
    // Charge utile signée à la main avec une durée trop longue ou nulle.
    for (const [iat, exp] of [[NOW, NOW + 121], [NOW, NOW]]) {
      const header = encodeEngineIdentity({ ...user, iat, exp })
      const signature = nodeSign(null, Buffer.from(header), K.privateKey).toString('base64url')
      expect(await verifyEngineUser({ 'x-kz-user': header, 'x-kz-user-sig': signature }, K.pub, NOW)).toBeNull()
    }
  })
  it('clé privée absente ou invalide → erreur explicite (jamais de signature vide)', async () => {
    await expect(signEngineUser(user, '', NOW)).rejects.toThrow(/ENGINE_IDENTITY_PRIVATE_KEY/)
    await expect(signEngineUser(user, K.pub, NOW)).rejects.toThrow()
  })
  it('accepte une clé en armure PEM', async () => {
    const pem = K.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
    const pubPem = K.publicKey.export({ format: 'pem', type: 'spki' }).toString()
    expect(await verifyEngineUser(engineIdentityHeaders(await signEngineUser(user, pem, NOW)), pubPem, NOW)).toEqual(user)
  })
})

describe('verifyEngineBearer', () => {
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
