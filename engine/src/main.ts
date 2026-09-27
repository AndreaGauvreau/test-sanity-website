import { rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { createAgentRunner, readAgentSettings, resolveClaudeAccess, type AgentSettings, type SettingsEnv } from './claude'
import { EngineConfigError, readEngineConfig, type EngineEnv } from './config'
import { createRobotClient, sanityPort, type SanityPort } from './content/sanity'
import { createTextStore } from './content/texts'
import { createPreviewSignal, PREVIEW_COOKIE, type PreviewSignal } from './content/visible'
import { chromePreview, type Preview } from './guards'
import { createEngineLock } from './jobs/lock'
import { createEditorService } from './jobs/service'
import type { JobRunAgent } from './jobs/types'
import { createPreviewProcess, type SpawnFn } from './preview/process'
import { publishModule } from './publish'
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
 * s'ajoutent ICI (demande de contrat à engine-core) : `import { publishModule } from './publish'` puis la liste.
 */
// ─── Section engine-publish (transfert d'engine-core) : journal aiUsage, publication, versions ───
// Ordre : `usage` d'abord (il pose `ports.usage` ; ask-ai y écrit via `getUsageJournal(context)`).
export const MODULES: EngineModule[] = [usageModule, publishModule, versionsModule]

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
  log?: (line: string) => void
}

export type RunningEngine = { context: EngineContext; port: number; stop(reason?: string): Promise<void> }

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

  // Claude : accès (clé API d'abord ; abonnement seulement en mode local EXPLICITE), réglages de l'agent.
  const access = resolveClaudeAccess(env, { localMode: config.mode === 'local' && config.explicitLocal })
  if (!access.ok) log(`⚠ ${access.error}`)
  else if (access.warning) log(`⚠ ${access.warning}`)
  const settings: AgentSettings = readAgentSettings(env as SettingsEnv, { configDir: config.paths.claude })
  const maxRequestUsd = config.maxRequestUsd ?? settings.maxBudgetUsd
  const runAgent: JobRunAgent =
    overrides.runAgent ??
    ((run, limits) => createAgentRunner({ ...settings, maxBudgetUsd: Math.min(settings.maxBudgetUsd, limits.maxBudgetUsd) })(run))

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

  // Aperçu du brouillon (next dev du clone) et contrôles du rendu (Chrome, cookie du secret d'aperçu).
  const preview = createPreviewProcess({
    repoDir: repo.dir,
    port: config.preview.port,
    origin: config.preview.origin,
    secret: config.preview.secret,
    log: (line) => log(`[preview] ${line}`),
    ...(overrides.spawnPreview ? { spawn: overrides.spawnPreview, command: 'next' } : {}),
    ...(overrides.previewFetch ? { fetchImpl: overrides.previewFetch } : {}),
  })
  const visual =
    overrides.visual ??
    chromePreview({
      baseUrl: config.preview.origin,
      cookies: [{ name: PREVIEW_COOKIE, value: config.preview.secret }],
      settle: async (page) => {
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
      },
    })
  const signal = overrides.signal ?? createPreviewSignal({ origin: config.preview.origin, secret: config.preview.secret })
  const previewUrl = (page: string) => {
    const url = new URL(page, config.preview.origin)
    url.searchParams.set(PREVIEW_COOKIE, config.preview.secret)
    return { url: url.toString(), origin: config.preview.origin }
  }
  const health = createHealth({
    mode: config.mode,
    access,
    editorModel: settings.model,
    askModel: config.models.ask,
    sanityWrite: texts.available,
    preview: () => ({ url: config.preview.origin, ready: preview.status().ready }),
    repo,
  })

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
    access,
    settings,
    maxRequestUsd,
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
  const context: EngineContext = { config, router, store, repo, lock, editor, sanity, texts, preview, access, settings, ports }
  for (const module of overrides.modules ?? MODULES) {
    await module.register(context)
    log(`module ${module.name} registered`)
  }

  preview.start()
  const server = createEngineServer({ router, secret: config.secret, log })
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
