import Anthropic from '@anthropic-ai/sdk'
import { query as sdkQuery, type HookCallback, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { AiEffort, Usage } from '../../../src/admin/core/contracts'
import { modelSupportsEffort } from '../../../src/admin/core/contracts/engine'
import { credentialEnv, type ClaudeCredential } from './access'
import { fatalApiError, MODEL_UNAVAILABLE, RESULT_ERRORS, type QueryFn } from './agent'
import { addTokens, NO_TOKENS, tokensOf, usageFromTokens, type Tokens } from './cost'

/**
 * Passerelle simple vers Claude, pour Ask AI (G4, agent ask-ai en vague 2) : un appel, un texte, une consommation au
 * format du contrat (`Usage`). AUCUN outil, aucun fichier, aucune session gardée.
 *
 * - Clé API (`access.kind === 'api-key'`) : API Messages (`@anthropic-ai/sdk`), prompt système mis en cache
 *   (`cache_control` éphémère, 5 min : utile quand plusieurs questions se suivent ; ignoré sous le minimum du modèle).
 *   L'API ne renvoie que des jetons : le coût est calculé d'après les tarifs publiés (pricing.ts).
 * - Abonnement (développement seulement, voir resolveClaudeAccess) : Agent SDK `query()` SANS aucun outil
 *   (`tools: []`, `allowedTools: []`, hook qui refuse tout), `settingSources: []`, `strictMcpConfig`, aucun serveur MCP,
 *   `maxTurns: 1`, `persistSession: false`, prompt système PERSONNALISÉ (pas le preset Claude Code), env minimal.
 *   L'Agent SDK n'a pas de `max_tokens` : la borne passe par `CLAUDE_CODE_MAX_OUTPUT_TOKENS`. L'historique est rendu en
 *   transcription dans le message (le SDK ne prend pas de tours assistant en entrée).
 *
 * Modèle et effort (B5 · AI settings, FOLLOWUPS #47) : l'effort n'est envoyé que si le modèle le prend en charge
 * (`modelSupportsEffort` du contrat ; jamais pour Haiku 4.5, l'API refuserait) — `output_config.effort` pour l'API
 * Messages (GA, DANS output_config), option `effort` pour l'Agent SDK. JAMAIS de `thinking` (ni disabled, ni
 * budget_tokens : 400 sur Opus 5.5 et Fable 5.1, la réflexion y reste adaptative), ni temperature / top_p / top_k, ni
 * préremplissage (le dernier message est toujours la question). La réflexion compte dans les jetons de sortie : le
 * plafond (`maxTokens`) est choisi par l'appelant en conséquence (Ask AI : `askMaxTokens`).
 */

export type CompleteMessage = { role: 'user' | 'assistant'; content: string }

export type CompleteInput = {
  model: string
  /**
   * Niveau de réflexion voulu (B5 · AI settings). Transmis SEULEMENT si le modèle le prend en charge
   * (`modelSupportsEffort`) ; absent ou modèle sans effort : rien n'est envoyé (défaut du modèle).
   */
  effort?: AiEffort
  system: string
  /** Historique puis question ; le dernier message est celui de l'utilisateur. */
  messages: readonly CompleteMessage[]
  /** Plafond des jetons de SORTIE, réflexion comprise (`max_tokens`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`). */
  maxTokens: number
  signal?: AbortSignal
}

export type CompleteResult = {
  /**
   * Texte de la réponse. VIDE quand `stopReason` vaut `refusal` (le contenu n'est jamais lu) ou `max_tokens` (réponse
   * coupée : jamais montrée telle quelle). Vérifier `stopReason` AVANT de s'en servir.
   */
  text: string
  /** Consommation de l'appel, même refusé ou coupé (il a coûté) ; `model` = le modèle demandé. */
  usage: Usage
  /**
   * Raison d'arrêt : `end_turn` (ou `stop_sequence`… de l'API, sous-type du SDK sinon) ; `max_tokens` = plafond de
   * sortie atteint (réflexion comprise) ; `refusal` = Claude a refusé de répondre (classifieurs de sécurité).
   */
  stopReason: string
}

/** Raisons d'arrêt normalisées sans réponse utilisable (le texte est alors vide). */
export const STOP_REFUSAL = 'refusal'
export const STOP_MAX_TOKENS = 'max_tokens'

/** Effort à transmettre pour cet appel, ou undefined (absent, ou modèle qui ne le prend pas en charge). */
export function effortFor(input: Pick<CompleteInput, 'model' | 'effort'>): AiEffort | undefined {
  return input.effort && modelSupportsEffort(input.model) ? input.effort : undefined
}

/** Message d'erreur de Claude Code quand la sortie dépasse CLAUDE_CODE_MAX_OUTPUT_TOKENS (constaté le 2026-09-28). */
const OUTPUT_LIMIT = /exceeded the \d+ output token maximum/i

/** Échec d'un appel : message en anglais (il peut remonter jusqu'à l'admin), jamais le secret. */
export class CompleteError extends Error {
  constructor(
    message: string,
    /** Accès, facturation, modèle… : réessayer ne servira à rien. */
    readonly fatal = false,
  ) {
    super(message)
    this.name = 'CompleteError'
  }
}

/** Ce que complete() utilise du client de l'API Messages (injectable pour les tests). */
export type MessagesClient = {
  messages: {
    create: (body: Anthropic.MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal }) => PromiseLike<Anthropic.Message>
  }
}

export type CompleteDeps = {
  /** Identifiant résolu par resolveClaudeAccess (jamais relu dans process.env ici). */
  access: ClaudeCredential
  /** CLAUDE_CONFIG_DIR dédié, ABSOLU (chemin Agent SDK seulement ; sert aussi de dossier de travail vide). */
  configDir: string
  /** Fabrique du client Messages (tests : faux client). */
  anthropic?: (apiKey: string) => MessagesClient
  /** query() de l'Agent SDK (tests : faux flux). */
  query?: QueryFn
  /** Environnement de base pour PATH et HOME (tests). */
  base?: Readonly<Record<string, string | undefined>>
  now?: () => number
}

/** Délai d'un appel de l'API Messages (le SDK réessaie 2 fois les 408/409/429/5xx). */
const API_TIMEOUT_MS = 60_000

const textOf = (message: Anthropic.Message) =>
  message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
    .trim()

function apiErrorMessage(error: unknown): CompleteError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new CompleteError('Access refused by Anthropic: check the API key (Settings › Usage › Claude connection).', true)
  }
  // Modèle inconnu ou non inclus dans l'accès : il se choisit dans B5 · AI settings (message partagé avec l'éditeur).
  if (error instanceof Anthropic.NotFoundError) return new CompleteError(MODEL_UNAVAILABLE, true)
  if (error instanceof Anthropic.RateLimitError) return new CompleteError('Claude is busy (rate limit): try again in a moment.')
  if (error instanceof Anthropic.BadRequestError) return new CompleteError('Request refused by the Anthropic API.', true)
  if (error instanceof Anthropic.APIUserAbortError) return new CompleteError('Request stopped.')
  if (error instanceof Anthropic.APIError) return new CompleteError(`Claude could not answer (${error.status ?? 'network'}).`)
  return new CompleteError(`Claude could not answer: ${error instanceof Error ? error.message : String(error)}`)
}

/** Corps exact de la requête à l'API Messages (pur, testé) : jamais de `thinking`, de temperature ni de préremplissage. */
export function messagesBody(input: CompleteInput): Anthropic.MessageCreateParamsNonStreaming {
  const effort = effortFor(input)
  return {
    model: input.model,
    max_tokens: input.maxTokens,
    // Effort (GA) DANS output_config, jamais à la racine ; seulement pour un modèle qui le prend en charge.
    ...(effort ? { output_config: { effort } } : {}),
    // Préfixe stable (système) mis en cache ; la question et l'historique viennent après.
    system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
    messages: input.messages.map(({ role, content }) => ({ role, content })),
  }
}

async function viaApi(input: CompleteInput, deps: CompleteDeps, apiKey: string): Promise<CompleteResult> {
  const client = deps.anthropic?.(apiKey) ?? new Anthropic({ apiKey, timeout: API_TIMEOUT_MS })
  const started = (deps.now ?? Date.now)()
  let message: Anthropic.Message
  try {
    message = await client.messages.create(messagesBody(input), { signal: input.signal })
  } catch (error) {
    throw apiErrorMessage(error)
  }
  const usage = usageFromTokens(tokensOf(message.usage), { model: input.model, access: 'api-key', durationMs: (deps.now ?? Date.now)() - started, turns: 1 })
  const stopReason = message.stop_reason ?? 'end_turn'
  // Raison d'arrêt vérifiée AVANT le contenu : un refus n'est pas une réponse, une réponse coupée n'est jamais montrée.
  if (stopReason === STOP_REFUSAL || stopReason === STOP_MAX_TOKENS) return { text: '', usage, stopReason }
  return { text: textOf(message), usage, stopReason }
}

/** Historique rendu en transcription pour l'Agent SDK (données, jamais des consignes). */
export function transcriptPrompt(messages: readonly CompleteMessage[]): string {
  const last = messages.at(-1)
  if (!last || last.role !== 'user') throw new CompleteError('The last message must be the user’s question.')
  if (messages.length === 1) return last.content
  const history = messages
    .slice(0, -1)
    .map(({ role, content }) => `${role === 'user' ? 'User' : 'Assistant'}: ${content}`)
    .join('\n\n')
  return `Conversation so far (context only):\n\n${history}\n\nAnswer this last message from the user:\n${last.content}`
}

/** Hook de défense en profondeur : aucun outil, jamais. */
const denyAll: HookCallback = async () => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'No tool is available here.' },
})

/** Options exactes de query() pour une réponse sans outil (pures, testées). */
export function completeOptions(input: CompleteInput, deps: CompleteDeps, abortController: AbortController): Options {
  const base = deps.base ?? process.env
  const effort = effortFor(input)
  return {
    cwd: deps.configDir,
    model: input.model,
    // Seulement pour un modèle qui le prend en charge (jamais Haiku 4.5) ; jamais de `thinking`.
    ...(effort ? { effort } : {}),
    maxTurns: 1,
    tools: [],
    allowedTools: [],
    permissionMode: 'dontAsk',
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: {},
    persistSession: false,
    systemPrompt: input.system,
    hooks: { PreToolUse: [{ hooks: [denyAll] }] },
    abortController,
    // Environnement MINIMAL : jamais ...process.env, un seul identifiant.
    env: {
      PATH: base.PATH,
      HOME: base.HOME,
      ...credentialEnv(deps.access, base),
      CLAUDE_CONFIG_DIR: deps.configDir,
      CLAUDE_AGENT_SDK_CLIENT_APP: 'kuartz-ask-ai/0.1',
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(input.maxTokens),
    },
  }
}

async function viaAgentSdk(input: CompleteInput, deps: CompleteDeps): Promise<CompleteResult> {
  if (!deps.configDir || !path.isAbsolute(deps.configDir)) throw new CompleteError('CLAUDE_CONFIG_DIR must be an absolute path.', true)
  await mkdir(deps.configDir, { recursive: true })
  const query = deps.query ?? ((args) => sdkQuery(args))
  const abortController = new AbortController()
  const abort = () => abortController.abort()
  if (input.signal?.aborted) abort()
  input.signal?.addEventListener('abort', abort, { once: true })
  const started = (deps.now ?? Date.now)()
  let text = ''
  let result: CompleteResult | null = null
  // Claude Code signale un refus (`model_refusal_no_fallback`, stop_reason « refusal ») ou une sortie coupée
  // (`max_output_tokens`, « exceeded the N output token maximum ») par un message d'erreur : normalisés comme l'API.
  let refused = false
  let truncated = false
  try {
    for await (const message of query({ prompt: transcriptPrompt(input.messages), options: completeOptions(input, deps, abortController) }) as AsyncIterable<SDKMessage>) {
      if (message.type === 'system' && message.subtype === 'api_retry') {
        const fatal = fatalApiError(message.error, deps.access)
        if (fatal) throw new CompleteError(fatal, true)
      } else if (message.type === 'system' && message.subtype === 'model_refusal_no_fallback') {
        refused = true
      } else if (message.type === 'assistant') {
        if (message.error === 'max_output_tokens') {
          // Texte d'erreur de Claude Code, pas une réponse du modèle.
          truncated = true
          continue
        }
        const fatal = message.error ? fatalApiError(message.error, deps.access) : null
        if (fatal) throw new CompleteError(fatal, true)
        for (const block of message.message.content) if (block.type === 'text') text = block.text.trim() || text
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
        const usage = usageFromTokens(tokens, {
          model: input.model,
          access: 'subscription',
          durationMs: (deps.now ?? Date.now)() - started,
          ...(Number.isFinite(reported) && reported >= 0 ? { costUsd: reported } : {}),
          turns: message.num_turns ?? 1,
        })
        // Texte de fin (succès) ou erreurs du SDK (défensif : un producteur plus ancien peut omettre `errors`).
        const said = message.subtype === 'success' ? (message.result ?? '') : ((message.errors as string[] | undefined) ?? []).join(' ')
        if (message.stop_reason === STOP_REFUSAL) refused = true
        if (message.stop_reason === STOP_MAX_TOKENS || OUTPUT_LIMIT.test(said)) truncated = true
        // Refus ou sortie coupée : aucun texte n'est lu, la consommation reste comptée.
        if (refused || truncated) {
          result = { text: '', usage, stopReason: refused ? STOP_REFUSAL : STOP_MAX_TOKENS }
          continue
        }
        if (message.subtype !== 'success' || message.is_error) {
          const reason = message.subtype === 'success' ? message.result || 'Claude reported an error.' : (RESULT_ERRORS[message.subtype] ?? message.subtype)
          throw new CompleteError(reason)
        }
        result = { text: message.result?.trim() || text, usage, stopReason: message.subtype }
      }
    }
  } catch (error) {
    if (error instanceof CompleteError) throw error
    if (input.signal?.aborted) throw new CompleteError('Request stopped.')
    throw new CompleteError(`Claude could not answer: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    input.signal?.removeEventListener('abort', abort)
    // Ne jamais laisser tourner le processus Claude Code.
    abortController.abort()
  }
  if (!result) throw new CompleteError(input.signal?.aborted ? 'Request stopped.' : 'Claude stopped without an answer.')
  return result
}

/** Fabrique une passerelle liée à un accès (le moteur la crée une fois au démarrage). */
export function createComplete(deps: CompleteDeps): (input: CompleteInput) => Promise<CompleteResult> {
  return async (input) => {
    if (!input.messages.length || input.messages.at(-1)?.role !== 'user') {
      throw new CompleteError('The last message must be the user’s question.')
    }
    if (!Number.isInteger(input.maxTokens) || input.maxTokens < 1) throw new CompleteError('maxTokens must be a positive integer.')
    return deps.access.kind === 'api-key' ? viaApi(input, deps, deps.access.secret) : viaAgentSdk(input, deps)
  }
}

/** `complete({ model, system, messages, maxTokens }, deps)` → `{ text, usage, stopReason }`. */
export const complete = (input: CompleteInput, deps: CompleteDeps) => createComplete(deps)(input)

