import type { EngineHealth } from '../../contracts/engine'
import type { MockHandler } from './types'

/** GET /health simulé : un moteur local en bonne santé, aperçu prêt, sans accès Claude réel. Propriétaire : auth-core. */
export const MOCK_HEALTH: EngineHealth = {
  ok: true,
  version: 'mock',
  mode: 'local',
  claude: { access: 'none', editorModel: 'claude-opus-5-5', askModel: 'claude-haiku-4-5-20251001' },
  sanityWrite: true,
  preview: { url: 'http://127.0.0.1:4042/', ready: true },
  git: { branch: 'draft', clean: true, aheadOfMain: 0 },
}

export const handleHealth: MockHandler = () => ({ status: 200, json: MOCK_HEALTH })
