import type { EditJob } from '@/admin/core/contracts'
import { isActive, POLL_INTERVAL_MS } from './machine'

/**
 * Sondage d'une demande active (GET /editor/jobs/:id toutes les 900 ms, contrat engine.ts). Sans React, testable
 * avec des minuteurs simulés.
 *
 * Leçons du POC (§ 5.5) : les erreurs de sondage ne sont JAMAIS avalées (onError à chaque échec, avec le nombre
 * d'échecs consécutifs ; onRecovered au retour) ; un seul appel en vol à la fois (minuteur relancé APRÈS la réponse,
 * jamais setInterval) ; arrêt propre (abort de l'appel en vol + minuteur annulé) ; recul progressif en cas d'échec
 * (900 ms → 5 s au plus) ; arrêt de lui-même quand la demande n'est plus active ou n'existe plus (404).
 */

export type PollerError = { status?: number; code?: string; message?: string }

export type JobPollerOptions = {
  jobId: string
  fetchJob: (jobId: string, signal: AbortSignal) => Promise<EditJob>
  onJob: (job: EditJob) => void
  onError: (error: unknown, consecutiveFailures: number) => void
  onRecovered?: () => void
  /** Appelé une fois quand le sondage s'arrête de lui-même (demande terminée ou introuvable). */
  onSettled?: (job: EditJob | null) => void
  interval?: number
  maxBackoff?: number
  /** Premier appel tout de suite (rechargement de page) plutôt qu'après un intervalle. */
  immediate?: boolean
}

export function isNotFound(error: unknown): boolean {
  const e = error as PollerError | null
  return !!e && (e.status === 404 || e.code === 'not_found')
}

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError'
}

/** Démarre le sondage ; renvoie la fonction d'arrêt (idempotente). */
export function startJobPolling(options: JobPollerOptions): () => void {
  const interval = options.interval ?? POLL_INTERVAL_MS
  const maxBackoff = options.maxBackoff ?? 5_000
  let stopped = false
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null

  const settle = (job: EditJob | null) => {
    if (stopped) return
    stopped = true
    options.onSettled?.(job)
  }

  const schedule = (delay: number) => {
    if (stopped) return
    timer = setTimeout(tick, delay)
  }

  async function tick() {
    timer = null
    if (stopped) return
    controller = new AbortController()
    try {
      const job = await options.fetchJob(options.jobId, controller.signal)
      if (stopped) return
      if (failures > 0) {
        failures = 0
        options.onRecovered?.()
      }
      options.onJob(job)
      if (isActive(job)) schedule(interval)
      else settle(job)
    } catch (error) {
      if (stopped || isAbort(error)) return
      failures += 1
      options.onError(error, failures)
      if (isNotFound(error)) settle(null)
      else schedule(Math.min(interval * 2 ** (failures - 1), maxBackoff))
    } finally {
      controller = null
    }
  }

  schedule(options.immediate ? 0 : interval)

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
    controller?.abort()
    controller = null
  }
}
