import type { AiUsageDoc, EngineUser, Usage } from '../../../src/admin/core/contracts'

/**
 * Journal de consommation d'Ask AI (B5, pied « This month: … ») : un document Sanity PRIVÉ `aiUsage.<id>` par réponse,
 * feature `ask` (contrat `AiUsageDoc`).
 *
 * Le journal appartient à engine-publish (`engine/src/usage`) : le module Ask reçoit un `AskUsageRecorder` (port). Tant
 * qu'engine-publish n'en fournit pas, `sanityAskUsageRecorder` écrit le document lui-même, au format exact du contrat.
 */

export type AskUsageEntry = {
  requestId: string
  user: EngineUser
  usage: Usage
  /**
   * answered | refused (demande de modification refusée) | failed (Claude a refusé de répondre ou a atteint son plafond
   * de sortie : l'appel a coûté, rien d'utilisable n'est montré ; B5 affiche « Question · Failed »).
   */
  status: 'answered' | 'refused' | 'failed'
  /** Écran de l'admin ouvert (« /admin/media »). */
  page?: string
  createdAt: string
}

export type AskUsageRecorder = { recordAsk(entry: AskUsageEntry): Promise<void> }

/** Document du contrat pour une réponse d'Ask AI. */
export function askUsageDoc(entry: AskUsageEntry): AiUsageDoc {
  return {
    _id: `aiUsage.${entry.requestId}`,
    _type: 'aiUsage',
    feature: 'ask',
    requestId: entry.requestId,
    status: entry.status,
    ...(entry.page ? { page: entry.page } : {}),
    user: { id: entry.user.id, name: entry.user.name, role: entry.user.role },
    createdAt: entry.createdAt,
    ...entry.usage,
  }
}

/** Écriture minimale (port Sanity du robot : `createIfNotExists`). */
export type UsageWriter = { createIfNotExists(doc: { _id: string; _type: string; [key: string]: unknown }): Promise<void> }

export function sanityAskUsageRecorder(writer: UsageWriter): AskUsageRecorder {
  return { recordAsk: (entry) => writer.createIfNotExists(askUsageDoc(entry)) }
}
