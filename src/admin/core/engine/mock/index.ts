import { handleAsk } from './ask'
import { handleClaude } from './claude'
import { handleEditor, mockEditorHealth } from './editor'
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
      // Même santé que EditorState.health de l'éditeur simulé : suit son scénario (FOLLOWUPS #39, editor-sidebar).
      // Le gestionnaire est ici et non dans health.ts : editor.ts importe déjà MOCK_HEALTH de health.ts (pas de cycle).
      return { status: 200, json: mockEditorHealth() }
    case 'editor':
      return handleEditor(request)
    case 'publish':
    case 'versions':
      return handlePublish(request)
    case 'ask':
      return handleAsk(request)
    case 'claude':
      return handleClaude(request)
    default:
      return mockNotImplemented(request.segments[0] ?? '')
  }
}
