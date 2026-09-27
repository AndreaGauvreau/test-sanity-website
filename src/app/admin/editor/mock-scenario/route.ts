import { isSameOriginRequest } from '@/admin/core/auth/request'
import { authErrorResponse, jsonError, requireCapability } from '@/admin/core/auth/session'
import {
  editorMockScenario,
  isMockEditorScenario,
  MOCK_EDITOR_SCENARIOS,
  setEditorMockScenario,
} from '@/admin/core/engine/mock/editor'

/**
 * DÉVELOPPEMENT SEULEMENT — choix à chaud du scénario de l'éditeur IA SIMULÉ (santé du moteur : accès Claude, aperçu,
 * jeton Sanity, texte à restaurer), pour les captures et la recette des états d'erreur (FOLLOWUPS #41).
 * Actif seulement si ENGINE_MOCK=1 ET NODE_ENV=development ; sinon 404 (la route n'existe pas pour le monde).
 * Modèle : /admin/publish/mock-scenario (publish-ui).
 *
 *   GET  /admin/editor/mock-scenario                            → { scenario, scenarios: [{ id, label }] }
 *   POST /admin/editor/mock-scenario { scenario: 'no-claude' }  → { ok, scenario }   (JSON ou formulaire, même origine)
 *
 * Droit `ai.editor` (comme l'écran). Le scénario vaut pour tout le processus ; le fil et les modifications sont gardés
 * (setEditorMockScenario ne remet pas la simulation à zéro).
 */

function enabled(): boolean {
  return process.env.ENGINE_MOCK === '1' && process.env.NODE_ENV === 'development'
}

const NO_STORE = { 'cache-control': 'no-store' }

export async function GET() {
  if (!enabled()) return jsonError(404, 'not_found', 'Not found')
  try {
    await requireCapability('ai.editor', 'route')
  } catch (err) {
    return authErrorResponse(err)
  }
  return Response.json({ scenario: editorMockScenario(), scenarios: MOCK_EDITOR_SCENARIOS }, { headers: NO_STORE })
}

export async function POST(request: Request) {
  if (!enabled()) return jsonError(404, 'not_found', 'Not found')
  try {
    await requireCapability('ai.editor', 'route')
  } catch (err) {
    return authErrorResponse(err)
  }
  if (!isSameOriginRequest(request.headers)) return jsonError(403, 'forbidden', 'Cross-origin request refused.')

  const isJson = request.headers.get('content-type')?.includes('application/json') ?? false
  let raw: unknown
  if (isJson) raw = ((await request.json().catch(() => null)) as { scenario?: unknown } | null)?.scenario
  else raw = (await request.formData().catch(() => null))?.get('scenario')

  if (!isMockEditorScenario(raw)) {
    return jsonError(400, 'bad_request', `Unknown scenario. Use one of: ${MOCK_EDITOR_SCENARIOS.map((s) => s.id).join(', ')}.`)
  }
  setEditorMockScenario(raw)
  return Response.json({ ok: true, scenario: raw }, { headers: NO_STORE })
}
