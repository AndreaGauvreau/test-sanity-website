/**
 * Jeton d'accès COURT à l'aperçu du brouillon (4042), dérivé du secret racine ENGINE_PREVIEW_SECRET.
 * Constat de sécurité SEC-09 : le secret racine ne doit plus jamais atteindre le navigateur.
 *
 * Format : `v1.<exp>.<uid>.<sig>` — exp = secondes Unix, uid = id de l'utilisateur (base64url),
 * sig = base64url(HMAC-SHA256(secret racine, `v1.<exp>.<uid>`)). Durée conseillée : 15 minutes ; le moteur en émet
 * un nouveau à chaque GET /editor/state. Le proxy de l'aperçu (src/proxy.ts, mode KZ_EDITOR_PREVIEW) l'accepte en
 * `?kz_preview=` ou en cookie `kz_preview`, puis RENOUVELLE le cookie à chaque requête acceptée (jeton re-signé pour
 * le même utilisateur, `renewPreviewToken`).
 *
 * Module PUR (Web Crypto, sans import Node ni Next) : importé par le proxy (auth-core) ET par le moteur
 * (engine-core, chemin relatif). Créé par l'orchestrateur, propriété d'auth-core.
 */

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return toBase64Url(new Uint8Array(sig))
}

/** base64url → texte UTF-8 ; null si illisible. */
function fromBase64Url(value: string): string | null {
  try {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const PREVIEW_TOKEN_TTL_SECONDS = 15 * 60

export async function signPreviewToken(secret: string, userId: string, nowSeconds = Math.floor(Date.now() / 1000), ttl = PREVIEW_TOKEN_TTL_SECONDS): Promise<string> {
  if (secret.length < 16) throw new Error('ENGINE_PREVIEW_SECRET is too short')
  const exp = nowSeconds + ttl
  const uid = toBase64Url(encoder.encode(userId))
  const payload = `v1.${exp}.${uid}`
  return `${payload}.${await hmac(secret, payload)}`
}

/**
 * Jeton valide et non expiré → { exp, userId } (userId = celui passé à signPreviewToken, pour le re-signer) ; sinon
 * null. Accepte une marge d'horloge de 30 s.
 */
export async function verifyPreviewToken(
  secret: string,
  token: string | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ exp: number; userId: string } | null> {
  if (!token || token.length > 512 || secret.length < 16) return null
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1' || !/^\d{9,11}$/.test(parts[1]) || !/^[\w-]{1,200}$/.test(parts[2])) return null
  const exp = Number(parts[1])
  if (exp + 30 < nowSeconds) return null
  const expected = await hmac(secret, `${parts[0]}.${parts[1]}.${parts[2]}`)
  if (!safeEqual(expected, parts[3])) return null
  const userId = fromBase64Url(parts[2])
  return userId === null ? null : { exp, userId }
}

/**
 * Jeton renouvelé (FOLLOWUPS #39) : re-signé pour le MÊME utilisateur, échéance = max(échéance actuelle,
 * maintenant + ttl). Un jeton plus long (moteur, 2 h) n'est jamais raccourci ; un jeton d'utilisateur (15 min) glisse
 * tant que l'aperçu est utilisé. Le jeton doit avoir été vérifié (`verifyPreviewToken`) avant.
 */
export async function renewPreviewToken(
  secret: string,
  verified: { exp: number; userId: string },
  nowSeconds = Math.floor(Date.now() / 1000),
  ttl = PREVIEW_TOKEN_TTL_SECONDS,
): Promise<{ token: string; exp: number }> {
  const exp = Math.max(verified.exp, nowSeconds + ttl)
  return { token: await signPreviewToken(secret, verified.userId, nowSeconds, exp - nowSeconds), exp }
}
