import {
  createSdkMcpServer,
  query as sdkQuery,
  type HookCallback,
  type McpSdkServerConfigWithInstance,
  type Options,
  type SDKAssistantMessageError,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { StepKind } from '../../../src/admin/core/contracts'
import { modelSupportsEffort } from '../../../src/admin/core/contracts/engine'
import { credentialEnv, type AgentSettings, type ClaudeCredential } from './access'
import { addTokens, estimateCost, meterUsage, NO_TOKENS, type Tokens, type UsageLike } from './cost'
import { repoPath } from '../guards/guards'
import { createGuardHook, type ToolAccess } from './hook'
import { ALLOWED_TOOLS, ASK_TOOL, BUILTIN_TOOLS, MCP_SERVER_NAME, MEASURE_TOOL, TEXT_TOOL } from './names'
import type { AskTool } from './questions'
import { sanitizeClientText } from './sanitize'
import type { TextTool } from './text'
import { kuartzTools, type MeasureTool } from './tools'

/**
 * Claude Code piloté par l'Agent SDK, enfermé dans le clone de travail du site (branche draft) : 4 outils intégrés
 * (Read, Edit, Glob, Grep), nos 3 outils MCP (set_text, measure, ask_client), aucune configuration de la machine, et un
 * hook qui refuse toute lecture hors de src/ et toute édition hors du périmètre. Porté de `batterie-tests:agent.ts`.
 *
 * AUCUN appel réel à Claude dans les tests : `query` est injectable (voir `createAgentRunner(settings, { query })`).
 */

/** Événement d'activité (étape du journal, sans horodatage : engine-core le date). Kinds du contrat (StepKind). */
export type AgentEvent = { kind: StepKind; label: string; detail?: string }

export type AgentRun = {
  prompt: string
  /** Dossier du brouillon (clone de travail, branche draft) : chemin ABSOLU. */
  cwd: string
  /** Fichiers modifiables et outil de texte, selon le périmètre choisi par le client. */
  toolAccess: ToolAccess
  textTool?: TextTool
  measureTool?: MeasureTool
  askTool?: AskTool
  /** `systemAppend(ds)` : 4 phrases fixes + RULES.md. */
  systemAppend: string
  /** Clé API, ou jeton d'abonnement en développement (resolveClaudeAccess). */
  access: ClaudeCredential
  /** Reprend la session précédente (2e essai après un refus des contrôles). */
  resume?: string
  signal: AbortSignal
  onEvent: (event: AgentEvent) => void
  /**
   * Domaines que le journal peut citer (domaine du site). Les textes intermédiaires de Claude et les motifs d'outils
   * affichés au client passent par `sanitizeClientText` (SEC-08) ; absent = aucune adresse.
   */
  allowedDomains?: readonly string[]
}

export type AgentResult = {
  ok: boolean
  /** Dernier message de Claude, destiné au client (à nettoyer par clientMessage). */
  message: string
  sessionId: string | null
  /**
   * Coût et jetons. `costKind: 'session'` : total rapporté par le SDK, qui pour une session reprise (2e essai) est le
   * CUMUL depuis son début. `costKind: 'call'` : appel interrompu sans résultat du SDK, coût estimé d'après les réponses
   * reçues pendant ce seul appel (PRICES_PER_MTOK). Cumul d'une demande : `addCall` (cost.ts).
   */
  costUsd: number
  tokens: Tokens
  /** Allers-retours avec le modèle pendant cet appel, selon le SDK (num_turns, compté par appel). */
  turns: number
  /** Allers-retours réellement relevés pendant cet appel : réponses du modèle, comptées une fois par id. */
  apiTurns: number
  costKind: 'session' | 'call'
  /** Message d'erreur (anglais), null si ok. */
  error: string | null
  /** Erreur qu'aucun nouvel essai ne réglera (accès, facturation, modèle…) : ne pas tenter de 2e essai. */
  fatal?: boolean
}

export type RunAgent = (run: AgentRun) => Promise<AgentResult>

/** Signature de `query()` du SDK, injectable pour les tests (faux flux de messages). */
export type QueryFn = (args: { prompt: string; options: Options }) => AsyncIterable<SDKMessage>

// Après une réponse du client, Claude garde au moins ce temps pour finir.
export const MIN_RESUME_MS = 60_000

/** Identifiant de l'application dans l'en-tête User-Agent des appels du SDK. */
export const CLIENT_APP = 'kuartz-ai-editor/0.1'

/**
 * Modèle refusé par l'accès (inconnu, ou non inclus : ex. Fable 5.1 hors de l'abonnement). Le modèle se choisit dans
 * l'admin (B5 · AI settings) pour l'éditeur ET Ask AI : le message y renvoie, jamais à EDITOR_MODEL / ASK_MODEL.
 */
export const MODEL_UNAVAILABLE =
  'The chosen model isn’t available with this Claude access. Choose another model in Site Settings › Usage › AI settings.'

/** Erreurs d'API qu'aucun nouvel essai ne réglera : on arrête tout de suite au lieu d'attendre le délai max. */
export function fatalApiError(
  error: SDKAssistantMessageError,
  access: Pick<ClaudeCredential, 'kind'> & { secret?: string | null },
): string | null {
  switch (error) {
    case 'authentication_failed':
      if (access.kind === 'api-key') return 'Access refused by Anthropic: check the API key (Settings › Usage › Claude connection).'
      if (access.secret === null) {
        return 'Access refused by Anthropic: sign in to Claude again on this computer (run claude in a terminal, then /login).'
      }
      return 'Access refused by Anthropic: check the CLAUDE_CODE_OAUTH_TOKEN (run `claude setup-token` again) in engine/.env.local.'
    case 'billing_error':
      return access.kind === 'api-key' ? 'The Anthropic account of this API key has no credit left.' : 'Billing problem on your Claude subscription.'
    case 'model_not_found':
      return MODEL_UNAVAILABLE
    case 'account_on_hold':
      return 'The Anthropic account in use is on hold.'
    case 'oauth_org_not_allowed':
      return 'This Anthropic organization is not allowed for this access.'
    case 'verification_required':
      return 'The Anthropic account in use must be verified.'
    case 'invalid_request':
      return 'Request refused by the Anthropic API.'
    case 'cloud_credential_error':
      return 'Cloud credentials refused.'
    case 'rate_limit':
      // Avec un abonnement, c'est le plafond d'utilisation : inutile d'insister pendant des heures.
      return access.kind === 'subscription' ? 'Usage limit of your Claude subscription reached: try again later.' : null
    default:
      return null
  }
}

export const RESULT_ERRORS: Readonly<Record<string, string>> = Object.freeze({
  error_max_turns: 'Claude reached the maximum number of steps without finishing.',
  error_max_budget_usd: 'The maximum budget per change was reached.',
  error_during_execution: 'Claude hit an error while making the change.',
  error_max_structured_output_retries: 'Claude’s answer could not be used.',
})

const fileLabel = (cwd: string, file: unknown) => {
  if (typeof file !== 'string') return '?'
  const relative = repoPath(cwd, file) ?? file
  return relative.split('/').slice(-2).join('/')
}

/** Forme d'un id de champ de set_text (`dockSchedulingPage:hero.title`, `post-1:features.items[_key=="k"].title`). */
const FIELD_ID = /^[A-Za-z0-9_.-]+:[A-Za-z_][\w.[\]="$-]*$/

/**
 * Étape d'activité pour un appel d'outil de Claude (textes en anglais : l'admin les affiche). Les arguments cités
 * (motifs, champ) passent par le filtre d'adresses (SEC-08).
 */
export function describeTool(cwd: string, name: string, input: unknown, allowedDomains: readonly string[] = []): AgentEvent | null {
  const args = (input ?? {}) as Record<string, unknown>
  const clip = (value: unknown) => sanitizeClientText(String(value ?? '').slice(0, 80), allowedDomains)
  switch (name) {
    case MEASURE_TOOL:
    case ASK_TOOL:
      // Le moteur journalise lui-même la mesure et la question, avec leur contenu.
      return null
    case 'Read':
      return { kind: 'read', label: `Reading ${fileLabel(cwd, args.file_path)}` }
    case 'Edit':
      return { kind: 'edit', label: `Editing ${fileLabel(cwd, args.file_path)}` }
    case 'Grep':
      return { kind: 'read', label: `Searching “${clip(args.pattern)}”` }
    case 'Glob':
      return { kind: 'read', label: `Looking for files ${clip(args.pattern)}` }
    case TEXT_TOOL: {
      // Id de champ donné à Claude (`<document>:<chemin Sanity>`, sans espace) : ses points ne sont pas un domaine.
      // Tout autre contenu passe par le filtre d'adresses.
      const field = String(args.field ?? '').slice(0, 80)
      return { kind: 'text', label: `New text for ${FIELD_ID.test(field) ? field : clip(field) || '?'}` }
    }
    default:
      return { kind: 'warn', label: `Tool requested: ${clip(name)}` }
  }
}

/** Environnement MINIMAL du processus Claude Code : jamais `...process.env`, un seul identifiant. */
export function agentEnv(
  settings: Pick<AgentSettings, 'configDir' | 'toolTimeoutMs'>,
  access: ClaudeCredential,
  base: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string | undefined> {
  return {
    PATH: base.PATH,
    HOME: base.HOME,
    // UN identifiant (clé API, jeton, ou connexion de la machine sans secret : voir credentialEnv).
    ...credentialEnv(access, base),
    CLAUDE_CONFIG_DIR: settings.configDir,
    CLAUDE_AGENT_SDK_CLIENT_APP: CLIENT_APP,
    // Une question au client peut attendre plusieurs minutes.
    MCP_TOOL_TIMEOUT: String(settings.toolTimeoutMs),
  }
}

/**
 * Options exactes de query() (validées au POC, SDK vérifié en 0.3.283). Fonction pure, testée option par option.
 * `server` : serveur MCP en mémoire (createSdkMcpServer) ; `guard` : hook PreToolUse sans matcher (tous les outils).
 */
export function buildAgentOptions(input: {
  settings: AgentSettings
  run: Pick<AgentRun, 'cwd' | 'systemAppend' | 'access' | 'resume'>
  server: McpSdkServerConfigWithInstance
  guard: HookCallback
  abortController: AbortController
  base?: Readonly<Record<string, string | undefined>>
}): Options {
  const { settings, run, server, guard, abortController } = input
  return {
    cwd: run.cwd,
    model: settings.model,
    // Effort SEULEMENT pour un modèle qui le prend en charge (`modelSupportsEffort` du contrat) : jamais pour Haiku 4.5,
    // dont l'API refuserait la requête (l'effort choisi dans B5 est alors gardé, ignoré). Jamais de `thinking` : la
    // réflexion reste adaptative par défaut (impossible à désactiver sur Opus 5.5 et Fable 5.1).
    ...(modelSupportsEffort(settings.model) ? { effort: settings.effort } : {}),
    maxTurns: settings.maxTurns,
    // Par APPEL de query() : le plafond du cumul d'une demande est tenu par le moteur (2 essais possibles).
    maxBudgetUsd: settings.maxBudgetUsd,
    // Outils intégrés réduits : ni shell, ni création de fichier, ni web.
    tools: [...BUILTIN_TOOLS],
    // Toujours la même liste, dans le même ordre (cache) ; le hook décide de chaque appel.
    allowedTools: [...ALLOWED_TOOLS],
    permissionMode: 'dontAsk',
    // Isolation : ni CLAUDE.md, ni réglages, plugins ou serveurs MCP de la machine ; seuls nos outils.
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: { [MCP_SERVER_NAME]: server },
    // excludeDynamicSections : sort le dossier de travail et l'état git du prompt système (ils changent à chaque commit
    // sur draft) ; le SDK les remet dans le premier message. Préfixe système stable → cache entre demandes.
    systemPrompt: { type: 'preset', preset: 'claude_code', append: run.systemAppend, excludeDynamicSections: true },
    hooks: { PreToolUse: [{ hooks: [guard] }] },
    abortController,
    resume: run.resume,
    env: agentEnv(settings, run.access, input.base),
  }
}

/** Serveur MCP `kuartz` : outils toujours chargés (jamais différés derrière la recherche d'outils du SDK). */
export function createKuartzServer(
  handlers: Pick<AgentRun, 'textTool' | 'measureTool' | 'askTool'>,
  pauseClock: <T>(task: () => Promise<T>) => Promise<T>,
  toolTimeoutMs: number,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: MCP_SERVER_NAME,
    version: '1.0.0',
    tools: kuartzTools(handlers, pauseClock),
    // Sans alwaysLoad, le SDK 0.3.283 peut différer les outils MCP derrière sa recherche d'outils (ToolSearch, absent
    // de nos outils permis) : Claude ne les verrait pas, et le préfixe du prompt changerait.
    alwaysLoad: true,
    timeout: toolTimeoutMs,
  })
}

/**
 * Minuteur de Claude (délai `timeoutMs` par appel) que `pauseClock` suspend pendant une tâche (l'attente d'une réponse
 * du client à ask_client) : après la tâche, il reprend avec le temps restant, et au moins `minResumeMs` pour finir.
 * `stop()` le coupe pour de bon (fin de l'appel).
 */
export function createAgentClock(timeoutMs: number, onExpire: () => void, minResumeMs = MIN_RESUME_MS) {
  let remaining = timeoutMs
  let since = Date.now()
  let finished = false
  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(onExpire, remaining)
  return {
    pauseClock: async <T>(task: () => Promise<T>): Promise<T> => {
      clearTimeout(timer)
      remaining -= Date.now() - since
      try {
        return await task()
      } finally {
        since = Date.now()
        if (!finished) timer = setTimeout(onExpire, Math.max(remaining, minResumeMs))
      }
    },
    stop: () => {
      finished = true
      clearTimeout(timer)
    },
  }
}

const clip = (text: string, max = 220) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export function createAgentRunner(settings: AgentSettings, deps: { query?: QueryFn } = {}): RunAgent {
  const query: QueryFn = deps.query ?? ((args) => sdkQuery(args))
  return async (run) => {
    const { prompt, cwd, toolAccess, textTool, measureTool, askTool, access, signal, onEvent } = run

    // Le moteur travaille toujours sur un chemin absolu vérifié (piège 5 du POC).
    if (!cwd || !path.isAbsolute(cwd)) return emptyFailure(`Invalid working directory: ${JSON.stringify(cwd)}.`)
    await mkdir(settings.configDir, { recursive: true })

    const abortController = new AbortController()
    const abort = () => abortController.abort()
    if (signal.aborted) abort()
    signal.addEventListener('abort', abort, { once: true })

    // Délai de Claude : le temps passé à attendre la réponse du client ne compte pas.
    const clock = createAgentClock(settings.timeoutMs, abort)
    const { pauseClock } = clock

    // Hook sur TOUS les outils : la décision est celle d'engine-guards (checkToolUse).
    const guard = createGuardHook(cwd, toolAccess, onEvent)

    const server = createKuartzServer({ textTool, measureTool, askTool }, pauseClock, settings.toolTimeoutMs)
    const options = buildAgentOptions({ settings, run, server, guard, abortController })

    // Le dernier texte de Claude devient son message au client ; les précédents rejoignent le journal.
    let pendingText = ''
    let sessionId: string | null = null
    let result: AgentResult | null = null
    let fatalError: string | null = null
    // Réponses du modèle reçues pendant cet appel : de quoi estimer son coût s'il est interrompu.
    const seen: { id: string; usage: UsageLike }[] = []
    const flushText = () => {
      if (pendingText) onEvent({ kind: 'info', label: clip(sanitizeClientText(pendingText, run.allowedDomains ?? [])) })
      pendingText = ''
    }
    // Sans résultat du SDK, ni coût ni jetons : on les estime d'après les réponses reçues pendant cet appel.
    const failed = (error: string, fatal = false): AgentResult => {
      const { tokens, turns } = meterUsage(seen)
      return {
        ok: false,
        message: pendingText,
        sessionId,
        costUsd: estimateCost(settings.model, tokens) ?? 0,
        tokens,
        turns,
        apiTurns: turns,
        costKind: 'call',
        error,
        ...(fatal ? { fatal: true } : {}),
      }
    }

    try {
      for await (const message of query({ prompt, options })) {
        if ('session_id' in message && typeof message.session_id === 'string') sessionId = message.session_id

        if (message.type === 'system' && message.subtype === 'api_retry') {
          fatalError = fatalApiError(message.error, access)
          if (fatalError) break
          onEvent({ kind: 'warn', label: `Anthropic API unavailable (${message.error}): retry ${message.attempt}/${message.max_retries}…` })
        } else if (message.type === 'assistant') {
          // Un message d'erreur de l'API n'est pas une réponse du modèle : il ne compte ni jetons ni aller-retour.
          if (!message.error) seen.push({ id: message.message.id, usage: message.message.usage as UsageLike })
          fatalError = message.error ? fatalApiError(message.error, access) : null
          if (fatalError) break
          for (const block of message.message.content) {
            if (block.type === 'text' && block.text.trim()) {
              flushText()
              pendingText = block.text.trim()
            } else if (block.type === 'tool_use') {
              flushText()
              const event = describeTool(cwd, block.name, block.input, run.allowedDomains)
              if (event) onEvent(event)
            }
          }
        } else if (message.type === 'result') {
          const tokens = Object.values(message.modelUsage ?? {}).reduce<Tokens>(
            (sum, usage) =>
              addTokens(sum, {
                input: usage.inputTokens ?? 0,
                output: usage.outputTokens ?? 0,
                cacheRead: usage.cacheReadInputTokens ?? 0,
                cacheWrite: usage.cacheCreationInputTokens ?? 0,
              }),
            NO_TOKENS,
          )
          const reported = Number(message.total_cost_usd)
          const spent = {
            sessionId,
            costUsd: Number.isFinite(reported) && reported >= 0 ? reported : (estimateCost(settings.model, tokens) ?? 0),
            tokens,
            turns: message.num_turns ?? 0,
            apiTurns: meterUsage(seen).turns,
            costKind: 'session' as const,
          }
          if (message.subtype === 'success' && !message.is_error) {
            result = { ok: true, message: message.result?.trim() || pendingText, ...spent, error: null }
          } else {
            const error =
              message.subtype === 'success'
                ? message.result || 'Claude reported an error.'
                : (RESULT_ERRORS[message.subtype] ?? message.subtype)
            result = { ok: false, message: pendingText, ...spent, error }
          }
        }
      }
    } catch (err) {
      if (fatalError) return failed(fatalError, true)
      if (signal.aborted) return failed('Change stopped on request.')
      if (abortController.signal.aborted) return failed(`Claude did not finish within ${Math.round(settings.timeoutMs / 1000)} s.`)
      return failed(`Claude could not run: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clock.stop()
      signal.removeEventListener('abort', abort)
      // Quitter la boucle (erreur fatale) ne doit pas laisser le processus Claude Code tourner.
      abortController.abort()
    }

    if (fatalError) return failed(fatalError, true)
    if (!result && signal.aborted) return failed('Change stopped on request.')
    return result ?? failed('Claude stopped without a result.')
  }
}

function emptyFailure(error: string): AgentResult {
  return { ok: false, message: '', sessionId: null, costUsd: 0, tokens: NO_TOKENS, turns: 0, apiTurns: 0, costKind: 'call', error, fatal: true }
}
