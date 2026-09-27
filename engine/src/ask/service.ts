import { randomBytes } from 'node:crypto'
import type { AdminConfig, AskResponse, EngineUser } from '../../../src/admin/core/contracts'
import { CompleteError, type CompleteInput, type CompleteResult } from '../claude'
import { EngineError, badRequest, unavailable } from '../server/errors'
import { screenOf } from '../../../src/admin/features/ask-ai/links'
import { finalizeAnswer } from './answer'
import { buildSiteData, renderSiteData, type AskReader, type AskSiteData } from './context'
import { ASK_MAX_TOKENS, ASK_SYSTEM, buildAskMessages } from './prompt'
import { parseAskRequest } from './request'
import type { AskUsageRecorder } from './usage'

/**
 * Service Ask AI (G4) : une question → une réponse courte, en lecture seule. Aucun outil, aucune écriture hormis le
 * journal de consommation (feature `ask`). Indépendant du verrou de l'éditeur (Ask ne touche ni git ni brouillon).
 */

export type AskComplete = (input: CompleteInput) => Promise<CompleteResult>

export type AskServiceDeps = {
  /** Manifeste du site (`src/admin.config.ts`). */
  config: AdminConfig
  /** `createComplete({ access, configDir })` d'engine-claude ; null = accès Claude absent (503). */
  complete: AskComplete | null
  /** ASK_MODEL (claude-haiku-4-5-20251001 par défaut). */
  model: string
  /** Lecture Sanity avec le jeton de LECTURE ; null = contexte tiré du manifeste seul. */
  reader: AskReader | null
  usage?: AskUsageRecorder | null
  now?: () => Date
  log?: (line: string) => void
  /** Réutilisation des données du site entre deux questions rapprochées (défaut 30 s). */
  cacheMs?: number
  /** Limite de débit par utilisateur (défaut : 20 questions / 10 min). */
  rateLimit?: { max: number; windowMs: number }
  maxTokens?: number
}

export const ASK_MESSAGES = {
  noAccess: 'Ask AI isn’t available: Claude isn’t configured on the AI engine.',
  inFlight: 'Wait for the answer to your previous question.',
  rateLimited: 'Too many questions in a few minutes. Try again shortly.',
  failed: 'Ask AI couldn’t answer. Try again in a moment.',
} as const

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
        const data = await siteData(user, screen)
        const messages = buildAskMessages({ history, question, siteData: renderSiteData(data) })
        let result: CompleteResult
        try {
          result = await deps.complete({ model: deps.model, system: ASK_SYSTEM, messages, maxTokens: deps.maxTokens ?? ASK_MAX_TOKENS, signal })
        } catch (error) {
          if (error instanceof CompleteError) {
            deps.log?.(`ask: ${error.fatal ? 'fatal' : 'error'} — ${error.message}`)
            throw unavailable(error.message || ASK_MESSAGES.failed)
          }
          deps.log?.(`ask: unexpected error (${error instanceof Error ? error.name : 'error'})`)
          throw unavailable(ASK_MESSAGES.failed)
        }
        const screenPageId = data.screen?.href.match(/^\/admin\/(?:pages\/|editor\?page=)([A-Za-z0-9_-]+)/)?.[1] ?? null
        const final = finalizeAnswer(result.text, data.routes, {
          editorPageIds: data.pages.filter((p) => p.aiEditor).map((p) => p.id),
          screenPageId,
        })
        const response: AskResponse = { ...final, usage: result.usage }
        if (deps.usage) {
          // Le journal ne bloque jamais la réponse : l'appel a déjà coûté, le client doit la voir.
          await deps.usage
            .recordAsk({
              requestId: newRequestId(),
              user,
              usage: result.usage,
              status: final.refusedChange ? 'refused' : 'answered',
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
