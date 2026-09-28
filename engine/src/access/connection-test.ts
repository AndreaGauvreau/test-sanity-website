import { CompleteError, createComplete, type ClaudeCredential, type CompleteInput, type CompleteResult } from '../claude'

/**
 * « Test connection » (B5). Messages en anglais, lisibles, JAMAIS la clé ni un en-tête.
 * - Clé API : `GET https://api.anthropic.com/v1/models?limit=1` — gratuit (aucun jeton) ; vérifie la clé et le réseau,
 *   pas le crédit du compte (limite connue : un compte sans crédit passe ce test).
 * - Abonnement (machine ou jeton) : UN tour minimal par l'Agent SDK, sans outil (`complete` d'engine-claude : tools [],
 *   hook qui refuse tout, settingSources [], strictMcpConfig, maxTurns 1, persistSession false, env minimal), modèle le
 *   moins cher (ASK_MODEL, Haiku 4.5 : c'est désormais son SEUL usage, Ask AI suit B5 · AI settings), aucun effort,
 *   256 jetons de sortie au plus. Claude Code fait parfois dépasser une borne très basse (16 : « exceeded the 16 output
 *   token maximum », 2026-09-28) : Claude a alors bien répondu, le test réussit (`complete` le rend en
 *   `stopReason: 'max_tokens'` ; l'ancienne forme, une erreur, reste reconnue).
 */

/** `detail` : message brut de l'échec (journal du moteur seulement, masqué et tronqué par le service), jamais montré tel quel. */
export type ConnectionResult = { ok: boolean; message: string; detail?: string }

export const MODELS_URL = 'https://api.anthropic.com/v1/models?limit=1'
const API_TIMEOUT_MS = 15_000
const SUBSCRIPTION_TIMEOUT_MS = 60_000
export const TEST_MAX_TOKENS = 256

export const TEST_MESSAGES = {
  apiOk: 'Connected — the API key was accepted by Anthropic.',
  subscriptionOk: 'Connected — Claude answered with your subscription.',
  invalidKey: 'Invalid API key: Anthropic refused it. Check the key or create a new one in the Claude Console.',
  forbidden: 'This API key isn’t allowed to use the Anthropic API (permission denied).',
  rateLimited: 'Rate limit or quota reached on this Anthropic account. Try again later.',
  billing: 'Billing problem on this Anthropic account (no credit left?).',
  anthropicDown: (status: number) => `Anthropic is unavailable right now (HTTP ${status}). Try again in a moment.`,
  unexpected: (status: number) => `Unexpected answer from Anthropic (HTTP ${status}).`,
  network: 'Network error: the AI engine couldn’t reach the Anthropic API.',
  timeout: 'No answer from Anthropic in time (network or service slow). Try again.',
  notSignedIn: 'This computer isn’t signed in to Claude. Open a terminal, run claude, then type /login.',
} as const

export async function testApiKey(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<ConnectionResult> {
  let res: Response
  try {
    res = await fetchImpl(MODELS_URL, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
  } catch (error) {
    const name = (error as { name?: string })?.name
    return { ok: false, message: name === 'TimeoutError' || name === 'AbortError' ? TEST_MESSAGES.timeout : TEST_MESSAGES.network }
  }
  // Le corps n'est jamais relayé (il pourrait citer un identifiant de requête ou d'organisation) : seul le statut compte.
  await res.body?.cancel().catch(() => {})
  if (res.ok) return { ok: true, message: TEST_MESSAGES.apiOk }
  if (res.status === 401) return { ok: false, message: TEST_MESSAGES.invalidKey }
  if (res.status === 402) return { ok: false, message: TEST_MESSAGES.billing }
  if (res.status === 403) return { ok: false, message: TEST_MESSAGES.forbidden }
  if (res.status === 429) return { ok: false, message: TEST_MESSAGES.rateLimited }
  if (res.status >= 500) return { ok: false, message: TEST_MESSAGES.anthropicDown(res.status) }
  return { ok: false, message: TEST_MESSAGES.unexpected(res.status) }
}

export type CompleteFn = (input: CompleteInput) => Promise<CompleteResult>

export async function testSubscription(input: {
  access: Extract<ClaudeCredential, { kind: 'subscription' }>
  model: string
  configDir: string
  /** Remplacement pour les tests (faux complete) ; défaut : `createComplete` d'engine-claude (vrai Claude Code). */
  complete?: CompleteFn
}): Promise<ConnectionResult> {
  const complete = input.complete ?? createComplete({ access: input.access, configDir: input.configDir })
  try {
    const result = await complete({
      model: input.model,
      system: 'This is a connection test. Reply with the single word OK.',
      messages: [{ role: 'user', content: 'Connection test: reply OK.' }],
      maxTokens: TEST_MAX_TOKENS,
      signal: AbortSignal.timeout(SUBSCRIPTION_TIMEOUT_MS),
    })
    return result.text || result.stopReason ? { ok: true, message: TEST_MESSAGES.subscriptionOk } : { ok: false, message: 'Claude stopped without an answer.' }
  } catch (error) {
    const message = error instanceof CompleteError ? error.message : error instanceof Error ? error.message : String(error)
    const detail = message.slice(0, 300)
    // Claude Code sans connexion : « Not logged in · Please run /login » (texte du résultat) ou authentication_failed.
    if (input.access.secret === null && /not logged in|\/login|invalid api key|oauth/i.test(message)) {
      return { ok: false, message: TEST_MESSAGES.notSignedIn, detail }
    }
    // Réponse coupée par la borne de sortie : l'abonnement a répondu, la connexion marche.
    if (/exceeded the \d+ output token maximum|max_tokens/i.test(message)) return { ok: true, message: TEST_MESSAGES.subscriptionOk }
    if (/Request stopped/i.test(message)) return { ok: false, message: TEST_MESSAGES.timeout, detail }
    return { ok: false, message: detail || 'Claude couldn’t answer.', detail }
  }
}
