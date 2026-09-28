import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  aiSettingsProblem,
  isAiEffort,
  isAiModelId,
  modelSupportsEffort,
  type AiSettings,
  type AiSettingsInEffect,
  type AiSettingsState,
} from '../../../src/admin/core/contracts'
import { badRequest } from '../server/errors'

/**
 * Réglages de l'IA choisis depuis l'admin (B5 · carte « AI settings ») : MODÈLE et NIVEAU DE RÉFLEXION (effort) de
 * TOUTE l'IA du site — l'éditeur IA et Ask AI (FOLLOWUPS #47, 2026-09-28 ; ASK_MODEL ne sert plus qu'au test de
 * connexion de l'abonnement). Haiku 4.5 n'a pas d'effort : l'effort enregistré est gardé, jamais envoyé à Claude
 * (engine-claude : `buildAgentOptions`, `complete`).
 *
 * Fichier : `<ENGINE_WORKSPACE>/data/ai-settings.json` (écriture atomique : fichier temporaire puis renommage, 0600
 * comme les autres fichiers de data/ ; rien de secret, donc pas de chiffrement). Absent ou illisible → valeurs par
 * défaut du moteur (EDITOR_MODEL / EDITOR_EFFORT de l'environnement, sinon claude-opus-5-5 / medium).
 *
 * RECHARGEMENT À CHAUD : `current()` est synchrone et suit le dernier enregistrement ; main.ts l'expose par des
 * ACCESSEURS (réglages de l'éditeur, `context.settings` lu par Ask AI, /health) : chaque nouvelle demande de l'éditeur
 * lit les réglages en cours à son départ (une demande lancée garde les siens, 2e essai compris : même session, même
 * modèle) ; Ask AI les relit à chaque question.
 */

export const AI_SETTINGS_FILE = 'ai-settings.json'

type AiSettingsFile = { version: 1; model: string; effort: string; updatedAt: string }

export type SavedAiSettings = { settings: AiSettings; updatedAt: string }

export type AiSettingsStore = {
  file: string
  /** Réglages enregistrés, ou null (absent, illisible, modèle ou niveau inconnu : `problem` le dit). */
  read(): Promise<{ saved: SavedAiSettings | null; problem?: string }>
  write(settings: AiSettings): Promise<SavedAiSettings>
}

export function openAiSettingsStore(input: { dataDir: string; now?: () => Date }): AiSettingsStore {
  const file = path.join(input.dataDir, AI_SETTINGS_FILE)
  const now = input.now ?? (() => new Date())
  return {
    file,
    async read() {
      let text: string
      try {
        text = await readFile(file, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { saved: null }
        throw error
      }
      try {
        const parsed = JSON.parse(text) as Partial<AiSettingsFile>
        if (parsed.version === 1 && isAiModelId(parsed.model) && isAiEffort(parsed.effort)) {
          return { saved: { settings: { model: parsed.model, effort: parsed.effort }, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '' } }
        }
      } catch {
        // JSON illisible : même traitement qu'un contenu inconnu.
      }
      return { saved: null, problem: `${AI_SETTINGS_FILE} is not valid: the default AI settings apply until they are saved again.` }
    },
    async write(settings) {
      const updatedAt = now().toISOString()
      const content: AiSettingsFile = { version: 1, model: settings.model, effort: settings.effort, updatedAt }
      await mkdir(input.dataDir, { recursive: true })
      const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`
      await writeFile(tmp, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600 })
      await rename(tmp, file)
      await chmod(file, 0o600)
      return { settings, updatedAt }
    },
  }
}

export type AiSettingsService = {
  /** Réglages en cours (synchrone) : ceux de la PROCHAINE demande de l'éditeur et de la PROCHAINE question d'Ask AI. */
  current(): AiSettingsInEffect
  /** Relit le fichier (démarrage). */
  load(): Promise<void>
  state(): AiSettingsState
  /** Valide STRICTEMENT (`aiSettingsProblem` du contrat, 400 sinon), écrit, puis applique. */
  save(body: unknown): Promise<AiSettingsState>
}

export type AiSettingsDeps = {
  store: AiSettingsStore
  /** Valeurs par défaut : EDITOR_MODEL / EDITOR_EFFORT (`readAgentSettings`), sinon claude-opus-5-5 / medium. */
  defaults: AiSettingsInEffect
  log?: (line: string) => void
}

export function createAiSettingsService(deps: AiSettingsDeps): AiSettingsService {
  const defaults: AiSettingsInEffect = { model: deps.defaults.model, effort: deps.defaults.effort }
  let saved: SavedAiSettings | null = null

  const current = (): AiSettingsInEffect => (saved ? { ...saved.settings } : { ...defaults })
  const state = (): AiSettingsState => ({
    current: current(),
    defaults: { ...defaults },
    source: saved ? 'saved' : 'default',
    ...(saved?.updatedAt ? { updatedAt: saved.updatedAt } : {}),
  })

  return {
    current,
    state,
    async load() {
      const read = await deps.store.read()
      saved = read.saved
      if (read.problem) deps.log?.(`⚠ ${read.problem}`)
    },
    async save(body) {
      const problem = aiSettingsProblem(body)
      if (problem) throw badRequest(problem)
      const { model, effort } = body as AiSettings
      // Écrit d'abord : un disque en erreur laisse les réglages en cours inchangés.
      saved = await deps.store.write({ model, effort })
      const used = modelSupportsEffort(model) ? `effort ${effort}` : `no effort (${effort} kept for the other models)`
      deps.log?.(`AI settings saved: ${model}, ${used} (next AI editor request and Ask AI question).`)
      return state()
    },
  }
}
