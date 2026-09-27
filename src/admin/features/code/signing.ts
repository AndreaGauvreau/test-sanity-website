import 'server-only'

import { SanityWriteError } from '@/admin/core/sanity/paths'
import { signScript, verifyScript } from '@/lib/script-signature'

import { signableFromRaw, signableOf, type ScriptItem } from './scripts'

/**
 * Signature des scripts côté admin (constat SEC-04). SERVEUR SEULEMENT : lit SCRIPTS_SIGNING_SECRET, jamais exposé.
 *
 * - `signItem` : signe les valeurs qu'une écriture de B3 va poser (appelé par script-writes.ts, APRÈS le droit
 *   `settings.code`) ; secret absent ou trop court → erreur claire, rien n'est écrit.
 * - `withSignatureStatus` : marque chaque script lu (`signed`) en vérifiant les valeurs BRUTES du document, comme le site.
 *
 * Le secret est relu à chaque appel (process.env) : un changement de .env.local est pris au prochain rendu.
 */

export const SIGNING_MISSING =
  'Script signing isn’t set up on the server (SCRIPTS_SIGNING_SECRET). Scripts can’t be saved, and none runs on the site.'

/** Longueur minimale du secret (mêmes règles que src/lib/script-signature.ts). */
const SECRET_MIN = 32

function secret(): string | undefined {
  const value = process.env.SCRIPTS_SIGNING_SECRET
  return value && value.length >= SECRET_MIN ? value : undefined
}

/** Le serveur peut-il signer (et donc le site vérifier) ? Faux → bandeau d'erreur dans B3. */
export function isSigningReady(): boolean {
  return secret() !== undefined
}

/** Signature des valeurs signées d'un script (clé, emplacement, page, exécution, état, code). */
export async function signItem(item: Pick<ScriptItem, 'key' | 'placement' | 'page' | 'run' | 'code' | 'enabled'>): Promise<string> {
  const key = secret()
  if (!key) throw new SanityWriteError('unavailable', SIGNING_MISSING)
  return signScript(key, signableOf(item))
}

/** La signature d'un élément brut de `scripts` est-elle valide ? (champ absent, mal typé ou modifié → false) */
export async function isRawSigned(raw: unknown): Promise<boolean> {
  const signable = signableFromRaw(raw)
  if (!signable) return false
  return verifyScript(secret(), signable)
}

/** Complète `signed` des scripts normalisés d'après les éléments bruts du document (par `_key`). */
export async function withSignatureStatus(items: readonly ScriptItem[], raw: unknown): Promise<ScriptItem[]> {
  const list = Array.isArray(raw) ? (raw as unknown[]) : []
  const byKey = new Map<string, unknown>()
  for (const entry of list) {
    const key = entry && typeof entry === 'object' ? (entry as Record<string, unknown>)._key : undefined
    if (typeof key === 'string' && !byKey.has(key)) byKey.set(key, entry)
  }
  return Promise.all(items.map(async (item) => ({ ...item, signed: await isRawSigned(byKey.get(item.key)) })))
}
