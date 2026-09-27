import type { EngineModule } from '../server/modules'
import { createVersionsService, type VersionsService } from './versions'

/**
 * Module des versions (E2) :
 *   GET  /versions                   → { publications, rollback }   (publish.run : tous les rôles)
 *   POST /versions/:number/rollback  → Publication                   (versions.rollback : Kuartz ; 501 en mode local)
 */
export const versionsModule: EngineModule = {
  name: 'versions',
  register(context) {
    const service: VersionsService = createVersionsService({
      repo: context.repo,
      publications: context.store.publications,
      mode: context.config.mode,
    })
    context.router.add({ method: 'GET', path: '/versions', capability: 'publish.run', handler: async () => ({ json: await service.list() }) })
    context.router.add({
      method: 'POST',
      path: '/versions/:number/rollback',
      capability: 'versions.rollback',
      params: { number: /^\d{1,6}$/ },
      handler: async ({ user, params }) => ({ json: await service.rollback(user, Number(params.number)) }),
    })
  },
}

export { createVersionsService, LOCAL_ROLLBACK_REASON, HOSTED_ROLLBACK_REASON, rollbackReason } from './versions'
export type { VersionsService, VersionsList } from './versions'
