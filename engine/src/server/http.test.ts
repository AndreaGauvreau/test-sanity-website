import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, describe, it } from 'vitest'
import type { EditJob, EditorState, EngineUser } from '../../../src/admin/core/contracts'
import { signEngineUser } from '../../../src/admin/core/engine/signature'
import { fakeScenarios } from '../claude'
import { CLIENT, editRequest, HERO_CSS, makeBench, type Bench } from '../jobs/testing'
import { registerEditorRoutes } from './editor-routes'
import { createEngineServer, createRouter, MAX_BODY_BYTES } from './http'

/**
 * Serveur HTTP du moteur de bout en bout (127.0.0.1, port libre) : authentification Bearer + identité signée, droits,
 * corps bornés, erreurs au format du contrat, et les routes de l'éditeur sur le vrai service (faux Claude).
 */

const SECRET = 'engine-secret-for-tests-0123456789'
const EDITOR: EngineUser = { id: 'u-ed', name: 'Eddie', email: 'eddie@conduit.test', role: 'editor' }

let bench: Bench | null = null
let server: Server | null = null
afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = null
  await bench?.cleanup()
  bench = null
})

async function boot(script = [fakeScenarios.editCss(HERO_CSS, 'color: var(--color-text-muted);', 'color: var(--color-text);', 'Darker.')]) {
  bench = await makeBench(script)
  const router = createRouter()
  registerEditorRoutes(router, bench.service, async () => (await bench!.service.state('/')).health)
  // Route d'extension (engine-publish) : droit réservé à Kuartz.
  router.add({ method: 'GET', path: '/publish/diff/:id', capability: 'publish.diff', handler: ({ params }) => ({ json: { diff: params.id } }) })
  router.add({
    method: 'GET',
    path: '/boom',
    capability: null,
    handler: () => {
      throw new Error('secret detail')
    },
  })
  server = createEngineServer({ router, secret: SECRET, log: () => {} })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const call = async (method: string, path: string, options: { user?: EngineUser | null; body?: string | object; bearer?: string; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { ...options.headers }
    if (options.bearer !== '') headers.authorization = `Bearer ${options.bearer ?? SECRET}`
    if (options.user !== null) Object.assign(headers, await signEngineUser(options.user ?? CLIENT, SECRET))
    let body: string | undefined
    if (options.body !== undefined) {
      body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
      headers['content-type'] ??= 'application/json'
    }
    const response = await fetch(`${base}${path}`, { method, headers, body })
    const type = response.headers.get('content-type') ?? ''
    return { status: response.status, headers: response.headers, json: type.includes('json') ? await response.json() : null, raw: type.includes('png') ? Buffer.from(await response.arrayBuffer()) : null }
  }
  return call
}

describe('authentification et erreurs', () => {
  it('401 sans Bearer, mauvais Bearer, sans identité ou identité retouchée ; jamais 401 ailleurs', async () => {
    const call = await boot()
    assert.equal((await call('GET', '/health', { bearer: '' })).status, 401)
    assert.equal((await call('GET', '/health', { bearer: 'wrong-secret' })).status, 401)
    assert.equal((await call('GET', '/health', { user: null })).status, 401)
    const signed = await signEngineUser(CLIENT, SECRET)
    const forged = Buffer.from(JSON.stringify({ ...CLIENT, role: 'kuartz' })).toString('base64url')
    const tampered = await call('GET', '/health', { user: null, headers: { 'x-kz-user': forged, 'x-kz-user-sig': signed['x-kz-user-sig'] } })
    assert.deepEqual([tampered.status, tampered.json], [401, { error: { code: 'unauthorized', message: 'Unauthorized.' } }])
    // Route inconnue : 404 seulement APRÈS l'authentification.
    assert.equal((await call('GET', '/nope', { bearer: '' })).status, 401)
    assert.equal((await call('GET', '/nope')).status, 404)
  })

  it('droits revérifiés d’après le rôle signé ; 500 sans détail', async () => {
    const call = await boot()
    assert.equal((await call('GET', '/publish/diff/chg_x', { user: EDITOR })).status, 403)
    assert.deepEqual((await call('GET', '/publish/diff/chg_x', { user: { ...CLIENT, role: 'kuartz' } })).json, { diff: 'chg_x' })
    const boom = await call('GET', '/boom')
    assert.deepEqual([boom.status, boom.json], [500, { error: { code: 'internal', message: 'Internal error of the AI engine.' } }])
  })

  it('corps : JSON seulement, borné à 64 Kio ; en-têtes no-store', async () => {
    const call = await boot()
    const huge = await call('POST', '/editor/requests', { body: JSON.stringify({ note: 'x'.repeat(MAX_BODY_BYTES) }) })
    assert.equal(huge.status, 413)
    assert.equal((await call('POST', '/editor/requests', { body: '{ nope' })).status, 400)
    assert.equal((await call('POST', '/editor/requests', { body: 'a=b', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 415)
    const health = await call('GET', '/health')
    assert.equal(health.headers.get('cache-control'), 'no-store')
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(health.json.version, 'test')
  })
})

describe('routes de l’éditeur (contrat engine.ts)', () => {
  it('demande (201) → travail → capture → état → validate ; 409 au format du contrat', async () => {
    const call = await boot()
    const created = await call('POST', '/editor/requests', { body: editRequest() })
    assert.equal(created.status, 201)
    const job = created.json as EditJob
    assert.equal(job.status, 'queued')
    const busy = await call('POST', '/editor/requests', { body: editRequest(), user: EDITOR })
    assert.deepEqual([busy.status, busy.json.error.code], [409, 'busy'])
    const done = await bench!.until(job.id, ['done', 'failed'])
    assert.equal(done.status, 'done')
    await bench!.service.idle()

    const polled = await call('GET', `/editor/jobs/${job.id}`)
    assert.equal((polled.json as EditJob).status, 'done')
    const shot = await call('GET', `/editor/jobs/${job.id}/shots/375-after.png`)
    assert.equal(shot.status, 200)
    assert.equal(shot.headers.get('content-type'), 'image/png')
    assert.equal((await call('GET', `/editor/jobs/${job.id}/shots/..%2F..%2Fdata%2Feditor.json`)).status, 404)
    assert.equal((await call('GET', `/editor/jobs/${job.id}/shots/9-before.png`)).status, 404)

    const state = await call('GET', '/editor/state?page=/')
    const editorState = state.json as EditorState
    assert.equal(editorState.pending?.status, 'to-validate')
    assert.equal(editorState.thread.length, 1)
    assert.equal((await call('GET', '/editor/state')).status, 400)
    assert.equal((await call('GET', '/editor/state?page=https://evil.example')).status, 400)

    const awaiting = await call('POST', '/editor/requests', { body: editRequest() })
    assert.deepEqual([awaiting.status, awaiting.json.error.code], [409, 'awaiting_validation'])
    const validated = await call('POST', `/editor/changes/${job.changeId}/validate`)
    assert.equal(validated.json.status, 'validated')
    assert.equal((await call('POST', `/editor/changes/chg_unknown00/cancel`)).status, 404)
    assert.equal((await call('GET', '/editor/jobs/job_unknown00')).status, 404)
    assert.equal((await call('POST', `/editor/jobs/${job.id}/answer`, { body: { answers: [] } })).status, 409)
  })

  it('stop d’une demande en cours via HTTP', async () => {
    const call = await boot([{ steps: [{ kind: 'wait', ms: 5_000 }], message: 'x' }])
    const job = (await call('POST', '/editor/requests', { body: editRequest() })).json as EditJob
    await bench!.until(job.id, ['running'])
    for (let i = 0; i < 100 && bench!.agent.runs.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10))
    const stopped = await call('POST', `/editor/jobs/${job.id}/stop`)
    assert.equal((stopped.json as EditJob).status, 'stopped')
    assert.equal((stopped.json as EditJob).error, 'Stopped — nothing was changed.')
  })
})

describe('routeur', () => {
  it('refuse une route déjà enregistrée et les segments douteux', () => {
    const router = createRouter()
    router.add({ method: 'GET', path: '/a/:id', capability: null, handler: () => ({ json: 1 }) })
    assert.throws(() => router.add({ method: 'GET', path: '/a/:id', capability: null, handler: () => ({ json: 2 }) }), /already registered/)
    assert.equal(router.match('GET', '/a/..'), null)
    assert.equal(router.match('GET', '/a/%2e%2e'), null)
    assert.equal(router.match('GET', '/a/x%2Fy'), null)
    assert.equal(router.match('POST', '/a/x'), null)
    assert.deepEqual(router.match('GET', '/a/x-1')?.params, { id: 'x-1' })
  })
})
