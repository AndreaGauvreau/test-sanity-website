/**
 * Signature des scripts du site (siteSettings.scripts) — constat de sécurité SEC-04.
 *
 * Le code d'un script est injecté tel quel sur le site public : seul Kuartz (droit settings.code) peut l'écrire.
 * Or le champ vit dans Sanity, que tout Editor peut modifier (Studio, API). Donc : l'admin (server action de B3,
 * après requireCapability('settings.code')) SIGNE chaque script avec SCRIPTS_SIGNING_SECRET, et le site n'injecte
 * QUE les scripts dont la signature est valide. Un script modifié ailleurs n'est plus injecté (et B3 le signale).
 *
 * Chaîne signée (canonique) : `v1\n<_key>\n<placement>\n<page>\n<run>\n<enabled ? 1 : 0>\n<code>`.
 * Signature : base64url(HMAC-SHA256(SCRIPTS_SIGNING_SECRET, chaîne)), rangée dans le champ `signature` du script.
 *
 * `enabled` absent (script écrit avant le champ) vaut « actif » : TOUJOURS passer par `signableScript()` des deux
 * côtés (admin qui signe, site qui vérifie), sinon la chaîne diffère et le script n'est plus injecté.
 *
 * Module PUR (Web Crypto). Créé par l'orchestrateur, propriété de site-adapter ; utilisé par code-usage (signature)
 * et par le site (vérification, `verifiedScripts()` de src/lib/site-scripts.ts).
 */

export type SignableScript = {
  _key: string
  placement: string
  page: string
  run: string
  enabled: boolean
  code: string
}

/** Champs signés d'un script tel que Sanity le rend (valeurs absentes normalisées : `enabled` absent = actif). */
export function signableScript(script: {
  _key: string
  placement?: string | null
  page?: string | null
  run?: string | null
  enabled?: boolean | null
  code?: string | null
}): SignableScript {
  return {
    _key: script._key,
    placement: script.placement ?? '',
    page: script.page ?? '',
    run: script.run ?? '',
    enabled: script.enabled !== false,
    code: script.code ?? '',
  }
}

const encoder = new TextEncoder()

function canonical(script: SignableScript): string {
  return ['v1', script._key, script.placement, script.page, script.run, script.enabled ? '1' : '0', script.code].join('\n')
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
  let binary = ''
  for (const b of sig) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function signScript(secret: string, script: SignableScript): Promise<string> {
  if (!secret || secret.length < 32) throw new Error('SCRIPTS_SIGNING_SECRET is missing or too short')
  return hmac(secret, canonical(script))
}

export async function verifyScript(secret: string | undefined, script: SignableScript & { signature?: string | null }): Promise<boolean> {
  if (!secret || secret.length < 32 || !script.signature) return false
  const expected = await hmac(secret, canonical(script))
  if (expected.length !== script.signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ script.signature.charCodeAt(i)
  return diff === 0
}
