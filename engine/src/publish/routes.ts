import { ID_PATTERN } from '../jobs/request'
import type { Router } from '../server/http'
import type { PublishService } from './service'

/**
 * Routes de publication (contrat `core/contracts/engine.ts`) :
 *   GET  /publish/status           → PublishStatus                       (publish.run)
 *   POST /publish  { expected }    → PublishStatus · 409                  (publish.run)
 *   POST /publish/retry            → PublishStatus · 409 si rien à reprendre (publish.run)
 *   POST /publish/discard  { kind: 'content', id } | { kind: 'design', changeId } → PublishStatus (publish.run)
 *   GET  /publish/diff/:changeId   → { diff }                            (publish.diff : Kuartz seulement)
 *   POST /publish/stage   { kind: 'unpublish' | 'delete', id } → PublishStatus (content.write : action du CMS)
 *   POST /publish/unstage { id }   → PublishStatus                       (content.write)
 */
export function registerPublishRoutes(router: Router, service: PublishService): void {
  router.add({ method: 'GET', path: '/publish/status', capability: 'publish.run', handler: async () => ({ json: await service.status() }) })
  router.add({ method: 'POST', path: '/publish', capability: 'publish.run', handler: async ({ user, body }) => ({ json: await service.publish(user, body) }) })
  router.add({ method: 'POST', path: '/publish/retry', capability: 'publish.run', handler: async ({ user }) => ({ json: await service.retry(user) }) })
  router.add({ method: 'POST', path: '/publish/discard', capability: 'publish.run', handler: async ({ user, body }) => ({ json: await service.discard(user, body) }) })
  router.add({ method: 'POST', path: '/publish/stage', capability: 'content.write', handler: async ({ user, body }) => ({ json: await service.stage(user, body) }) })
  router.add({ method: 'POST', path: '/publish/unstage', capability: 'content.write', handler: async ({ user, body }) => ({ json: await service.unstage(user, body) }) })
  router.add({
    method: 'GET',
    path: '/publish/diff/:changeId',
    capability: 'publish.diff',
    params: { changeId: ID_PATTERN },
    handler: async ({ user, params }) => ({ json: await service.diff(user, params.changeId) }),
  })
}
