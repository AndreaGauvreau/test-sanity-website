import { EngineConfigError, readEngineConfig, type EngineConfig } from '../config'
import { openEngineStore } from '../store/store'
import { engineRunning, setupWorkspace, syncWorkspace, WorkspaceError } from './workspace'

/**
 * `npm run engine:setup`        → met en place l'espace de travail (idempotent : clone, main/draft, .env.local de
 *                                 l'aperçu, npm ci une fois, dossiers data/ claude/ shots/).
 * `npm run engine:setup -- sync` → avance main et draft sur la source quand rien n'attend (moteur arrêté).
 *
 * Lit `engine/.env.local` (chargé par tsx --env-file). N'affiche aucun secret.
 */

/** Ce qui empêche une synchronisation, d'après le magasin du moteur (null = rien n'attend). */
export async function pendingWork(config: EngineConfig): Promise<string | null> {
  const store = await openEngineStore(config.paths.data)
  if (store.editor.activeJobs().length) return 'an AI request is still in progress.'
  if (store.editor.openChange()) return 'an AI change is waiting for Validate or Cancel.'
  if (store.editor.validatedChanges().length) return 'validated AI changes are waiting to be published.'
  const run = store.publications.get().run
  if (run && !run.finishedAt) return 'a publication is in progress.'
  return null
}

async function main(argv: string[]) {
  const config = readEngineConfig(process.env)
  const command = argv[0] ?? 'setup'
  if (command === 'setup') {
    await setupWorkspace(config)
  } else if (command === 'sync') {
    await syncWorkspace(config, { engineRunning: () => engineRunning(config), pendingWork: () => pendingWork(config) })
  } else {
    throw new WorkspaceError(`Unknown command "${command}": use \`npm run engine:setup\` or \`npm run engine:setup -- sync\`.`)
  }
}

// Exécuté seulement en ligne de commande (pas à l'import par les tests).
if (process.argv[1] && /workspace[\\/]setup\.ts$/.test(process.argv[1])) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    if (error instanceof EngineConfigError || error instanceof WorkspaceError) console.error(error.message)
    else console.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
