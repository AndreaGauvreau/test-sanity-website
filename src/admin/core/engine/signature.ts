import type { Session, EngineUser } from '../contracts/session'
import { ENGINE_HEADER_USER, ENGINE_HEADER_USER_SIG } from '../contracts/engine'
import { ADMIN_ROLES } from '../contracts/roles'

/**
 * Identité signée transmise au moteur IA (contrat engine.ts) :
 *   X-Kz-User     = base64url(JSON.stringify(EngineUser))
 *   X-Kz-User-Sig = hex(HMAC-SHA256(ENGINE_SECRET, X-Kz-User))
 *
 * PUR, Web Crypto uniquement, imports RELATIFS (pas d'alias `@/`) : le moteur (`engine/`) importe ce fichier tel
 * quel pour vérifier. Aucun import Node, aucun import Next.
 */

const encoder = new TextEncoder()

export function toEngineUser(session: Pick<Session, 'user' | 'role'>): EngineUser {
  return { id: session.user.id, name: session.user.name, email: session.user.email, role: session.role }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Encode l'identité (JSON UTF-8 → base64url, sans remplissage). */
export function encodeEngineUser(user: EngineUser): string {
  const clean: EngineUser = { id: user.id, name: user.name, email: user.email, role: user.role }
  return toBase64Url(encoder.encode(JSON.stringify(clean)))
}

/** Décode et valide la forme d'une identité. null si illisible ou incomplète. */
export function decodeEngineUser(value: string | null | undefined): EngineUser | null {
  if (!value || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as Record<string, unknown>
    const { id, name, email, role } = parsed
    if (typeof id !== 'string' || !id || typeof name !== 'string' || typeof email !== 'string') return null
    if (typeof role !== 'string' || !(ADMIN_ROLES as readonly string[]).includes(role)) return null
    return { id, name, email, role: role as EngineUser['role'] }
  } catch {
    return null
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error('ENGINE_SECRET is missing.')
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

/** hex(HMAC-SHA256(secret, message)). */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await hmacKey(secret)
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}

/** Comparaison à temps constant de deux chaînes. */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** En-têtes d'identité signés pour une requête vers le moteur. */
export async function signEngineUser(user: EngineUser, secret: string): Promise<Record<string, string>> {
  const encoded = encodeEngineUser(user)
  return { [ENGINE_HEADER_USER]: encoded, [ENGINE_HEADER_USER_SIG]: await hmacSha256Hex(secret, encoded) }
}

/**
 * Vérification côté moteur : signature correcte (temps constant) ET identité bien formée → EngineUser, sinon null.
 * `headers` : tout objet avec get(name) (Headers, IncomingMessage adapté…).
 */
export async function verifyEngineUser(
  headers: { get(name: string): string | null | undefined },
  secret: string,
): Promise<EngineUser | null> {
  const encoded = headers.get(ENGINE_HEADER_USER)
  const sig = headers.get(ENGINE_HEADER_USER_SIG)
  if (!encoded || !sig || !/^[0-9a-f]{64}$/.test(sig)) return null
  const expected = await hmacSha256Hex(secret, encoded)
  if (!constantTimeEqual(expected, sig)) return null
  return decodeEngineUser(encoded)
}

/** Vérifie le Bearer du moteur (temps constant). */
export function verifyEngineBearer(authorization: string | null | undefined, secret: string): boolean {
  if (!authorization || !secret) return false
  const match = /^Bearer (.+)$/.exec(authorization)
  return !!match && constantTimeEqual(match[1], secret)
}
