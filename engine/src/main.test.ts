import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, it } from 'vitest'
import type { EditJob, EditorState, EngineHealth } from '../../src/admin/core/contracts'
import { signEngineUser } from '../../src/admin/core/engine/signature'
import { createFakeAgent, fakeScenarios } from './claude'
import { EngineConfigError } from './config'
import { CLIENT, conduitSanity, editRequest, fakePreview, freshSignal, HERO_CSS, makeWorkspace } from './jobs/testing'
import { startEngine, type RunningEngine } from './main'
import type { ChildLike, SpawnFn } from './preview/process'

/**
 * Câblage complet du moteur (startEngine) sur un espace de travail temporaire : aperçu simulé (faux processus, fausse
 * sonde), faux Claude, faux Sanity, faux Chrome. Aucun serveur réel autre que celui du test (port libre, 127.0.0.1).
 */

const SECRET = 'engine-secret-for-main-test-0123'

let engine: RunningEngine | null = null
let cleanup: (() => Promise<void>) | null = null
afterEach(async () => {
  await engine?.stop('test end')
  engine = null
  await cleanup?.()
  cleanup = null
})

function fakeSpawn() {
  const children: (EventEmitter & ChildLike)[] = []
  const spawn: SpawnFn = () => {
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill(this: EventEmitter) {
        setTimeout(() => this.emit('exit', null, 'SIGTERM'), 1)
        return true
      },
    }) as EventEmitter & ChildLike
    children.push(child)
    return child
  }
  return { spawn, children }
}

async function boot(extraEnv: Record<string, string> = {}) {
  const ws = await makeWorkspace()
  cleanup = () => rm(ws.workspace, { recursive: true, force: true })
  const env = {
    ENGINE_MODE: 'local',
    ENGINE_PORT: '4943',
    ENGINE_PREVIEW_PORT: '4942',
    ENGINE_SECRET: SECRET,
    ENGINE_PREVIEW_SECRET: 'preview-secret-for-main-test',
    ADMIN_ORIGIN: 'http://127.0.0.1:4040',
    ENGINE_WORKSPACE: ws.workspace,
    ENGINE_SOURCE_REPO: path.join(path.dirname(ws.workspace), 'kz-source-that-is-not-used'),
    NEXT_PUBLIC_SANITY_PROJECT_ID: 'abc123',
    NEXT_PUBLIC_SANITY_DATASET: 'development',
    SANITY_API_READ_TOKEN: 'read-token',
    ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-real',
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    ...extraEnv,
  }
  const spawn = fakeSpawn()
  const agent = createFakeAgent([fakeScenarios.editCss(HERO_CSS, 'color: var(--color-text-muted);', 'color: var(--color-text);', 'Darker.')])
  const lines: string[] = []
  engine = await startEngine(env, {
    listenPort: 0,
    spawnPreview: spawn.spawn,
    previewFetch: (async () => new Response('ok')) as unknown as typeof fetch,
    visual: fakePreview().preview,
    signal: freshSignal(),
    runAgent: (run) => agent(run),
    sanity: conduitSanity(),
    log: (line) => lines.push(line),
  })
  const base = `http://127.0.0.1:${engine.port}`
  const call = async (method: string, route: string, body?: object) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { authorization: `Bearer ${SECRET}`, ...(await signEngineUser(CLIENT, SECRET)), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, json: await response.json() }
  }
  return { ws, call, spawn, lines, agent }
}

describe('startEngine', () => {
  it('démarre, lance l’aperçu surveillé, sert /health et l’éditeur, s’arrête proprement', async () => {
    const { ws, call, spawn, lines } = await boot()
    assert.ok(existsSync(path.join(ws.workspace, 'data', 'engine.pid')))
    assert.equal(spawn.children.length, 1)
    assert.equal(await engine!.context.preview.waitReady(2_000), true)
    const health = (await call('GET', '/health')).json as EngineHealth
    assert.deepEqual(
      { ok: health.ok, mode: health.mode, access: health.claude.access, sanityWrite: health.sanityWrite, preview: health.preview, git: health.git },
      {
        ok: true,
        mode: 'local',
        access: 'api-key',
        sanityWrite: true,
        preview: { url: 'http://127.0.0.1:4942', ready: true },
        git: { branch: 'draft', clean: true, aheadOfMain: 0 },
      },
    )
    const created = await call('POST', '/editor/requests', editRequest())
    assert.equal(created.status, 201)
    const job = created.json as EditJob
    for (let i = 0; i < 500; i++) {
      const polled = (await call('GET', `/editor/jobs/${job.id}`)).json as EditJob
      if (polled.status === 'done' || polled.status === 'failed') break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    await engine!.context.editor.idle()
    const state = (await call('GET', '/editor/state?page=/')).json as EditorState
    assert.equal(state.pending?.status, 'to-validate')
    assert.equal(state.preview.url, 'http://127.0.0.1:4942/?kz_preview=preview-secret-for-main-test')
    assert.equal(state.health.git.aheadOfMain, 1)
    // Aucun secret dans le journal du moteur.
    assert.ok(lines.every((line) => !line.includes(SECRET) && !line.includes('preview-secret-for-main-test') && !line.includes('sk-ant-api03')))
    await engine!.stop('test')
    assert.equal(existsSync(path.join(ws.workspace, 'data', 'engine.pid')), false)
    assert.equal(engine!.context.preview.status().state, 'stopped')
    engine = null
  })

  it('sans accès Claude : démarre quand même, santé dégradée, demande refusée 503', async () => {
    const { call } = await boot({ ANTHROPIC_API_KEY: '' })
    await engine!.context.preview.waitReady(2_000)
    const health = (await call('GET', '/health')).json as EngineHealth
    assert.deepEqual([health.ok, health.claude.access], [false, 'none'])
    const refused = await call('POST', '/editor/requests', editRequest())
    assert.deepEqual([refused.status, refused.json.error.code], [503, 'unavailable'])
  })

  it('refus clair au démarrage : configuration invalide ou espace de travail absent', async () => {
    await assert.rejects(startEngine({}, { log: () => {} }), EngineConfigError)
    await assert.rejects(
      startEngine(
        {
          ENGINE_PORT: '4943',
          ENGINE_PREVIEW_PORT: '4942',
          ENGINE_SECRET: SECRET,
          ENGINE_PREVIEW_SECRET: 'preview-secret-for-main-test',
          ADMIN_ORIGIN: 'http://127.0.0.1:4040',
          ENGINE_WORKSPACE: '/nonexistent/kz-engine',
          ENGINE_SOURCE_REPO: '/nonexistent/site',
          NEXT_PUBLIC_SANITY_PROJECT_ID: 'abc123',
          NEXT_PUBLIC_SANITY_DATASET: 'development',
          SANITY_API_READ_TOKEN: 'read-token',
        },
        { log: () => {} },
      ),
      /engine:setup/,
    )
  })
})
