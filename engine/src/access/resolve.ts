import { claudeKeyHint, type ClaudeAccessSource } from '../../../src/admin/core/contracts'
import { resolveClaudeAccess, type AccessEnv, type AccessResult, type MachineLogin } from '../claude'
import type { StoredAccess } from './store'

/**
 * Accès à Claude du moteur, d'après l'environnement, ce qui est enregistré depuis l'admin et la connexion de la machine.
 * PUR (testé cas par cas). Ordre :
 * 1. ANTHROPIC_API_KEY de l'environnement — TOUJOURS prioritaire (l'écran le dit) ; un `sk-ant-oat…` y est refusé ;
 * 2. clé API enregistrée depuis l'admin ;
 * 3. « Use my Claude subscription » enregistré, moteur local écrit : connexion Claude Code de la machine ; si la machine
 *    n'est pas connectée, repli sur CLAUDE_CODE_OAUTH_TOKEN s'il existe, sinon « pas connectée » avec la marche à suivre ;
 * 4. CLAUDE_CODE_OAUTH_TOKEN de l'environnement (moteur local écrit seulement, règles de `resolveClaudeAccess`) ;
 * 5. rien.
 * L'abonnement (machine ou jeton) n'est JAMAIS accepté en mode hébergé.
 */

export type ResolvedAccess = { result: AccessResult; source: ClaudeAccessSource; keyHint?: string }

export const NOT_SIGNED_IN =
  'This computer isn’t signed in to Claude. Open a terminal, run claude, then type /login and follow the steps. Then click Test connection.'
export const SUBSCRIPTION_HOSTED = 'The Claude subscription only works with a local AI engine (ENGINE_MODE=local). Use an API key.'
export const NO_ACCESS =
  'No Claude access is configured yet: add an Anthropic API key in Settings › Usage › Claude connection (or, on a local engine, use your Claude subscription).'

export function resolveEngineAccess(input: {
  env: AccessEnv
  stored: StoredAccess
  /** ENGINE_MODE=local écrit (config.mode === 'local' && config.explicitLocal). */
  localMode: boolean
  machine: { loggedIn: boolean }
  machineLogin: MachineLogin
}): ResolvedAccess {
  const { env, stored, localMode } = input
  const fromEnv = resolveClaudeAccess(env, { localMode })
  const envKey = (env.ANTHROPIC_API_KEY ?? '').replace(/\s+/g, '')

  // 1. Variable d'environnement (clé API, ou sk-ant-oat refusé).
  if (envKey) {
    return fromEnv.ok && fromEnv.access.kind === 'api-key'
      ? { result: fromEnv, source: 'env', keyHint: claudeKeyHint(fromEnv.access.secret) }
      : { result: fromEnv, source: 'env' }
  }
  // 2. Clé enregistrée.
  if (stored.saved === 'api-key') {
    if (stored.apiKey) return { result: { ok: true, access: { kind: 'api-key', secret: stored.apiKey } }, source: 'stored', keyHint: claudeKeyHint(stored.apiKey) }
    return { result: { ok: false, error: stored.problem ?? NO_ACCESS }, source: 'none' }
  }
  const envToken = fromEnv.ok && fromEnv.access.kind === 'subscription' ? fromEnv : null
  // 3. Abonnement de la machine.
  if (stored.saved === 'subscription') {
    if (!localMode) return { result: { ok: false, error: SUBSCRIPTION_HOSTED }, source: 'none' }
    if (input.machine.loggedIn) {
      return { result: { ok: true, access: { kind: 'subscription', secret: null, machineLogin: input.machineLogin } }, source: 'machine' }
    }
    if (envToken) return { result: envToken, source: 'env' }
    return { result: { ok: false, error: NOT_SIGNED_IN }, source: 'none' }
  }
  // 4. Jeton d'abonnement de l'environnement (repli local), ou son refus en hébergé.
  if ((env.CLAUDE_CODE_OAUTH_TOKEN ?? '').trim()) return { result: fromEnv, source: fromEnv.ok ? 'env' : 'none' }
  // 5. Rien.
  return { result: { ok: false, error: NO_ACCESS }, source: 'none' }
}
