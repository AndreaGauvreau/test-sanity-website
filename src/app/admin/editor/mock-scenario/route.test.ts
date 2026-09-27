import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// FOLLOWUPS #41 (editor-canvas) : route de dev pour changer à chaud le scénario de l'éditeur simulé.
// La session est simulée (droit `ai.editor` accordé ou refusé) ; l'éditeur simulé est le vrai module.
const { requireCapability } = vi.hoisted(() => ({ requireCapability: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/admin/core/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/admin/core/auth/session')>()
  return { ...actual, requireCapability }
})

const { AdminAuthError } = await import('@/admin/core/auth/session')
const { editorMockScenario, setEditorMockScenario, MOCK_EDITOR_SCENARIOS } = await import('@/admin/core/engine/mock/editor')
const { GET, POST } = await import('./route')

const URL_ = 'http://127.0.0.1:4040/admin/editor/mock-scenario'

function postJson(body: unknown, headers: Record<string, string> = {}) {
  return new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:4040', host: '127.0.0.1:4040', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('ENGINE_MOCK', '1')
  vi.stubEnv('NODE_ENV', 'development')
  requireCapability.mockReset()
  requireCapability.mockResolvedValue({ role: 'kuartz' })
  setEditorMockScenario('ready')
})

afterEach(() => {
  vi.unstubAllEnvs()
  setEditorMockScenario('ready')
})

describe('/admin/editor/mock-scenario', () => {
  it('404 hors développement ou sans ENGINE_MOCK=1, sans lire la session ni changer le scénario', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect((await GET()).status).toBe(404)
    expect((await POST(postJson({ scenario: 'no-claude' }))).status).toBe(404)
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ENGINE_MOCK', '')
    expect((await GET()).status).toBe(404)
    expect((await POST(postJson({ scenario: 'no-claude' }))).status).toBe(404)
    expect(requireCapability).not.toHaveBeenCalled()
    expect(editorMockScenario()).toBe('ready')
  })

  it('GET : scénario courant et liste des scénarios, droit ai.editor exigé', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ scenario: 'ready', scenarios: MOCK_EDITOR_SCENARIOS.map((s) => ({ ...s })) })
    expect(requireCapability).toHaveBeenCalledWith('ai.editor', 'route')
  })

  it('POST JSON puis formulaire : change le scénario du processus', async () => {
    const res = await POST(postJson({ scenario: 'no-claude' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, scenario: 'no-claude' })
    expect(editorMockScenario()).toBe('no-claude')

    const form = new FormData()
    form.set('scenario', 'no-sanity-token')
    const res2 = await POST(new Request(URL_, { method: 'POST', body: form }))
    expect(res2.status).toBe(200)
    expect(editorMockScenario()).toBe('no-sanity-token')
    expect(((await (await GET()).json()) as { scenario: string }).scenario).toBe('no-sanity-token')
  })

  it('400 sur un scénario inconnu ou un corps illisible (scénario inchangé)', async () => {
    const res = await POST(postJson({ scenario: 'boom' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('bad_request')
    expect(body.error.message).toContain('no-claude')
    const bad = new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
    expect((await POST(bad)).status).toBe(400)
    expect(editorMockScenario()).toBe('ready')
  })

  it('403 en requête d’une autre origine', async () => {
    expect((await POST(postJson({ scenario: 'no-claude' }, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
    expect((await POST(postJson({ scenario: 'no-claude' }, { origin: 'https://evil.example' }))).status).toBe(403)
    expect(editorMockScenario()).toBe('ready')
  })

  it('401 / 403 de la session relayés (sans droit ai.editor : rien ne change)', async () => {
    requireCapability.mockRejectedValue(new AdminAuthError(401, 'unauthorized', 'Sign in'))
    expect((await GET()).status).toBe(401)
    requireCapability.mockRejectedValue(new AdminAuthError(403, 'forbidden', 'Forbidden'))
    expect((await POST(postJson({ scenario: 'no-claude' }))).status).toBe(403)
    expect(editorMockScenario()).toBe('ready')
  })
})
