import path from 'node:path'
import { z } from 'zod'
import {
  claudeApiKeyProblem,
  cleanClaudeApiKey,
  CLAUDE_API_KEY_MAX,
  type ClaudeAccessState,
  type ClaudeAccessTest,
} from '../../../src/admin/core/contracts'
import { accessKind, type AccessEnv, type AccessResult, type MachineLogin } from '../claude'
import { badRequest, forbidden } from '../server/errors'
import { testApiKey, testSubscription, type CompleteFn, type ConnectionResult } from './connection-test'
import { detectMachineLogin, type MachineLoginStatus, type MachineProbe } from './machine'
import { resolveEngineAccess, SUBSCRIPTION_HOSTED, type ResolvedAccess } from './resolve'
import type { AccessStore, StoredAccess } from './store'

/**
 * Accès à Claude du moteur, RECHARGEABLE À CHAUD : l'éditeur (au début de chaque demande), Ask AI (à chaque question) et
 * /health lisent `current()` ; un enregistrement depuis l'admin s'applique aussitôt, sans redémarrage. Une demande déjà
 * lancée garde l'identifiant qu'elle a reçu.
 *
 * Sécurité : la clé n'apparaît dans AUCUNE réponse (seulement `keyHint`), aucun journal, aucun message d'erreur ; elle
 * n'est gardée qu'en mémoire et chiffrée sur disque (store.ts).
 */

export type ClaudeAccessService = {
  /** Accès en cours (synchrone : lu au début de chaque demande). */
  current(): AccessResult
  /**
   * Recharge le fichier et recalcule l'accès. La connexion de la machine n'est sondée que si elle sert (abonnement
   * choisi) ou si `machine: true` (écran B5, qui l'affiche avant le choix).
   */
  refresh(options?: { machine?: boolean }): Promise<void>
  state(options?: { refresh?: boolean }): Promise<ClaudeAccessState>
  save(body: unknown): Promise<ClaudeAccessState>
  clear(): Promise<ClaudeAccessState>
  test(): Promise<ClaudeAccessState>
  /**
   * Abonnement de la machine choisi : sonde la connexion toutes les `intervalMs` (≈ 0,1 s, aucun appel au modèle), pour
   * qu'un /login fait dans un terminal (ou une déconnexion) s'applique à l'éditeur et à Ask AI sans passer par B5.
   * Renvoie l'arrêt. Minuteur `unref` : ne retient jamais le processus.
   */
  watch(intervalMs?: number): () => void
}

export type ClaudeAccessDeps = {
  /** Environnement du moteur (ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, ENGINE_MODE). */
  env: AccessEnv
  mode: 'local' | 'hosted'
  /** ENGINE_MODE=local écrit : seul cas où l'abonnement est permis. */
  localMode: boolean
  store: AccessStore
  machineLogin: MachineLogin
  probe: MachineProbe
  /** Modèle du test d'un abonnement (ASK_MODEL : le moins cher). */
  testModel: string
  /** CLAUDE_CONFIG_DIR dédié du test (absolu, sous `<ENGINE_WORKSPACE>/claude`). */
  testConfigDir: string
  /** Tests : remplacements du réseau et de Claude Code. */
  fetchImpl?: typeof fetch
  complete?: CompleteFn
  now?: () => Date
  log?: (line: string) => void
}

const INPUT = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('api-key'), apiKey: z.string().max(CLAUDE_API_KEY_MAX * 2) }).strict(),
    z.object({ kind: z.literal('subscription') }).strict(),
  ],
  // Jamais la valeur reçue dans un message (zod peut la citer).
  { error: () => 'Choose an API key or the Claude subscription.' },
)

/** Un identifiant qui passerait dans un message d'erreur est masqué (défense en profondeur). */
const redact = (text: string) => text.replace(/sk-ant-[A-Za-z0-9_-]+/g, '[secret]')

export function createClaudeAccessService(deps: ClaudeAccessDeps): ClaudeAccessService {
  const now = deps.now ?? (() => new Date())
  let stored: StoredAccess = { saved: null, apiKey: null }
  let machine: MachineLoginStatus = { loggedIn: false }
  let resolved: ResolvedAccess = resolve()
  // Dernier test quand rien n'est enregistré (accès de l'environnement) : en mémoire seulement.
  let memoryTest: ClaudeAccessTest | undefined
  let testing: Promise<ClaudeAccessState> | null = null

  function resolve(): ResolvedAccess {
    return resolveEngineAccess({ env: deps.env, stored, localMode: deps.localMode, machine, machineLogin: deps.machineLogin })
  }

  async function refresh(options: { machine?: boolean } = {}) {
    stored = await deps.store.read()
    const probeMachine = deps.localMode && (options.machine === true || stored.saved === 'subscription')
    machine = probeMachine ? await detectMachineLogin(deps.machineLogin, deps.probe) : deps.localMode ? machine : { loggedIn: false }
    resolved = resolve()
  }

  function snapshot(): ClaudeAccessState {
    const lastTest = stored.saved ? stored.lastTest : memoryTest
    const result = resolved.result
    return {
      mode: deps.mode,
      subscriptionAllowed: deps.localMode,
      access: accessKind(result.ok ? result.access : null),
      source: resolved.source,
      ...(resolved.keyHint ? { keyHint: resolved.keyHint } : {}),
      saved: stored.saved,
      envApiKey: !!(deps.env.ANTHROPIC_API_KEY ?? '').trim(),
      ...(deps.localMode ? { machine: { loggedIn: machine.loggedIn } } : {}),
      ...(lastTest ? { lastTest } : {}),
      ...(!result.ok ? { problem: redact(result.error) } : result.warning ? { problem: redact(result.warning) } : {}),
    }
  }

  async function runTest(): Promise<ClaudeAccessState> {
    await refresh()
    const result = resolved.result
    let outcome: ConnectionResult
    if (!result.ok) outcome = { ok: false, message: result.error }
    else if (result.access.kind === 'api-key') outcome = await testApiKey(result.access.secret, deps.fetchImpl)
    else {
      outcome = await testSubscription({
        access: result.access,
        model: deps.testModel,
        configDir: deps.testConfigDir,
        ...(deps.complete ? { complete: deps.complete } : {}),
      })
    }
    const test: ClaudeAccessTest = { at: now().toISOString(), ok: outcome.ok, message: redact(outcome.message) }
    if (stored.saved) {
      await deps.store.saveTest(test)
      stored = { ...stored, lastTest: test }
    } else memoryTest = test
    deps.log?.(`Claude connection test (${resolved.source}): ${test.ok ? 'ok' : `failed — ${redact(outcome.detail ?? outcome.message).slice(0, 300)}`}`)
    return snapshot()
  }

  return {
    current: () => resolved.result,
    refresh,
    async state(options = {}) {
      if (options.refresh !== false) await refresh({ machine: true })
      return snapshot()
    },
    async save(body) {
      const parsed = INPUT.safeParse(body)
      if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Choose an API key or the Claude subscription.')
      if (parsed.data.kind === 'api-key') {
        const problem = claudeApiKeyProblem(parsed.data.apiKey)
        if (problem) throw badRequest(problem)
        await deps.store.saveApiKey(cleanClaudeApiKey(parsed.data.apiKey))
        deps.log?.('Claude access: an API key was saved from the admin.')
      } else {
        if (!deps.localMode) throw forbidden(SUBSCRIPTION_HOSTED)
        await deps.store.saveSubscription()
        deps.log?.('Claude access: the Claude subscription of this computer was chosen from the admin.')
      }
      memoryTest = undefined
      await refresh({ machine: true })
      return snapshot()
    },
    async clear() {
      await deps.store.clear()
      memoryTest = undefined
      deps.log?.('Claude access: the saved access was removed from the admin.')
      await refresh({ machine: true })
      return snapshot()
    },
    watch(intervalMs = 60_000) {
      const timer = setInterval(() => {
        if (stored.saved !== 'subscription' || testing) return
        refresh().catch((error: unknown) => deps.log?.(`Claude access: refresh failed (${error instanceof Error ? error.name : 'error'})`))
      }, intervalMs)
      timer.unref?.()
      return () => clearInterval(timer)
    },
    test() {
      // Un seul test à la fois : un second clic attend le même résultat.
      testing ??= runTest().finally(() => {
        testing = null
      })
      return testing
    },
  }
}

/** CLAUDE_CONFIG_DIR dédié du test d'abonnement. */
export const testConfigDirOf = (claudeDir: string) => path.join(claudeDir, 'access-test')
