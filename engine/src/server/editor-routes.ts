import type { EngineHealth } from '../../../src/admin/core/contracts'
import type { EditorService } from '../jobs/service'
import { SHOT_NAME } from '../jobs/service'
import { ID_PATTERN } from '../jobs/request'
import { badRequest } from './errors'
import type { Router } from './http'

/**
 * Routes de l'éditeur, EXACTEMENT celles du contrat (`core/contracts/engine.ts`) :
 *   GET  /health                               → EngineHealth
 *   GET  /editor/state?page=/                  → EditorState
 *   POST /editor/requests          EditRequest → EditJob (201) · 409 busy | awaiting_validation | publishing
 *   GET  /editor/jobs/:id                      → EditJob
 *   POST /editor/jobs/:id/answer  { answers }  → EditJob
 *   POST /editor/jobs/:id/stop                 → EditJob
 *   POST /editor/changes/:id/validate          → PendingChange
 *   POST /editor/changes/:id/cancel            → PendingChange
 *   GET  /editor/jobs/:id/shots/:file          → image/png (nom ^\d{3,4}-(before|after)\.png$)
 * Droits : `ai.editor` pour l'éditeur, toute identité signée pour /health (comme la liste blanche de l'admin).
 */
export function registerEditorRoutes(router: Router, editor: EditorService, health: () => Promise<EngineHealth>) {
  const id = { id: ID_PATTERN }
  router.add({ method: 'GET', path: '/health', capability: null, handler: async () => ({ json: await health() }) })
  router.add({
    method: 'GET',
    path: '/editor/state',
    capability: 'ai.editor',
    handler: async ({ user, query }) => {
      const page = query.get('page')
      if (!page) throw badRequest('Missing page.')
      return { json: await editor.state(page, user) }
    },
  })
  router.add({
    method: 'POST',
    path: '/editor/requests',
    capability: 'ai.editor',
    handler: async ({ user, body }) => ({ status: 201, json: await editor.request(user, body) }),
  })
  router.add({ method: 'GET', path: '/editor/jobs/:id', capability: 'ai.editor', params: id, handler: ({ params }) => ({ json: editor.job(params.id) }) })
  router.add({
    method: 'POST',
    path: '/editor/jobs/:id/answer',
    capability: 'ai.editor',
    params: id,
    handler: async ({ user, params, body }) => ({ json: await editor.answer(user, params.id, body) }),
  })
  router.add({
    method: 'POST',
    path: '/editor/jobs/:id/stop',
    capability: 'ai.editor',
    params: id,
    handler: async ({ user, params }) => ({ json: await editor.stop(user, params.id) }),
  })
  router.add({
    method: 'POST',
    path: '/editor/changes/:id/validate',
    capability: 'ai.editor',
    params: id,
    handler: async ({ user, params }) => ({ json: await editor.validate(user, params.id) }),
  })
  router.add({
    method: 'POST',
    path: '/editor/changes/:id/cancel',
    capability: 'ai.editor',
    params: id,
    handler: async ({ user, params }) => ({ json: await editor.cancel(user, params.id) }),
  })
  router.add({
    method: 'GET',
    path: '/editor/jobs/:id/shots/:file',
    capability: 'ai.editor',
    params: { id: ID_PATTERN, file: SHOT_NAME },
    handler: async ({ params }) => ({ png: await editor.shot(params.id, params.file) }),
  })
}
