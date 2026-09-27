import { handleAsk } from './ask'
import { handleEditor } from './editor'
import { handleHealth } from './health'
import { mockNotImplemented } from './not-implemented'
import { handlePublish } from './publish'
import type { MockEngineRequest, MockEngineResponse } from './types'

export type { MockEngineRequest, MockEngineResponse, MockHandler } from './types'

/**
 * Répartiteur du moteur SIMULÉ (ENGINE_MOCK=1, jamais en production). Appelé par core/engine/server.ts à la place
 * du réseau, APRÈS la liste blanche et les droits. Propriétaire : auth-core (les gestionnaires editor/publish/ask
 * appartiennent aux agents de vague 2).
 */
export async function handleMockEngineRequest(request: MockEngineRequest): Promise<MockEngineResponse> {
  switch (request.segments[0]) {
    case 'health':
      return handleHealth(request)
    case 'editor':
      return handleEditor(request)
    case 'publish':
    case 'versions':
      return handlePublish(request)
    case 'ask':
      return handleAsk(request)
    default:
      return mockNotImplemented(request.segments[0] ?? '')
  }
}
