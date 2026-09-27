import type { EngineHealth } from '../../contracts/engine'

/**
 * Santé de BASE du moteur simulé : un moteur local en bonne santé, aperçu prêt. Propriétaire : auth-core.
 * GET /health simulé ne la renvoie pas telle quelle : mock/index.ts répond `mockEditorHealth()` (editor.ts), c'est-à-dire
 * cette base corrigée par le scénario de l'éditeur simulé (FOLLOWUPS #39).
 * Même règle que le vrai moteur (engine/src/server/health.ts) : ok = access !== 'none' && preview.ready && branche
 * « draft ». D'où access « api-key » (le mock de l'éditeur facture déjà en « api-key ») ; aucun appel réel à Claude.
 */
export const MOCK_HEALTH: EngineHealth = {
  ok: true,
  version: 'mock',
  mode: 'local',
  claude: { access: 'api-key', editorModel: 'claude-opus-5-5', askModel: 'claude-haiku-4-5-20251001' },
  sanityWrite: true,
  preview: { url: 'http://127.0.0.1:4042/', ready: true },
  git: { branch: 'draft', clean: true, aheadOfMain: 0 },
}
