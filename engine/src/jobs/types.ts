import type { EditJob, EngineHealth, EngineUser, PendingChange } from '../../../src/admin/core/contracts'
import type { AccessResult, AgentResult, AgentRun, AgentSettings } from '../claude'
import type { PreviewSignal } from '../content/visible'
import type { TextStore } from '../content/texts'
import type { WorkRepo } from '../git/git'
import type { DesignSystem } from '../guards/design-system'
import type { Preview } from '../guards/preview'
import type { EditorStore } from '../store/store'
import type { PublishLock } from './lock'

/**
 * Dépendances du service de l'éditeur, toutes injectées (tests : faux Claude, faux aperçu, faux Sanity, vrai git sur un
 * dépôt temporaire).
 */

/**
 * Lance Claude pour un essai. `limits.maxBudgetUsd` : plafond du SDK pour CET appel, réduit à ce qui reste du plafond
 * de la demande ; `limits.model` / `limits.effort` : réglages de la DEMANDE, lus à son départ (B5 · AI settings,
 * rechargement à chaud ; les deux essais d'une demande ont les mêmes). Le faux Claude d'engine-claude
 * (`createFakeAgent`) convient tel quel (il ignore `limits`).
 */
export type JobRunAgent = (run: AgentRun, limits: { maxBudgetUsd: number; model: string; effort: AgentSettings['effort'] }) => Promise<AgentResult>

/**
 * Port de consommation (implémenté par engine-publish : document `aiUsage`), appelé à la fin de CHAQUE demande servie
 * par le vrai Claude (jamais avec le faux Claude, `fakeClaude`).
 */
export type UsageRecorder = { record(input: { job: EditJob; change: PendingChange | null }): Promise<void> }

export type EditorDeps = {
  repo: WorkRepo
  store: EditorStore
  texts: TextStore
  /** Aperçu vu par les contrôles (chromePreview d'engine-guards, ou faux). */
  preview: Preview
  /** Signal « aperçu à jour » (texte visible, CSS recompilé). */
  signal: PreviewSignal
  /** État du processus d'aperçu : une demande est refusée (503) tant qu'il n'est pas prêt. Absent = toujours prêt. */
  previewReady?: () => boolean
  /**
   * URL et origine de l'aperçu pour l'iframe (EditorState.preview), émise pour CET utilisateur : l'URL porte un jeton
   * COURT (`signPreviewToken`, 15 min, SEC-09), jamais le secret racine ENGINE_PREVIEW_SECRET.
   */
  previewUrl: (page: string, user: EngineUser) => Promise<{ url: string; origin: string }>
  runAgent: JobRunAgent
  /** Résultat de resolveClaudeAccess (au démarrage). */
  access: AccessResult
  /**
   * Réglages de l'agent. main.ts passe un ACCESSEUR (modèle et effort choisis dans l'admin, B5) : `runEditJob` le lit
   * UNE fois au départ de chaque demande.
   */
  settings: AgentSettings
  /** Plafond du cumul d'une demande (tous essais), en dollars. */
  maxRequestUsd: number
  lock: PublishLock
  shotsDir: string
  health: () => Promise<EngineHealth>
  usage?: UsageRecorder
  /** Nombre d'éléments à publier (« Validated — added to Publish (N changes) ») : engine-publish ; défaut = modifications validées. */
  pendingTotal?: () => Promise<number>
  typecheck?: (repoDir: string) => Promise<string | null>
  loadDesignSystem?: (repoDir: string) => Promise<DesignSystem>
  listPages?: (repoDir: string) => Promise<string[]>
  /**
   * Faux Claude actif (ENGINE_FAKE_CLAUDE, mode local) : son scénario, affiché dans le journal de chaque demande et dans
   * le libellé du modèle de l'éditeur. Ses demandes ne passent JAMAIS au port `usage` (aucun document aiUsage : rien
   * n'a été consommé). null / absent : vrai Claude.
   */
  fakeClaude?: string | null
  /**
   * Domaines du site (`siteDomainsOf` de site.ts : `site.domain` + hôte de `site.url` du manifeste), seules adresses
   * gardées dans les textes montrés au client (questions, message final, journal ; SEC-08). Absent / vide : aucune.
   */
  siteDomains?: readonly string[]
  now?: () => Date
  log?: (line: string) => void
}

/** Messages finaux du contrat (anglais). */
export const FAILED_MESSAGE = 'Couldn’t apply — nothing was changed.'
export const STOPPED_MESSAGE = 'Stopped — nothing was changed.'
export const TIMEOUT_MESSAGE = 'No answer for 15 minutes — stopped, nothing was changed.'
export const INTERRUPTED_MESSAGE = 'Interrupted: the AI engine restarted during the change. Nothing was changed.'
