import type { PublishStatus } from '@/admin/core/contracts/engine'

import { pollDelay } from './bar-state'

/**
 * État partagé de la publication côté navigateur : UN seul sondage de GET /publish/status pour toute la page
 * (Top bar G3 + écrans E1 / E2), ~5 s au repos, ~1 s pendant une publication. Le sondage ne tourne que tant
 * qu'au moins un composant est abonné, et se met en pause quand l'onglet est caché (reprise immédiate au retour).
 *
 * Les erreurs de lecture ne sont jamais avalées : `error` porte le message anglais du moteur (ou du relais) et la
 * dernière valeur connue est gardée. Fabrique pure (dépendances injectées) : testée sans navigateur.
 */

export type PublishSnapshot = {
  status: PublishStatus | null
  /** Message de la dernière lecture en échec (null après une lecture réussie). */
  error: string | null
  /** Horodatage de la dernière lecture réussie (ms). */
  fetchedAt: number | null
}

export type StatusStoreDeps = {
  fetchStatus: (signal: AbortSignal) => Promise<PublishStatus>
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  now?: () => number
  /** Onglet visible (document.visibilityState). Absent : toujours visible. */
  isVisible?: () => boolean
  /** Abonnement au changement de visibilité ; renvoie la fonction de désabonnement. */
  onVisibilityChange?: (listener: () => void) => () => void
  errorMessage?: (err: unknown) => string
}

export type PublishStatusStore = {
  get(): PublishSnapshot
  subscribe(listener: () => void): () => void
  /** Relit l'état tout de suite (lectures simultanées regroupées). */
  refresh(): Promise<void>
  /** Pose un état reçu d'ailleurs (réponse d'une action, rendu serveur) s'il n'est pas plus ancien. */
  set(status: PublishStatus): void
  /** État initial rendu par le serveur : posé seulement si le magasin n'a encore rien. */
  seed(status: PublishStatus): void
}

const DEFAULT_ERROR = "Couldn't read the publish status. Retrying…"

export function createPublishStatusStore(deps: StatusStoreDeps): PublishStatusStore {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const now = deps.now ?? (() => Date.now())
  const isVisible = deps.isVisible ?? (() => true)
  const errorMessage = deps.errorMessage ?? ((err: unknown) => (err instanceof Error && err.message) || DEFAULT_ERROR)

  let snapshot: PublishSnapshot = { status: null, error: null, fetchedAt: null }
  const listeners = new Set<() => void>()
  let timer: unknown = null
  let inFlight: Promise<void> | null = null
  let controller: AbortController | null = null
  let stopVisibility: (() => void) | null = null
  /** Numéro de version des écritures : une lecture partie avant un `set` ne l'écrase pas. */
  let generation = 0

  function emit(next: PublishSnapshot) {
    snapshot = next
    for (const listener of listeners) listener()
  }

  function schedule() {
    if (timer !== null) clearTimer(timer)
    timer = null
    if (listeners.size === 0) return
    timer = setTimer(() => {
      timer = null
      if (!isVisible()) return // reprise par l'écouteur de visibilité
      void refresh()
    }, pollDelay(snapshot.status, snapshot.error !== null))
  }

  function refresh(): Promise<void> {
    if (inFlight) return inFlight
    controller = new AbortController()
    const startedAt = generation
    const ctrl = controller
    // Promise.resolve().then : une exception synchrone du client devient un rejet (message affiché).
    const request: Promise<void> = Promise.resolve()
      .then(() => deps.fetchStatus(ctrl.signal))
      .then(
        (status) => {
          if (generation !== startedAt) return
          emit({ status, error: null, fetchedAt: now() })
        },
        (err: unknown) => {
          if (ctrl.signal.aborted) return
          if (generation !== startedAt) return
          emit({ ...snapshot, error: errorMessage(err) })
        },
      )
      .finally(() => {
        // Seulement si c'est encore la lecture courante (un arrêt / redémarrage a pu en lancer une autre).
        if (inFlight !== request) return
        inFlight = null
        if (controller === ctrl) controller = null
        schedule()
      })
    inFlight = request
    return request
  }

  function start() {
    stopVisibility =
      deps.onVisibilityChange?.(() => {
        if (isVisible() && listeners.size > 0) void refresh()
      }) ?? null
    void refresh()
  }

  function stop() {
    if (timer !== null) clearTimer(timer)
    timer = null
    controller?.abort()
    controller = null
    inFlight = null
    stopVisibility?.()
    stopVisibility = null
  }

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) start()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
    refresh,
    set(status) {
      generation += 1
      emit({ status, error: null, fetchedAt: now() })
      // Une publication qui démarre doit être suivie à ~1 s tout de suite.
      if (listeners.size > 0 && !inFlight) schedule()
    },
    seed(status) {
      if (snapshot.status) return
      emit({ status, error: null, fetchedAt: now() })
    },
  }
}
