import { randomBytes } from 'node:crypto'
import type { AdminConfig, AiEffort, AskResponse, EngineUser } from '../../../src/admin/core/contracts'
import { CompleteError, STOP_MAX_TOKENS, STOP_REFUSAL, type CompleteInput, type CompleteResult } from '../claude'
import { EngineError, badRequest, unavailable } from '../server/errors'
import { screenOf } from '../../../src/admin/features/ask-ai/links'
import { finalizeAnswer, siteDomains } from './answer'
import { buildSiteData, renderSiteData, type AskReader, type AskSiteData } from './context'
import { ASK_SYSTEM, askMaxTokens, buildAskMessages } from './prompt'
import { parseAskRequest } from './request'
import type { AskUsageEntry, AskUsageRecorder } from './usage'

/**
 * Service Ask AI (G4) : une question → une réponse courte, en lecture seule. Aucun outil, aucune écriture hormis le
 * journal de consommation (feature `ask`). Indépendant du verrou de l'éditeur (Ask ne touche ni git ni brouillon).
 * Modèle et effort : ceux de TOUTE l'IA du site (B5 · AI settings, FOLLOWUPS #47), relus à chaque question.
 */

export type AskComplete = (input: CompleteInput) => Promise<CompleteResult>

export type AskServiceDeps = {
  /** Manifeste du site (`src/admin.config.ts`). */
  config: AdminConfig
  /** `createComplete({ access, configDir })` d'engine-claude ; null = accès Claude absent (503). */
  complete: AskComplete | null
  /**
   * Modèle de l'IA du site, LU À CHAQUE QUESTION : `askModule` passe un ACCESSEUR sur `context.settings` (B5 · AI
   * settings, sinon EDITOR_MODEL) — un choix enregistré dans l'admin sert dès la question suivante, sans redémarrage.
   * Il fixe aussi le plafond de sortie (`askMaxTokens`).
   */
  model: string
  /**
   * Effort de l'IA du site, lu à chaque question (même accesseur). Transmis à `complete`, qui ne l'envoie à Claude que
   * si le modèle le prend en charge (jamais pour Haiku 4.5).
   */
  effort?: AiEffort
  /** Lecture Sanity avec le jeton de LECTURE ; null = contexte tiré du manifeste seul. */
  reader: AskReader | null
  usage?: AskUsageRecorder | null
  now?: () => Date
  log?: (line: string) => void
  /** Réutilisation des données du site entre deux questions rapprochées (défaut 30 s). */
  cacheMs?: number
  /** Limite de débit par utilisateur (défaut : 20 questions / 10 min). */
  rateLimit?: { max: number; windowMs: number }
  /** Plafond de sortie imposé (tests) ; défaut : `askMaxTokens(model)`, selon le modèle de la question. */
  maxTokens?: number
}

export const ASK_MESSAGES = {
  noAccess: 'Ask AI isn’t available: Claude isn’t configured on the AI engine.',
  inFlight: 'Wait for the answer to your previous question.',
  rateLimited: 'Too many questions in a few minutes. Try again shortly.',
  failed: 'Ask AI couldn’t answer. Try again in a moment.',
  /** Claude a refusé de répondre (`stop_reason: refusal`) : réponse à la place de la sienne, jamais lue. */
  declined: 'Claude declined to answer this question. Try asking it another way.',
  /** Plafond de sortie atteint (`max_tokens`, réflexion comprise) : la réponse coupée n'est jamais montrée. */
  cutOff: 'The answer was cut off: Claude hit its length limit. Ask a shorter, more precise question.',
} as const

/** Réponse de remplacement quand Claude n'a rien donné d'utilisable (refus, plafond de sortie), sinon null. */
function noAnswerText(stopReason: string): string | null {
  if (stopReason === STOP_REFUSAL) return ASK_MESSAGES.declined
  if (stopReason === STOP_MAX_TOKENS) return ASK_MESSAGES.cutOff
  return null
}

export type AskService = {
  ask(user: EngineUser, body: unknown, signal?: AbortSignal): Promise<AskResponse>
}

const newRequestId = () => `ask_${randomBytes(8).toString('hex')}`

export function createAskService(deps: AskServiceDeps): AskService {
  const now = deps.now ?? (() => new Date())
  const cacheMs = deps.cacheMs ?? 30_000
  const limit = deps.rateLimit ?? { max: 20, windowMs: 10 * 60_000 }
  const inFlight = new Set<string>()
  const recent = new Map<string, number[]>()
  const cache = new Map<string, { at: number; data: Promise<AskSiteData> }>()
  // Seuls domaines laissés dans une réponse (SEC-08) : ceux du site.
  const allowedDomains = siteDomains(deps.config.site)

  /** Données du site par rôle (les écrans permis en dépendent), réutilisées `cacheMs`. */
  function siteData(user: EngineUser, screen: string | undefined): Promise<AskSiteData> {
    const at = now().getTime()
    const cached = cache.get(user.role)
    let data: Promise<AskSiteData>
    if (cached && at - cached.at < cacheMs) data = cached.data
    else {
      data = buildSiteData({ config: deps.config, role: user.role, reader: deps.reader, log: deps.log })
      cache.set(user.role, { at, data })
      data.catch(() => cache.delete(user.role))
    }
    // L'écran ouvert change à chaque question : recalculé sur les données en cache.
    return data.then((d) => ({ ...d, screen: screenOf(d.routes, screen) }))
  }

  function checkRate(userId: string) {
    const at = now().getTime()
    const times = (recent.get(userId) ?? []).filter((t) => at - t < limit.windowMs)
    if (times.length >= limit.max) throw new EngineError(409, 'busy', ASK_MESSAGES.rateLimited)
    times.push(at)
    recent.set(userId, times)
  }

  return {
    async ask(user, body, signal) {
      const parsed = parseAskRequest(body)
      if (!parsed.ok) throw badRequest(parsed.error)
      if (!deps.complete) throw unavailable(ASK_MESSAGES.noAccess)
      if (inFlight.has(user.id)) throw new EngineError(409, 'busy', ASK_MESSAGES.inFlight)
      checkRate(user.id)
      inFlight.add(user.id)
      try {
        const { question, history, screen } = parsed.request
        // Réglages de l'IA lus UNE fois par question (accesseurs de askModule) : modèle, effort, plafond de sortie.
        const model = deps.model
        const effort = deps.effort
        const data = await siteData(user, screen)
        const messages = buildAskMessages({ history, question, siteData: renderSiteData(data) })
        let result: CompleteResult
        try {
          result = await deps.complete({
            model,
            ...(effort ? { effort } : {}),
            system: ASK_SYSTEM,
            messages,
            maxTokens: deps.maxTokens ?? askMaxTokens(model),
            signal,
          })
        } catch (error) {
          if (error instanceof CompleteError) {
            deps.log?.(`ask: ${error.fatal ? 'fatal' : 'error'} — ${error.message}`)
            throw unavailable(error.message || ASK_MESSAGES.failed)
          }
          deps.log?.(`ask: unexpected error (${error instanceof Error ? error.name : 'error'})`)
          throw unavailable(ASK_MESSAGES.failed)
        }
        // Raison d'arrêt vérifiée AVANT le texte : un refus ou une réponse coupée n'est jamais montré ; un message clair
        // le remplace, et la consommation (l'appel a coûté) est journalisée « failed ».
        const noAnswer = noAnswerText(result.stopReason)
        let response: AskResponse
        let status: AskUsageEntry['status']
        if (noAnswer) {
          deps.log?.(`ask: no usable answer from ${model} (${result.stopReason})`)
          response = { answer: noAnswer, links: [], refusedChange: false, usage: result.usage }
          status = 'failed'
        } else {
          const screenPageId = data.screen?.href.match(/^\/admin\/(?:pages\/|editor\?page=)([A-Za-z0-9_-]+)/)?.[1] ?? null
          const final = finalizeAnswer(result.text, data.routes, {
            editorPageIds: data.pages.filter((p) => p.aiEditor).map((p) => p.id),
            screenPageId,
            allowedDomains,
          })
          response = { ...final, usage: result.usage }
          status = final.refusedChange ? 'refused' : 'answered'
        }
        if (deps.usage) {
          // Le journal ne bloque jamais la réponse : l'appel a déjà coûté, le client doit la voir.
          await deps.usage
            .recordAsk({
              requestId: newRequestId(),
              user,
              usage: result.usage,
              status,
              ...(screen ? { page: screen.split('?')[0] } : {}),
              createdAt: now().toISOString(),
            })
            .catch((error: unknown) => deps.log?.(`ask: usage not recorded (${error instanceof Error ? error.name : 'error'})`))
        }
        return response
      } finally {
        inFlight.delete(user.id)
      }
    },
  }
}
