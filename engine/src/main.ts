import { rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { signPreviewToken } from '../../src/admin/core/engine/preview-token'
import { accessModule, createAiSettingsService, createClaudeAccessService, openAiSettingsStore, type AiSettingsService, machineLoginOf, openAccessStore, systemProbe, testConfigDirOf, type ClaudeAccessService } from './access'
import { createAgentRunner, readAgentSettings, type AccessResult, type AgentSettings, type SettingsEnv } from './claude'
import { EngineConfigError, readEngineConfig, type EngineEnv } from './config'
import { createRobotClient, sanityPort, type SanityPort } from './content/sanity'
import { createTextStore } from './content/texts'
import { createPreviewCredential, createPreviewSignal, PREVIEW_COOKIE, type PreviewSignal } from './content/visible'
import { chromePreview, type Preview } from './guards'
import { createEngineLock } from './jobs/lock'
import { createEngineFakeClaude } from './jobs/fake-claude'
import { createEditorService } from './jobs/service'
import { loadSiteDomains } from './jobs/site'
import type { JobRunAgent } from './jobs/types'
import { createPreviewProcess, type SpawnFn } from './preview/process'
import { askModule } from './ask'
import { publishModule, publishServiceOf } from './publish'
import { usageModule } from './usage'
import { versionsModule } from './versions'
import { registerEditorRoutes } from './server/editor-routes'
import { createHealth } from './server/health'
import { createEngineServer, createRouter } from './server/http'
import type { EngineContext, EngineModule } from './server/modules'
import { openEngineStore } from './store/store'
import { checkWorkspace, engineRunning, PID_FILE, WorkspaceError } from './workspace/workspace'

/**
 * Processus du moteur IA (`npm run engine` → tsx --env-file=engine/.env.local engine/src/main.ts).
 * Démarrage : configuration validée → espace de travail vérifié → magasin ouvert → reprise des demandes interrompues →
 * aperçu (next dev du clone) lancé et surveillé → serveur HTTP sur 127.0.0.1:ENGINE_PORT.
 * Arrêt (SIGINT/SIGTERM) : plus de nouvelles requêtes, demande en cours arrêtée et remise en état, aperçu arrêté.
 */

/**
 * Modules qui étendent le moteur (routes, ports). engine-publish (`/publish`, `/versions`, `aiUsage`) et ask-ai (`/ask`)
 * s'ajoutent ICI (demande de contrat à engine-core) : `import { publishModule, publishServiceOf } from './publish'` puis la liste.
 */
// ─── Section engine-publish (transfert d'engine-core) : journal aiUsage, publication, versions ───
// Ordre : `usage` d'abord (il pose `ports.usage` ; ask-ai y écrit via `getUsageJournal(context)`).
// Ask AI après usageModule : il écrit sa consommation dans le journal commun.
// Connexion à Claude depuis l'admin (B5) : routes /claude/access* sur le service créé par startEngine.
export const MODULES: EngineModule[] = [usageModule, publishModule, versionsModule, askModule(), accessModule]

/** Remplacements pour les tests (jamais utilisés par `npm run engine`). */
export type EngineOverrides = {
  /** Port d'écoute (0 = port libre) au lieu d'ENGINE_PORT. */
  listenPort?: number
  spawnPreview?: SpawnFn
  previewFetch?: typeof fetch
  visual?: Preview
  signal?: PreviewSignal
  runAgent?: JobRunAgent
  /** Port Sanity (faux) ; null = sans jeton d'écriture. */
  sanity?: SanityPort | null
  modules?: EngineModule[]
  /** Domaines du site (SEC-08) au lieu de ceux de `<ENGINE_SOURCE_REPO>/src/admin.config.ts`. */
  siteDomains?: readonly string[]
  /** Connexion à Claude (tests : faux réseau, faux Claude Code, fausse sonde de la machine). */
  claudeAccess?: ClaudeAccessService
  /** Réglages de l'IA (tests : magasin en mémoire ou dossier temporaire). */
  aiSettings?: AiSettingsService
  log?: (line: string) => void
}

export type RunningEngine = { context: EngineContext; port: number; stop(reason?: string): Promise<void> }

/** Attente maximale d'une publication en cours (ou du `stop` d'un module) à l'arrêt, sous le filet de 45 s. */
export const STOP_MODULES_TIMEOUT_MS = 30_000

const within = (promise: Promise<unknown>, ms: number) =>
  Promise.race([promise.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms).unref?.())])

const defaultLog = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`)

export async function startEngine(env: EngineEnv, overrides: EngineOverrides = {}): Promise<RunningEngine> {
  const log = overrides.log ?? defaultLog
  const config = readEngineConfig(env)
  if (config.sanity.dataset === 'production') {
    log('⚠ NEXT_PUBLIC_SANITY_DATASET is "production": AI text changes will write drafts in the live dataset.')
  }
  const repo = await checkWorkspace(config)
  if (await engineRunning(config)) throw new WorkspaceError('Another engine is already running on this workspace (data/engine.pid).')
  const pidFile = path.join(config.paths.data, PID_FILE)
  await writeFile(pidFile, String(process.pid))

  const store = await openEngineStore(config.paths.data)
  const lock = createEngineLock()

  // Claude : accès RECHARGEABLE (engine/src/access) — ANTHROPIC_API_KEY de l'environnement d'abord, puis ce qui est
  // enregistré depuis l'admin (clé API chiffrée, ou abonnement de la machine en mode local EXPLICITE seulement), puis
  // CLAUDE_CODE_OAUTH_TOKEN (repli local). Lu à chaque demande : un changement depuis l'admin s'applique sans redémarrage.
  const localMode = config.mode === 'local' && config.explicitLocal
  const claudeAccess =
    overrides.claudeAccess ??
    createClaudeAccessService({
      env,
      mode: config.mode,
      localMode,
      store: openAccessStore({ dataDir: config.paths.data, secret: config.secret }),
      machineLogin: machineLoginOf(env),
      probe: systemProbe(env, { configDir: testConfigDirOf(config.paths.claude) }),
      // ASK_MODEL ne sert plus qu'à ce test (le modèle le moins cher, Haiku 4.5) : Ask AI suit les réglages de l'IA.
      testModel: config.models.ask,
      testConfigDir: testConfigDirOf(config.paths.claude),
      log,
    })
  await claudeAccess.refresh()
  {
    const initial = claudeAccess.current()
    if (!initial.ok) log(`⚠ ${initial.error}`)
    else if (initial.warning) log(`⚠ ${initial.warning}`)
  }
  const currentAccess = () => claudeAccess.current()
  // Réglages de l'agent : ceux de l'environnement (EDITOR_*), dont le modèle et l'effort ne sont que les valeurs PAR
  // DÉFAUT — l'admin (B5 · AI settings, data/ai-settings.json) les remplace à chaud, pour TOUTE l'IA du site (éditeur et
  // Ask AI, FOLLOWUPS #47). `currentSettings()` est relu au début de chaque demande (accesseur `settings` de l'éditeur :
  // une demande lancée garde son modèle et son effort) et à chaque question d'Ask AI (`context.settings`).
  const baseSettings: AgentSettings = readAgentSettings(env as SettingsEnv, { configDir: config.paths.claude })
  const aiSettings =
    overrides.aiSettings ??
    createAiSettingsService({
      store: openAiSettingsStore({ dataDir: config.paths.data }),
      defaults: { model: baseSettings.model, effort: baseSettings.effort },
      log,
    })
  await aiSettings.load()
  const currentSettings = (): AgentSettings => ({ ...baseSettings, ...aiSettings.current() })
  const maxRequestUsd = config.maxRequestUsd ?? baseSettings.maxBudgetUsd
  // Faux Claude (ENGINE_FAKE_CLAUDE, mode local écrit seulement : validé par config.ts) : avertissement bruyant.
  const fake = config.fakeClaude
  if (fake) {
    log(`⚠⚠⚠ ENGINE_FAKE_CLAUDE=${fake}: the AI editor uses a FAKE Claude (scripted, no real call). Local end-to-end tests only.`)
    log('⚠⚠⚠ Remove ENGINE_FAKE_CLAUDE from engine/.env.local to use the real Claude. Ask AI is not faked.')
  }
  // Sans accès Claude configuré, le faux Claude reçoit un identifiant factice (jamais envoyé nulle part) ; la santé et
  // Ask AI gardent l'accès RÉEL.
  const editorAccess = (): AccessResult => {
    const current = currentAccess()
    return fake && !current.ok ? { ok: true, access: { kind: 'api-key', secret: 'fake-claude-no-real-call' } } : current
  }
  const runAgent: JobRunAgent =
    overrides.runAgent ??
    (fake
      ? createEngineFakeClaude(fake)
      : // Modèle et effort de la DEMANDE (lus à son départ par jobs/run.ts), jamais ceux du démarrage.
        (run, call) =>
          createAgentRunner({ ...baseSettings, model: call.model, effort: call.effort, maxBudgetUsd: Math.min(baseSettings.maxBudgetUsd, call.maxBudgetUsd) })(run))

  // Sanity : jeton d'écriture « robot » (textes de l'éditeur, publication) ; sans lui, la portée Text est indisponible.
  let sanity: SanityPort | null = null
  if (overrides.sanity !== undefined) sanity = overrides.sanity
  else if (config.sanity.writeToken) {
    sanity = sanityPort(
      createRobotClient({ projectId: config.sanity.projectId, dataset: config.sanity.dataset, apiVersion: config.sanity.apiVersion, token: config.sanity.writeToken }),
    )
  }
  if (!sanity) log('⚠ SANITY_API_WRITE_TOKEN is empty: AI text changes are unavailable (style changes work).')
  const texts = createTextStore(sanity)

  // Aperçu du brouillon (next dev du clone) et contrôles du rendu (Chrome). Sonde, signal et Chrome portent un jeton
  // du MOTEUR dérivé du secret racine (2 h, renouvelé) : le proxy de l'aperçu n'accepte plus le secret racine (SEC-09).
  const previewCredential = createPreviewCredential(config.preview.secret)
  const preview = createPreviewProcess({
    repoDir: repo.dir,
    port: config.preview.port,
    origin: config.preview.origin,
    secret: previewCredential,
    log: (line) => log(`[preview] ${line}`),
    ...(overrides.spawnPreview ? { spawn: overrides.spawnPreview, command: 'next' } : {}),
    ...(overrides.previewFetch ? { fetchImpl: overrides.previewFetch } : {}),
  })
  // Chrome : un jeton frais à chaque session (une session = une demande).
  const visual: Preview = overrides.visual ?? {
    open: async (page, zone, index) =>
      chromePreview({
        baseUrl: config.preview.origin,
        cookies: [{ name: PREVIEW_COOKIE, value: await previewCredential() }],
        settle: async (session) => {
          await session.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
        },
      }).open(page, zone, index),
  }
  const signal = overrides.signal ?? createPreviewSignal({ origin: config.preview.origin, secret: previewCredential })
  // URL de l'iframe : jeton COURT (15 min) lié à l'utilisateur, dérivé du secret racine (SEC-09). Le secret racine ne
  // quitte jamais le serveur : seuls la sonde, le signal et Chrome l'utilisent, en cookie.
  const previewUrl = async (page: string, user: { id: string }) => {
    const url = new URL(page, config.preview.origin)
    url.searchParams.set(PREVIEW_COOKIE, await signPreviewToken(config.preview.secret, user.id))
    return { url: url.toString(), origin: config.preview.origin }
  }
  const health = createHealth({
    mode: config.mode,
    // Accesseur : la santé suit l'accès rechargé depuis l'admin.
    get access() {
      return currentAccess()
    },
    // Accesseurs : /health suit le modèle choisi dans l'admin (B5 · AI settings). Ask AI utilise le même modèle :
    // `askModel` (gardé pour compatibilité, lu par l'en-tête du panneau Ask AI) vaut désormais `editorModel`.
    get editorModel() {
      return currentSettings().model
    },
    get askModel() {
      return currentSettings().model
    },
    sanityWrite: texts.available,
    preview: () => ({ url: config.preview.origin, ready: preview.status().ready }),
    repo,
    fakeClaude: fake,
  })

  // Domaines du site (manifeste du dépôt source) : seules adresses gardées dans les textes du client (SEC-08).
  const siteDomains = overrides.siteDomains ?? (await loadSiteDomains(config.paths.sourceRepo, log))

  const ports: EngineContext['ports'] = { usage: null, pendingTotal: null }
  const editor = createEditorService({
    repo,
    store: store.editor,
    texts,
    preview: visual,
    signal,
    previewReady: () => preview.status().ready,
    previewUrl,
    runAgent,
    // Accesseur (rechargement à chaud) : relu au début de CHAQUE demande ; une demande lancée garde son identifiant.
    get access() {
      return editorAccess()
    },
    // Accesseur (rechargement à chaud) : relu au début de CHAQUE demande ; une demande lancée garde ses réglages.
    get settings() {
      return currentSettings()
    },
    maxRequestUsd,
    fakeClaude: fake,
    siteDomains,
    lock,
    shotsDir: config.paths.shots,
    health,
    usage: { record: (input) => ports.usage?.record(input) ?? Promise.resolve() },
    pendingTotal: async () => (ports.pendingTotal ? ports.pendingTotal() : store.editor.validatedChanges().length),
    log,
  })
  lock.setEditorGate(editor)
  await editor.recover()

  const router = createRouter()
  registerEditorRoutes(router, editor, health)
  const context: EngineContext = {
    config,
    router,
    store,
    repo,
    lock,
    editor,
    sanity,
    texts,
    preview,
    get access() {
      return currentAccess()
    },
    claudeAccess,
    aiSettings,
    get settings() {
      return currentSettings()
    },
    ports,
  }
  const modules = overrides.modules ?? MODULES
  for (const module of modules) {
    await module.register(context)
    log(`module ${module.name} registered`)
  }

  preview.start()
  const server = createEngineServer({ router, secret: config.secret, identityPublicKey: config.identityPublicKey, log })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(overrides.listenPort ?? config.port, config.host, () => resolve())
  })
  const port = (server.address() as AddressInfo).port
  log(`AI engine listening on http://${config.host}:${port} (${config.mode} mode, preview ${config.preview.origin})`)

  let stopped: Promise<void> | null = null
  const stop = (reason = 'stop') =>
    (stopped ??= (async () => {
      log(`${reason}: stopping the engine…`)
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeIdleConnections?.()
      })
      await editor.shutdown().catch((error) => log(`shutdown: ${error instanceof Error ? error.message : String(error)}`))
      // Publication en cours : on la laisse finir (Sanity, git, déploiement) avant d'écrire le magasin (FOLLOWUPS #14).
      const publishing = publishServiceOf(context)?.idle()
      if (publishing && !(await within(publishing.catch(() => {}), STOP_MODULES_TIMEOUT_MS))) {
        log('shutdown: the publication in progress did not finish in time; it will be marked as interrupted at the next start.')
      }
      // Crochet `stop` des modules (dans l'ordre inverse de l'enregistrement).
      for (const module of [...modules].reverse()) {
        if (!module.stop) continue
        const done = Promise.resolve()
          .then(() => module.stop!(context))
          .catch((error) => log(`shutdown of module ${module.name}: ${error instanceof Error ? error.message : String(error)}`))
        if (!(await within(done, STOP_MODULES_TIMEOUT_MS))) log(`shutdown: module ${module.name} did not stop in time.`)
      }
      await preview.stop().catch(() => {})
      await store.editor.flush()
      await store.publications.flush()
      await rm(pidFile, { force: true })
      log('Engine stopped.')
    })())
  return { context, port, stop }
}

// Lancé en ligne de commande (pas à l'import par les tests).
if (process.argv[1] && /engine[\\/]src[\\/]main\.ts$/.test(process.argv[1])) {
  startEngine(process.env)
    .then((engine) => {
      const shutdown = (signalName: string) => {
        // Filet : jamais bloqué plus de 45 s, jamais de next dev orphelin.
        setTimeout(() => {
          engine.context.preview.stopSync()
          process.exit(1)
        }, 45_000).unref()
        void engine.stop(signalName).then(() => process.exit(0))
      }
      process.on('SIGINT', () => shutdown('SIGINT'))
      process.on('SIGTERM', () => shutdown('SIGTERM'))
      process.on('exit', () => engine.context.preview.stopSync())
    })
    .catch((error: unknown) => {
      if (error instanceof EngineConfigError || error instanceof WorkspaceError) console.error(error.message)
      else console.error(`The AI engine could not start: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
      process.exit(1)
    })
}
