import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, it } from 'vitest'
import type { EditJob, EditorState, EngineUser, PublishStatus } from '../../../src/admin/core/contracts'
import { signEngineUser } from '../../../src/admin/core/engine/signature'
import { createFakeAgent, fakeScenarios } from '../claude'
import { CLIENT, conduitSanity, editRequest, fakePreview, freshSignal, HERO_CSS, KUARTZ, makeWorkspace, PAGE_DOC } from '../jobs/testing'
import { MODULES, startEngine, type RunningEngine } from '../main'
import type { ChildLike, SpawnFn } from '../preview/process'
import { usageModule } from '../usage'
import { versionsModule } from '../versions'
import { createPublishModule, publishServiceOf } from './index'
import { answerDraftQueries, conduitCatalog, writeDraft } from './testing'

/**
 * Câblage d'engine-publish dans le moteur entier (startEngine, vrai serveur HTTP sur un port libre, en-têtes signés) :
 * routes et droits par rôle, port `pendingTotal`, journal aiUsage après une vraie demande (faux Claude), publication
 * contenu + code. Aucun réseau hors 127.0.0.1, aucun serveur réel.
 */

const SECRET = 'engine-secret-for-publish-test-01'
const EDITOR: EngineUser = { id: 'u-ed', name: 'Paul Editor', email: 'paul@conduit.test', role: 'editor' }

let engine: RunningEngine | null = null
let cleanup: (() => Promise<void>) | null = null
afterEach(async () => {
  if (engine) await publishServiceOf(engine.context)?.idle()
  await engine?.stop('test end')
  engine = null
  await cleanup?.()
  cleanup = null
})

const spawn: SpawnFn = () =>
  Object.assign(new EventEmitter(), {
    pid: undefined,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill(this: EventEmitter) {
      setTimeout(() => this.emit('exit', null, 'SIGTERM'), 1)
      return true
    },
  }) as EventEmitter & ChildLike

async function boot(options: { modules?: boolean } = {}) {
  const ws = await makeWorkspace()
  cleanup = () => rm(ws.workspace, { recursive: true, force: true })
  const sanity = conduitSanity()
  answerDraftQueries(sanity)
  const agent = createFakeAgent([fakeScenarios.editCss(HERO_CSS, 'color: var(--color-text-muted);', 'color: var(--color-text);', 'Darker.')])
  const env = {
    ENGINE_MODE: 'local',
    ENGINE_PORT: '4953',
    ENGINE_PREVIEW_PORT: '4952',
    ENGINE_SECRET: SECRET,
    ENGINE_PREVIEW_SECRET: 'preview-secret-for-publish-test',
    ADMIN_ORIGIN: 'http://127.0.0.1:4040',
    ENGINE_WORKSPACE: ws.workspace,
    ENGINE_SOURCE_REPO: path.join(path.dirname(ws.workspace), 'kz-source-that-is-not-used'),
    NEXT_PUBLIC_SANITY_PROJECT_ID: 'abc123',
    NEXT_PUBLIC_SANITY_DATASET: 'development',
    SANITY_API_READ_TOKEN: 'read-token',
    ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-real',
    PATH: process.env.PATH,
    HOME: process.env.HOME,
  }
  engine = await startEngine(env, {
    listenPort: 0,
    spawnPreview: spawn,
    previewFetch: (async () => new Response('ok')) as unknown as typeof fetch,
    visual: fakePreview().preview,
    signal: freshSignal(),
    runAgent: (run) => agent(run),
    sanity,
    log: () => {},
    ...(options.modules === false
      ? {}
      : { modules: [usageModule, createPublishModule({ catalog: await conduitCatalog(), typecheck: async () => null }), versionsModule] }),
  })
  await engine.context.preview.waitReady(2_000)
  const base = `http://127.0.0.1:${engine.port}`
  const call = async (user: EngineUser, method: string, route: string, body?: object) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { authorization: `Bearer ${SECRET}`, ...(await signEngineUser(user, SECRET)), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, json: await response.json() }
  }
  return { ws, sanity, call }
}

describe('engine-publish dans le moteur', () => {
  it('MODULES de main.ts : usage, publish, versions, ask (dans cet ordre ; ask après usage)', () => {
    assert.deepEqual(
      MODULES.map((module) => module.name),
      ['usage', 'publish', 'versions', 'ask'],
    )
  })

  it('modules par défaut : routes servies, droits revérifiés par rôle', async () => {
    const { call } = await boot({ modules: false })
    for (const user of [CLIENT, EDITOR, KUARTZ]) {
      const status = await call(user, 'GET', '/publish/status')
      assert.equal(status.status, 200)
      assert.equal((status.json as PublishStatus).state, 'idle')
      assert.equal((await call(user, 'GET', '/versions')).status, 200)
    }
    // Diff et retour arrière : Kuartz seulement (403 pour les autres, AVANT tout traitement).
    assert.deepEqual([(await call(CLIENT, 'GET', '/publish/diff/chg_abcdefgh01')).status, (await call(EDITOR, 'GET', '/publish/diff/chg_abcdefgh01')).status], [403, 403])
    assert.equal((await call(KUARTZ, 'GET', '/publish/diff/chg_abcdefgh01')).status, 404)
    assert.equal((await call(CLIENT, 'POST', '/versions/1/rollback', {})).status, 403)
    const rollback = await call(KUARTZ, 'POST', '/versions/1/rollback', {})
    assert.deepEqual([rollback.status, rollback.json.error.code], [404, 'not_found'])
    // Paramètres hostiles refusés par le routeur.
    assert.equal((await call(KUARTZ, 'GET', '/publish/diff/..%2Fetc')).status, 404)
    assert.equal((await call(KUARTZ, 'POST', '/versions/abc/rollback', {})).status, 404)
  })

  it('cycle complet : demande (aiUsage écrit), validation (N du fil), Publish contenu + code, versions, 501 du retour arrière', async () => {
    const { ws, sanity, call } = await boot()
    const created = await call(CLIENT, 'POST', '/editor/requests', editRequest())
    assert.equal(created.status, 201)
    const job = created.json as EditJob
    await engine!.context.editor.idle()
    assert.equal(engine!.context.store.editor.job(job.id)?.job.status, 'done')
    // Journal de consommation : un document privé aiUsage.<id> par demande terminée.
    const usage = sanity.docs[`aiUsage.${job.id}`]
    assert.ok(usage, 'aiUsage écrit')
    assert.deepEqual([usage._type, usage.feature, usage.requestId, (usage.user as { role: string }).role], ['aiUsage', 'editor', job.id, 'client'])

    await writeDraft(sanity, { _id: PAGE_DOC, _type: 'dockSchedulingPage' }, { 'hero.title': 'Dock scheduling, solved.' })
    // Publication refusée tant que la modification attend ✓ Validate.
    const early = await call(CLIENT, 'POST', '/publish', { expected: [PAGE_DOC] })
    assert.deepEqual([early.status, early.json.error.code], [409, 'awaiting_validation'])
    assert.equal((await call(CLIENT, 'POST', `/editor/changes/${job.changeId}/validate`, {})).status, 200)
    const state = (await call(CLIENT, 'GET', '/editor/state?page=/')).json as EditorState
    const validated = state.thread.find((entry) => entry.type === 'validated')
    assert.equal(validated?.type === 'validated' && validated.pendingTotal, 2, 'N = 1 contenu + 1 design')

    const status = (await call(CLIENT, 'GET', '/publish/status')).json as PublishStatus
    assert.deepEqual([status.state, status.pending.total], ['pending', 2])
    const diff = await call(KUARTZ, 'GET', `/publish/diff/${job.changeId}`)
    assert.equal(diff.status, 200)
    assert.match(diff.json.diff, /color: var\(--color-text\);/)
    const expected = [...status.pending.content.map((item) => item.id), ...status.pending.design.map((item) => item.changeId)]
    const stale = await call(CLIENT, 'POST', '/publish', { expected: expected.slice(1) })
    assert.deepEqual([stale.status, stale.json.error.code], [409, 'conflict'])
    const started = await call(CLIENT, 'POST', '/publish', { expected })
    assert.deepEqual([started.status, started.json.state], [200, 'publishing'])
    await publishServiceOf(engine!.context)!.idle()
    await engine!.context.editor.idle()

    const after = (await call(EDITOR, 'GET', '/publish/status')).json as PublishStatus
    assert.equal(after.state, 'published', JSON.stringify(after.run?.error))
    assert.equal(ws.git('rev-parse', 'main'), ws.git('rev-parse', 'publication-1^{commit}'))
    const versions = await call(CLIENT, 'GET', '/versions')
    assert.deepEqual(
      versions.json.publications.map((p: { number: number; status: string; tag?: string }) => [p.number, p.status, p.tag]),
      [[1, 'live', 'publication-1']],
    )
    assert.equal(versions.json.rollback.available, false)
    const rollback = await call(KUARTZ, 'POST', '/versions/1/rollback', {})
    assert.deepEqual([rollback.status, rollback.json.error.code], [501, 'not_implemented'])
    assert.match(rollback.json.error.message, /local mode/)
  })
})
