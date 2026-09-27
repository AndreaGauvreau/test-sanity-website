import path from 'node:path'
import { typecheck as typecheckClone } from '../jobs/site'
import type { EngineContext, EngineModule } from '../server/modules'
import { readMeta } from '../workspace/workspace'
import { catalogFromConfig, catalogFromTypes, FALLBACK_TYPES, loadAdminConfig, type Catalog } from './catalog'
import { registerPublishRoutes } from './routes'
import { createPublishService, type PublishDeps, type PublishService } from './service'

/**
 * Module de publication du moteur (E1, G3) : routes /publish/*, port `pendingTotal` de l'éditeur, reprise au
 * démarrage. Branché dans `MODULES` de engine/src/main.ts.
 */

export type PublishModuleOptions = {
  /** Catalogue imposé (tests) ; défaut : `<ENGINE_SOURCE_REPO>/src/admin.config.ts`, sinon FALLBACK_TYPES. */
  catalog?: Catalog
  typecheck?: PublishDeps['typecheck']
  fetch?: typeof fetch
  now?: () => Date
}

const services = new WeakMap<EngineContext, PublishService>()

/** Service de publication d'un moteur démarré (tests, autres modules). */
export const publishServiceOf = (context: EngineContext) => services.get(context) ?? null

export async function catalogFor(sourceRepo: string, log: (line: string) => void): Promise<Catalog> {
  const config = await loadAdminConfig(path.join(sourceRepo, 'src', 'admin.config.ts'))
  if (config) return catalogFromConfig(config)
  log('⚠ src/admin.config.ts not found or invalid: the Publish list uses the built-in list of content types.')
  return catalogFromTypes(FALLBACK_TYPES)
}

export function createPublishModule(options: PublishModuleOptions = {}): EngineModule {
  return {
    name: 'publish',
    async register(context) {
      const log = (line: string) => console.log(line)
      const { config } = context
      const service = createPublishService({
        repo: context.repo,
        store: context.store,
        lock: context.lock,
        validatedDesign: () => context.editor.validatedDesign(),
        sanity: context.sanity,
        catalog: options.catalog ?? (await catalogFor(config.paths.sourceRepo, log)),
        mode: config.mode,
        git: { push: config.git.push, sourceBranch: async () => (await readMeta(config))?.sourceBranch ?? null },
        deployHookUrl: config.publish.vercelDeployHookUrl,
        revalidate: { url: config.publish.siteRevalidateUrl, secret: config.publish.revalidateSecret },
        typecheck: options.typecheck ?? typecheckClone,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.now ? { now: options.now } : {}),
      })
      await service.recover()
      registerPublishRoutes(context.router, service)
      context.ports.pendingTotal = () => service.pendingTotal()
      services.set(context, service)
    },
  }
}

export const publishModule: EngineModule = createPublishModule()

export { createPublishService } from './service'
export type { PublishService, PublishDeps } from './service'
