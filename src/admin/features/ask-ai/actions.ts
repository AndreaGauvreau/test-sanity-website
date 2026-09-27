'use server'

import { requireCapability } from '@/admin/core/auth/session'
import type { EngineHealth } from '@/admin/core/contracts'
import { engineFetch } from '@/admin/core/engine/server'
import { getUsageSummary } from '@/admin/core/usage'

import { loadAskAiInfo, type AskAiInfo } from './info'

/**
 * Server action du panneau Ask AI (G4) : modèle (santé du moteur) + consommation IA du mois (`getUsageSummary('month')`
 * de core/usage). `requireCapability('ai.ask', 'action')` EN PREMIER ; aucune entrée (rien à valider).
 * Les questions, elles, passent par le relais du moteur (`engineClient.ask`, droit `ai.ask` vérifié au relais ET au moteur).
 */
export async function getAskAiInfo(): Promise<AskAiInfo> {
  return loadAskAiInfo({
    requireSession: () => requireCapability('ai.ask', 'action'),
    health: (session) => engineFetch<EngineHealth>(session, 'GET', 'health'),
    monthTotals: async () => (await getUsageSummary('month')).totals,
    log: (line) => console.error(line),
  })
}
