import type { AiSettingsService } from '../access/ai-settings'
import type { ClaudeAccessService } from '../access/service'
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
  /**
   * Accès Claude RÉEL en cours, relu à chaque lecture (accesseur sur `claudeAccess.current()`) : un changement fait depuis
   * l'admin s'applique sans redémarrage. Lire `context.access` AU MOMENT de l'appel, jamais le copier à l'enregistrement.
   */
  readonly access: AccessResult
  /** Connexion à Claude rechargeable (engine/src/access) : routes `/claude/access*`, test de connexion. */
  claudeAccess: ClaudeAccessService
  /** Réglages de l'IA rechargeables (modèle et effort de toute l'IA du site : éditeur et Ask AI, B5) : `/claude/settings`. */
  aiSettings: AiSettingsService
  /**
   * Réglages de l'agent EN COURS (accesseur : modèle et effort suivent `aiSettings`). Lire au moment de l'appel, jamais
   * copier à l'enregistrement d'un module : Ask AI y lit son modèle et son effort à chaque question.
   */
  readonly settings: AgentSettings
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
  /**
   * Arrêt du moteur (facultatif) : appelé après la fermeture du serveur et l'arrêt de la demande en cours, AVANT l'écriture
   * finale du magasin ; ordre inverse de l'enregistrement ; 30 s au plus chacun. Pour finir proprement un travail en cours.
   */
  stop?(context: EngineContext): void | Promise<void>
}
