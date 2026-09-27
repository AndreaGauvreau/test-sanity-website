import type { Session, EngineUser } from '../contracts/session'
import { ENGINE_HEADER_USER, ENGINE_HEADER_USER_SIG } from '../contracts/engine'
import { ADMIN_ROLES } from '../contracts/roles'

/**
 * Identité signée transmise au moteur IA (contrat engine.ts, constat SEC-10) :
 *   X-Kz-User     = base64url(JSON.stringify({ id, name, email, role, iat, exp }))   (secondes Unix, exp = iat + 60)
 *   X-Kz-User-Sig = base64url(Ed25519(X-Kz-User))
 * L'admin SIGNE avec ENGINE_IDENTITY_PRIVATE_KEY (PKCS#8, base64) ; le moteur VÉRIFIE avec ENGINE_IDENTITY_PUBLIC_KEY
 * (SPKI, base64) et ne détient jamais la clé privée. Clé DISTINCTE du Bearer ENGINE_SECRET : qui vole le Bearer ne
 * peut pas forger un rôle. Refus : signature fausse, exp dépassé, iat > maintenant + 30 s, exp − iat > 120 s.
 *
 * PUR, Web Crypto uniquement, imports RELATIFS (pas d'alias `@/`) : le moteur (`engine/`) importe ce fichier tel
 * quel pour vérifier. Aucun import Node, aucun import Next.
 */

const encoder = new TextEncoder()

/** Durée de validité d'une identité signée (secondes). */
export const ENGINE_IDENTITY_TTL_SECONDS = 60
/** Marge d'horloge tolérée pour un iat dans le futur (secondes). */
export const ENGINE_IDENTITY_CLOCK_SKEW_SECONDS = 30
/** Durée maximale acceptée par le vérificateur (exp − iat, secondes). */
export const ENGINE_IDENTITY_MAX_LIFETIME_SECONDS = 120

export function toEngineUser(session: Pick<Session, 'user' | 'role'>): EngineUser {
  return { id: session.user.id, name: session.user.name, email: session.user.email, role: session.role }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return fromBase64(b64)
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** Clé en base64 (tolère une armure PEM et les retours à la ligne) → octets DER. */
function keyBytes(raw: string, name: string): Uint8Array<ArrayBuffer> {
  const body = raw.replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\s+/g, '')
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) throw new Error(`${name} is missing or is not base64.`)
  return fromBase64(body)
}

const privateKeys = new Map<string, Promise<CryptoKey>>()
const publicKeys = new Map<string, Promise<CryptoKey>>()

function importPrivateKey(pkcs8B64: string): Promise<CryptoKey> {
  let key = privateKeys.get(pkcs8B64)
  if (!key) {
    key = crypto.subtle.importKey('pkcs8', keyBytes(pkcs8B64, 'ENGINE_IDENTITY_PRIVATE_KEY'), { name: 'Ed25519' }, false, ['sign'])
    key.catch(() => privateKeys.delete(pkcs8B64))
    privateKeys.set(pkcs8B64, key)
  }
  return key
}

function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  let key = publicKeys.get(spkiB64)
  if (!key) {
    key = crypto.subtle.importKey('spki', keyBytes(spkiB64, 'ENGINE_IDENTITY_PUBLIC_KEY'), { name: 'Ed25519' }, false, ['verify'])
    key.catch(() => publicKeys.delete(spkiB64))
    publicKeys.set(spkiB64, key)
  }
  return key
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/** Identité signée : EngineUser + horodatage. */
export type SignedEngineIdentity = EngineUser & { iat: number; exp: number }

/** Encode l'identité (JSON UTF-8 → base64url, sans remplissage). Seuls les champs du contrat sont gardés. */
export function encodeEngineIdentity(identity: SignedEngineIdentity): string {
  const clean: SignedEngineIdentity = {
    id: identity.id,
    name: identity.name,
    email: identity.email,
    role: identity.role,
    iat: identity.iat,
    exp: identity.exp,
  }
  return toBase64Url(encoder.encode(JSON.stringify(clean)))
}

/** Décode et valide la forme d'une identité signée (sans vérifier la signature ni les dates). null si invalide. */
export function decodeEngineIdentity(value: string | null | undefined): SignedEngineIdentity | null {
  if (!value || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as Record<string, unknown>
    const { id, name, email, role, iat, exp } = parsed
    if (typeof id !== 'string' || !id || typeof name !== 'string' || typeof email !== 'string') return null
    if (typeof role !== 'string' || !(ADMIN_ROLES as readonly string[]).includes(role)) return null
    if (!Number.isSafeInteger(iat) || !Number.isSafeInteger(exp)) return null
    return { id, name, email, role: role as EngineUser['role'], iat: iat as number, exp: exp as number }
  } catch {
    return null
  }
}

/**
 * Signe l'identité pour une requête vers le moteur. Charge utile `{ ...user, iat, exp = iat + 60 }`.
 * `header` → en-tête X-Kz-User, `signature` → en-tête X-Kz-User-Sig (voir `engineIdentityHeaders`).
 */
export async function signEngineUser(
  user: EngineUser,
  privateKeyPkcs8B64: string,
  nowSeconds: number = nowInSeconds(),
): Promise<{ header: string; signature: string }> {
  const key = await importPrivateKey(privateKeyPkcs8B64)
  const iat = Math.floor(nowSeconds)
  const header = encodeEngineIdentity({ ...user, iat, exp: iat + ENGINE_IDENTITY_TTL_SECONDS })
  const signature = toBase64Url(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, encoder.encode(header))))
  return { header, signature }
}

/** `{ header, signature }` → en-têtes HTTP du contrat (`x-kz-user`, `x-kz-user-sig`). */
export function engineIdentityHeaders(signed: { header: string; signature: string }): Record<string, string> {
  return { [ENGINE_HEADER_USER]: signed.header, [ENGINE_HEADER_USER_SIG]: signed.signature }
}

type HeaderSource = { get(name: string): string | null } | Record<string, string | string[] | undefined>

function readHeader(headers: HeaderSource, name: string): string | null {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(name: string): string | null }).get(name) ?? null
  }
  const record = headers as Record<string, string | string[] | undefined>
  let value = record[name]
  if (value === undefined) {
    const found = Object.keys(record).find((k) => k.toLowerCase() === name)
    value = found === undefined ? undefined : record[found]
  }
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** Signature Ed25519 = 64 octets = 86 caractères base64url sans remplissage. */
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/

/**
 * Vérification côté moteur → EngineUser (sans iat/exp), ou null si : en-tête absent, signature fausse ou mal formée,
 * identité illisible, exp dépassé, iat > maintenant + 30 s, exp ≤ iat ou exp − iat > 120 s.
 * `headers` : `Headers` (get) ou en-têtes Node (`IncomingHttpHeaders`, noms en minuscules).
 */
export async function verifyEngineUser(
  headers: HeaderSource,
  publicKeySpkiB64: string,
  nowSeconds: number = nowInSeconds(),
): Promise<EngineUser | null> {
  const header = readHeader(headers, ENGINE_HEADER_USER)
  const signature = readHeader(headers, ENGINE_HEADER_USER_SIG)
  if (!header || !signature || !SIGNATURE_PATTERN.test(signature)) return null
  const identity = decodeEngineIdentity(header)
  if (!identity) return null
  const now = Math.floor(nowSeconds)
  if (identity.exp < now) return null
  if (identity.iat > now + ENGINE_IDENTITY_CLOCK_SKEW_SECONDS) return null
  if (identity.exp <= identity.iat || identity.exp - identity.iat > ENGINE_IDENTITY_MAX_LIFETIME_SECONDS) return null
  let valid = false
  try {
    const key = await importPublicKey(publicKeySpkiB64)
    valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, fromBase64Url(signature), encoder.encode(header))
  } catch {
    return null
  }
  if (!valid) return null
  return { id: identity.id, name: identity.name, email: identity.email, role: identity.role }
}

/** Comparaison à temps constant de deux chaînes. */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** Vérifie le Bearer du moteur (temps constant). Transport seulement : l'identité a sa propre clé. */
export function verifyEngineBearer(authorization: string | null | undefined, secret: string): boolean {
  if (!authorization || !secret) return false
  const match = /^Bearer (.+)$/.exec(authorization)
  return !!match && constantTimeEqual(match[1], secret)
}
