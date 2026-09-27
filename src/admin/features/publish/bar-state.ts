import type { PublishState, PublishStatus } from '@/admin/core/contracts/engine'

import { formatClock } from './format'

/**
 * Machine d'états de la barre du haut (G3). PUR, testé.
 *
 * Les 5 états du Figma (G3, textes exacts) :
 * 1. idle        « Everything is published. »                          Publish grisé
 * 2. pending     « Unpublished changes: N »                            Publish actif, « Review › » ouvre E1
 * 3. publishing  « Publishing… step x / 4 »                            « Publishing… », clics ignorés
 * 4. published   « Published at HH:MM »                                « ✓ Published » (confirmation), puis 1 ou 2
 * 5. failed      « Publish failed — previous version still live »      « See error » + « Retry »
 *
 * Le compteur N = brouillons de contenu + modifications IA validées (même liste qu'en E1) : `pending.total`.
 */

/** Durée de l'état « Published » après la fin d'une publication (Figma, Publish button : « confirmation 3 s »). */
export const PUBLISHED_HOLD_MS = 3000

export const BAR_TEXT = {
  idle: 'Everything is published.',
  pending: (n: number) => `Unpublished changes: ${n}`,
  publishing: (step: number) => `Publishing… step ${step} / 4`,
  published: (clock: string) => (clock ? `Published at ${clock}` : 'Published just now.'),
  failed: 'Publish failed — previous version still live',
  loading: 'Checking what’s waiting to be published…',
} as const

export type BarView = {
  /** État visuel (TopBar + PublishButton). */
  state: PublishState
  /** Texte d'état à gauche. */
  text: string
  /** Compteur (« Unpublished changes: N »). */
  count: number
  /** « See error » (échec seulement, quand le moteur a donné un message). */
  showSeeError: boolean
  /** Publish cliquable (état pending seulement). */
  canPublish: boolean
  /** Fin de l'affichage « Published » (ms epoch), pour rafraîchir l'affichage à ce moment-là. */
  publishedUntil?: number
}

/**
 * Vue de la barre d'après l'état partagé du moteur. `status` null = pas encore reçu (chargement ou erreur).
 */
export function deriveBarView(status: PublishStatus | null, now: number = Date.now()): BarView {
  if (!status) {
    return { state: 'idle', text: BAR_TEXT.loading, count: 0, showSeeError: false, canPublish: false }
  }
  const count = Math.max(0, status.pending.total)
  switch (status.state) {
    case 'publishing':
      return {
        state: 'publishing',
        text: BAR_TEXT.publishing(clampStep(status.run?.step)),
        count,
        showSeeError: false,
        canPublish: false,
      }
    case 'failed':
      return { state: 'failed', text: BAR_TEXT.failed, count, showSeeError: !!status.run?.error, canPublish: false }
    case 'published': {
      const finished = Date.parse(status.run?.finishedAt ?? status.lastPublishedAt ?? '')
      const until = Number.isFinite(finished) ? finished + PUBLISHED_HOLD_MS : NaN
      if (count === 0 && Number.isFinite(until) && now < until) {
        return {
          state: 'published',
          text: BAR_TEXT.published(formatClock(finished)),
          count: 0,
          showSeeError: false,
          canPublish: false,
          publishedUntil: until,
        }
      }
      // Après la confirmation : retour à l'état 1, ou 2 si de nouveaux brouillons sont arrivés.
      return restingView(count)
    }
    case 'pending':
    case 'idle':
      return restingView(count)
  }
}

function restingView(count: number): BarView {
  return count > 0
    ? { state: 'pending', text: BAR_TEXT.pending(count), count, showSeeError: false, canPublish: true }
    : { state: 'idle', text: BAR_TEXT.idle, count: 0, showSeeError: false, canPublish: false }
}

function clampStep(step: number | undefined): number {
  if (!step || !Number.isFinite(step)) return 1
  return Math.min(4, Math.max(1, Math.round(step)))
}

/** Ids affichés à publier (`expected` de POST /publish) : contenus puis modifications IA, dans l'ordre de E1. */
export function expectedIds(status: PublishStatus | null): string[] {
  if (!status) return []
  return [...status.pending.content.map((c) => c.id), ...status.pending.design.map((d) => d.changeId)]
}

/** Intervalle de sondage de GET /publish/status : ~1 s pendant une publication, ~5 s au repos. */
export const POLL_IDLE_MS = 5000
export const POLL_ACTIVE_MS = 1000
/** Après une erreur de lecture : on réessaie moins souvent (le message reste affiché). */
export const POLL_ERROR_MS = 8000

export function pollDelay(status: PublishStatus | null, failed: boolean): number {
  if (failed) return POLL_ERROR_MS
  return status?.state === 'publishing' ? POLL_ACTIVE_MS : POLL_IDLE_MS
}
