import { isSameOriginRequest } from '@/admin/core/auth/request'
import { authErrorResponse, jsonError, requireSession } from '@/admin/core/auth/session'
import { isMockPublishScenario, MOCK_PUBLISH_SCENARIOS, publishMock } from '@/admin/core/engine/mock/publish'

/**
 * DÉVELOPPEMENT SEULEMENT — choix du scénario du moteur SIMULÉ de publication (captures, recette des états G3/E1/E2).
 * Actif seulement si ENGINE_MOCK=1 ET NODE_ENV=development ; sinon 404 (la route n'existe pas pour le monde).
 *
 *   GET  /admin/publish/mock-scenario                        → { scenario, scenarios: [{ id, label }] }
 *   POST /admin/publish/mock-scenario { scenario: 'failed' } → { ok, scenario }   (JSON ou formulaire, même origine)
 *
 * Le scénario vaut pour tout le processus (état partagé, comme le vrai moteur) et remet la simulation à zéro.
 */

function enabled(): boolean {
  return process.env.ENGINE_MOCK === '1' && process.env.NODE_ENV === 'development'
}

export async function GET() {
  if (!enabled()) return jsonError(404, 'not_found', 'Not found')
  try {
    await requireSession('route')
  } catch (err) {
    return authErrorResponse(err)
  }
  return Response.json(
    { scenario: publishMock().scenario(), scenarios: MOCK_PUBLISH_SCENARIOS },
    { headers: { 'cache-control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  if (!enabled()) return jsonError(404, 'not_found', 'Not found')
  try {
    await requireSession('route')
  } catch (err) {
    return authErrorResponse(err)
  }
  if (!isSameOriginRequest(request.headers)) return jsonError(403, 'forbidden', 'Cross-origin request refused.')

  const isJson = request.headers.get('content-type')?.includes('application/json') ?? false
  let raw: unknown
  if (isJson) raw = ((await request.json().catch(() => null)) as { scenario?: unknown } | null)?.scenario
  else raw = (await request.formData().catch(() => null))?.get('scenario')

  if (!isMockPublishScenario(raw)) {
    return jsonError(400, 'bad_request', `Unknown scenario. Use one of: ${MOCK_PUBLISH_SCENARIOS.map((s) => s.id).join(', ')}.`)
  }
  publishMock().setScenario(raw)
  return Response.json({ ok: true, scenario: raw }, { headers: { 'cache-control': 'no-store' } })
}
