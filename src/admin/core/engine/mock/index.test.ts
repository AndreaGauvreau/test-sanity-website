import { afterEach, describe, expect, it } from 'vitest'

import type { EngineHealth } from '../../contracts/engine'
import type { EngineUser } from '../../contracts/session'
import { editorMockScenario, mockEditorHealth, setEditorMockScenario } from './editor'
import { handleMockEngineRequest } from './index'

const user: EngineUser = { id: 'dev-client', name: 'Dev', email: 'dev@example.com', role: 'client' }
const health = async () => {
  const res = await handleMockEngineRequest({ method: 'GET', segments: ['health'], params: {}, query: new URLSearchParams(), body: undefined, user })
  expect(res.status).toBe(200)
  return (res as { json: EngineHealth }).json
}

describe('répartiteur du moteur simulé — GET /health', () => {
  const initial = editorMockScenario()
  afterEach(() => setEditorMockScenario(initial))

  it('régression FOLLOWUPS #39 : GET /health = mockEditorHealth(), suit le scénario de l’éditeur simulé', async () => {
    setEditorMockScenario('ready')
    expect(await health()).toEqual(mockEditorHealth())
    expect((await health()).ok).toBe(true)

    setEditorMockScenario('no-claude')
    const h = await health()
    expect(h).toEqual(mockEditorHealth())
    expect(h).toMatchObject({ ok: false, claude: { access: 'none' } })

    setEditorMockScenario('preview-starting')
    expect(await health()).toMatchObject({ ok: false, preview: { ready: false } })
  })
})
