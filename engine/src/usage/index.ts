import type { EngineContext, EngineModule } from '../server/modules'
import { createUsageJournal, type UsageJournal } from './journal'

/**
 * Module du journal de consommation IA : pose `ports.usage` (appelé par l'éditeur à la fin de chaque demande) et
 * rejoue au démarrage le journal local de secours. Branché dans `MODULES` de engine/src/main.ts, AVANT ask-ai.
 */

const journals = new WeakMap<EngineContext, UsageJournal>()

/** Journal d'un moteur démarré : ask-ai y écrit ses documents (`record(askUsageDoc(...))`). null avant ce module. */
export const getUsageJournal = (context: EngineContext): UsageJournal | null => journals.get(context) ?? null

export function createUsageModule(options: { log?: (line: string) => void } = {}): EngineModule {
  return {
    name: 'usage',
    register(context) {
      const log = options.log ?? ((line: string) => console.log(line))
      const journal = createUsageJournal({ sanity: context.sanity, dataDir: context.config.paths.data, log })
      context.ports.usage = journal.recorder
      journals.set(context, journal)
      // Rejeu en arrière-plan : le démarrage n'attend pas Sanity.
      void journal.flush().catch((error) => log(`[usage] replay failed: ${error instanceof Error ? error.message : String(error)}`))
    },
  }
}

export const usageModule: EngineModule = createUsageModule()

export { askUsageDoc, createUsageJournal, isAiUsageDoc, PENDING_FILE, usageDocFromJob, usageDocId } from './journal'
export type { UsageJournal } from './journal'
