import type { AccessResult, AgentSettings } from '../claude'
import type { EngineConfig } from '../config'
import type { SanityPort } from '../content/sanity'
import type { TextStore } from '../content/texts'
import type { WorkRepo } from '../git/git'
import type { EngineLock } from '../jobs/lock'
import type { EditorService } from '../jobs/service'
import type { UsageRecorder } from '../jobs/types'
import type { PreviewProcess } from '../preview/process'
import type { EngineStore } from '../store/store'
import type { Router } from './http'

/**
 * Point d'extension du moteur : engine-publish (`/publish`, `/versions`, journal `aiUsage`) et ask-ai (`/ask`)
 * reçoivent ce contexte au démarrage (main.ts) et y ajoutent leurs routes et leurs ports.
 */
export type EngineContext = {
  config: EngineConfig
  router: Router
  store: EngineStore
  repo: WorkRepo
  lock: EngineLock
  editor: EditorService
  /** Port Sanity du robot (jeton d'écriture), null sans jeton. Publication : `publishDocument` / `discardDraft` de content/sanity.ts. */
  sanity: SanityPort | null
  texts: TextStore
  preview: PreviewProcess
  access: AccessResult
  settings: AgentSettings
  /** Ports que les modules branchent (appelés par l'éditeur). */
  ports: {
    /** Journal de consommation, appelé à la fin de chaque demande (engine-publish). */
    usage: UsageRecorder | null
    /** Nombre d'éléments à publier (« Validated — added to Publish (N changes) »). */
    pendingTotal: (() => Promise<number>) | null
  }
}

export type EngineModule = {
  name: string
  register(context: EngineContext): void | Promise<void>
}
