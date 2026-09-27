import { EncryptJWT, jwtDecrypt } from 'jose'
import { z } from 'zod'

import { ADMIN_ROLES } from '@/admin/core/contracts/roles'
import type { Session } from '@/admin/core/contracts/session'

import { SESSION_TTL_SECONDS } from './constants'

/**
 * Chiffrement du cookie de session `kz_admin` : JWE compact (alg « dir », enc « A256GCM »), clé = SHA-256 du secret
 * ADMIN_SESSION_SECRET. Chiffré ET authentifié : le jeton Sanity de l'utilisateur est illisible côté navigateur et
 * toute retouche du cookie le rend invalide. Pur (Web Crypto + jose) : testable sans Next.
 */

const ISSUER = 'kz-admin'
const MIN_SECRET_LENGTH = 32

const sessionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string(),
    email: z.string(),
    imageUrl: z.string().optional(),
  }),
  role: z.enum(ADMIN_ROLES),
  sanityRoles: z.array(z.string()),
  sanityToken: z.string().min(1).nullable(),
  dev: z.boolean(),
  expiresAt: z.string(),
})

const keyCache = new Map<string, Promise<Uint8Array>>()

/** Clé AES-256 dérivée du secret (mise en cache par secret). Refuse un secret trop court. */
export function deriveSessionKey(secret: string | undefined): Promise<Uint8Array> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`ADMIN_SESSION_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters.`)
  }
  let key = keyCache.get(secret)
  if (!key) {
    key = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(`kz-admin-session:${secret}`))
      .then((buf) => new Uint8Array(buf))
    keyCache.set(secret, key)
  }
  return key
}

/**
 * Chiffre une session. `expiresAt` de la session est recalculé ici (now + ttl) pour rester l'unique source de vérité
 * avec l'expiration du JWE.
 */
export async function sealSession(
  session: Omit<Session, 'expiresAt'>,
  secret: string | undefined,
  options: { now?: Date; ttlSeconds?: number } = {},
): Promise<{ value: string; session: Session }> {
  const now = options.now ?? new Date()
  const ttl = options.ttlSeconds ?? SESSION_TTL_SECONDS
  const iat = Math.floor(now.getTime() / 1000)
  const exp = iat + ttl
  const full: Session = { ...session, expiresAt: new Date(exp * 1000).toISOString() }
  const key = await deriveSessionKey(secret)
  const value = await new EncryptJWT({ kz: full })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuer(ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .encrypt(key)
  return { value, session: full }
}

/** Déchiffre et valide une session. Toute anomalie (expirée, retouchée, autre secret, forme inattendue) → null. */
export async function openSession(
  value: string | undefined | null,
  secret: string | undefined,
  options: { now?: Date } = {},
): Promise<Session | null> {
  if (!value) return null
  const key = await deriveSessionKey(secret)
  try {
    const { payload } = await jwtDecrypt(value, key, {
      issuer: ISSUER,
      currentDate: options.now,
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    })
    const parsed = sessionSchema.safeParse(payload.kz)
    if (!parsed.success) return null
    return parsed.data
  } catch {
    return null
  }
}
