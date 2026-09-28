import type { Session } from '../../core/contracts/session'
import type { EngineHealth } from '../../core/contracts/engine'

/**
 * Données de l'en-tête et du pied du panneau Ask AI (G4), côté SERVEUR : modèle EN COURS (santé du moteur :
 * `claude.askModel`, ex. « Opus 5.5 » — le modèle choisi dans B5 · AI settings, commun à l'éditeur et à Ask AI depuis le
 * 2026-09-28, FOLLOWUPS #47 ; un moteur resté sur l'ancien code y met ASK_MODEL, ce qu'il utilise vraiment ; repli sur
 * `editorModel` si le champ manque) et consommation IA du mois de tout le site (« This month: … », B5). Relu à chaque
 * ouverture du panneau et après chaque réponse (useAskConversation).
 * Logique à dépendances injectées (testée sans Next) ; la server action (`actions.ts`) la lie aux vrais modules.
 * Rien de sensible dans le résultat : id public de l'utilisateur (pour rattacher la conversation de session), rôle,
 * modèle, totaux.
 */

/**
 * Totaux du mois (`UsageSummary.totals` de core/usage) : `costUsd` = FACTURÉ seulement ; `includedUsd` = demandes
 * passées par l'abonnement Claude (prix de l'API, non facturées).
 */
export type AskAiTotals = { inputTokens: number; outputTokens: number; costUsd: number; includedUsd?: number }

export type AskAiInfo =
  | { ok: true; userId: string; model: string | null; month: AskAiTotals | null }
  | { ok: false; code: 'unauthorized' | 'forbidden' | 'internal'; error: string }

export type AskAiInfoDeps = {
  requireSession: () => Promise<Session>
  health: (session: Session) => Promise<EngineHealth>
  monthTotals: () => Promise<AskAiTotals>
  log?: (line: string) => void
}

export const INFO_MESSAGES = {
  unauthorized: 'Your session has expired. Reload the page to log in again.',
  forbidden: 'You don’t have access to Ask AI.',
  internal: 'Ask AI couldn’t load. Reload the page.',
} as const

function authCode(err: unknown): 'unauthorized' | 'forbidden' | null {
  const e = err as { name?: string; status?: number } | null
  if (e?.name !== 'AdminAuthError') return null
  return e.status === 403 ? 'forbidden' : 'unauthorized'
}

export async function loadAskAiInfo(deps: AskAiInfoDeps): Promise<AskAiInfo> {
  let session: Session
  try {
    session = await deps.requireSession()
  } catch (err) {
    const code = authCode(err)
    if (code) return { ok: false, code, error: INFO_MESSAGES[code] }
    deps.log?.(`[admin/ask-ai] info failed: ${err instanceof Error ? err.message : String(err)}`)
    return { ok: false, code: 'internal', error: INFO_MESSAGES.internal }
  }
  // Moteur injoignable ou journal illisible : le panneau reste utilisable, sans modèle ni pied.
  const [health, month] = await Promise.allSettled([deps.health(session), deps.monthTotals()])
  if (month.status === 'rejected') deps.log?.(`[admin/ask-ai] month usage unavailable: ${month.reason instanceof Error ? month.reason.message : 'error'}`)
  const model = health.status === 'fulfilled' ? health.value.claude?.askModel || health.value.claude?.editorModel || null : null
  const totals =
    month.status === 'fulfilled'
      ? {
          inputTokens: month.value.inputTokens,
          outputTokens: month.value.outputTokens,
          costUsd: month.value.costUsd,
          includedUsd: month.value.includedUsd ?? 0,
        }
      : null
  return { ok: true, userId: session.user.id, model, month: totals }
}
