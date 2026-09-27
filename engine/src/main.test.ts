import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, it } from 'vitest'
import type { EditJob, EditorState, EngineHealth } from '../../src/admin/core/contracts'
import { EDITOR_VIEWPORTS } from '../../src/admin/core/contracts/engine'
import { verifyPreviewToken } from '../../src/admin/core/engine/preview-token'
import { createFakeAgent, fakeScenarios } from './claude'
import { EngineConfigError } from './config'
import { CLIENT, conduitSanity, editRequest, fakePreview, freshSignal, HERO_CSS, LEDE_MUTED, ledeColor, makeWorkspace, signedIdentity, TEST_IDENTITY } from './jobs/testing'
import { startEngine, type EngineOverrides, type RunningEngine } from './main'
import type { EngineModule } from './server/modules'
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

/** `prepare` : appelé sur l'espace de travail AVANT le démarrage (ex. magasin laissé par une version précédente). */
async function boot(extraEnv: Record<string, string> = {}, extra: EngineOverrides = {}, prepare?: (workspace: string) => Promise<void>) {
  const ws = await makeWorkspace()
  cleanup = () => rm(ws.workspace, { recursive: true, force: true })
  await prepare?.(ws.workspace)
  const env = {
    ENGINE_MODE: 'local',
    ENGINE_PORT: '4943',
    ENGINE_PREVIEW_PORT: '4942',
    ENGINE_SECRET: SECRET,
    ENGINE_PREVIEW_SECRET: 'preview-secret-for-main-test',
    ENGINE_IDENTITY_PUBLIC_KEY: TEST_IDENTITY.publicKey,
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
  const probeCookies: string[] = []
  const agent = createFakeAgent([fakeScenarios.editCss(HERO_CSS, LEDE_MUTED, ledeColor('var(--color-text)'), 'Darker.')])
  const lines: string[] = []
  engine = await startEngine(env, {
    listenPort: 0,
    spawnPreview: spawn.spawn,
    previewFetch: (async (_url: unknown, init?: RequestInit) => {
      probeCookies.push(new Headers(init?.headers).get('cookie') ?? '')
      return new Response('ok')
    }) as unknown as typeof fetch,
    visual: fakePreview().preview,
    signal: freshSignal(),
    runAgent: (run) => agent(run),
    sanity: conduitSanity(),
    log: (line) => lines.push(line),
    ...extra,
  })
  const base = `http://127.0.0.1:${engine.port}`
  const call = async (method: string, route: string, body?: object) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { authorization: `Bearer ${SECRET}`, ...(await signedIdentity(CLIENT)), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, json: await response.json() }
  }
  return { ws, call, spawn, lines, agent, probeCookies }
}

/**
 * `data/editor.json` tel que l'a laissé l'éditeur avant le 2026-09-28 (forme du vrai magasin) : une demande faite en
 * Tablet quand ce format valait 768 px, refusée par Claude (« 768 px, sous le point de rupture de 810 px »), sa
 * modification annulée, et son entrée dans le fil de « / ».
 */
function legacyEditorData(jobId: string, changeId: string) {
  const at = '2026-09-28T06:40:00.000Z'
  const targets = [{ zone: 'hero.lede', index: 0, label: 'Hero · Lede' }]
  return {
    version: 1,
    jobs: {
      [jobId]: {
        job: {
          id: jobId,
          changeId,
          kind: 'request',
          request: { page: '/', targets, scope: ['style'], note: 'The tablet version looks wrong.', viewport: 768 },
          requestedBy: CLIENT,
          createdAt: at,
          status: 'rejected',
          steps: [
            { at, kind: 'info', label: 'Capturing the page / before the change (375, 768 and 1280 px)…' },
            { at, kind: 'info', label: 'Claude changed nothing.' },
          ],
          summary: [],
          checks: [],
          texts: [],
          hardcoded: [],
          attempts: 1,
          startedAt: at,
          message: 'You were looking at the page at 768 px, just below the 810 px tablet step.',
          finishedAt: at,
        },
        internal: { headBefore: null, sessionId: null, textsDirty: false },
      },
    },
    changes: {
      [changeId]: {
        change: { id: changeId, page: '/', targets, status: 'cancelled', jobIds: [jobId], adjustments: 0, summary: [], checks: [], createdAt: at, createdBy: CLIENT },
        internal: { baseCommit: 'abc1234', commits: [] },
      },
    },
    threads: { '/': [{ type: 'job', jobId }] },
  }
}

describe('startEngine', () => {
  it('démarre, lance l’aperçu surveillé, sert /health et l’éditeur, s’arrête proprement', async () => {
    const { ws, call, spawn, lines, probeCookies } = await boot()
    assert.ok(existsSync(path.join(ws.workspace, 'data', 'engine.pid')))
    assert.equal(spawn.children.length, 1)
    assert.equal(await engine!.context.preview.waitReady(2_000), true)
    // La sonde porte un jeton du moteur dérivé du secret racine (le proxy refuse le secret racine lui-même).
    const probeToken = probeCookies[0].replace(/^kz_preview=/, '')
    assert.ok(!probeCookies[0].includes('preview-secret-for-main-test'))
    assert.ok(await verifyPreviewToken('preview-secret-for-main-test', probeToken))
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
    // SEC-09 : l'iframe reçoit un jeton COURT lié à l'utilisateur, jamais le secret racine.
    const url = new URL(state.preview.url)
    assert.equal(`${url.origin}${url.pathname}`, 'http://127.0.0.1:4942/')
    const token = url.searchParams.get('kz_preview')!
    assert.ok(!state.preview.url.includes('preview-secret-for-main-test'))
    const verified = await verifyPreviewToken('preview-secret-for-main-test', token)
    assert.ok(verified && verified.exp - Date.now() / 1000 <= 15 * 60 + 5 && verified.exp - Date.now() / 1000 > 14 * 60)
    assert.equal(Buffer.from(token.split('.')[2], 'base64url').toString(), CLIENT.id)
    assert.equal(await verifyPreviewToken('another-preview-secret-000', token), null)
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

  it('magasin d’une version précédente (demande en Tablet 768) : démarre, relit état, fil et demande ; nouvelle demande en Tablet 810, 768 refusé', async () => {
    const jobId = 'job_legacytablet768'
    const changeId = 'chg_legacytablet768'
    const { call } = await boot({}, {}, async (workspace) => {
      await writeFile(path.join(workspace, 'data', 'editor.json'), JSON.stringify(legacyEditorData(jobId, changeId), null, 2))
    })
    await engine!.context.preview.waitReady(2_000)
    // Relue telle quelle : l'historique garde la largeur d'alors (l'admin l'affiche en Tablet, `viewportOf`).
    const state = await call('GET', '/editor/state?page=/')
    assert.equal(state.status, 200)
    const { thread, active, pending } = state.json as EditorState
    assert.deepEqual(
      thread.map((entry) => (entry.type === 'job' ? [entry.job.id, entry.job.status, entry.job.request.viewport] : [entry.type])),
      [[jobId, 'rejected', 768]],
    )
    assert.deepEqual([active, pending], [null, null])
    const legacy = await call('GET', `/editor/jobs/${jobId}`)
    assert.deepEqual([legacy.status, (legacy.json as EditJob).request.viewport], [200, 768])
    // Nouvelle demande : seulement les formats actuels du contrat.
    const old = await call('POST', '/editor/requests', { ...editRequest(), viewport: 768 })
    assert.deepEqual([old.status, old.json.error.message], [400, 'Invalid screen size.'])
    const created = await call('POST', '/editor/requests', { ...editRequest(), viewport: EDITOR_VIEWPORTS.tablet })
    assert.equal(created.status, 201)
    await engine!.context.editor.idle()
    const done = (await call('GET', `/editor/jobs/${(created.json as EditJob).id}`)).json as EditJob
    assert.equal(done.request.viewport, EDITOR_VIEWPORTS.tablet)
    assert.ok(done.steps.some((step) => step.label === 'Capturing the page / before the change (375, 810 and 1280 px)…'))
    const after = (await call('GET', '/editor/state?page=/')).json as EditorState
    assert.deepEqual(after.thread.flatMap((entry) => (entry.type === 'job' ? [entry.job.request.viewport] : [])), [768, EDITOR_VIEWPORTS.tablet])
  })

  it('clé API enregistrée depuis l’admin : santé, éditeur et Ask AI la voient SANS redémarrage ; jamais renvoyée', async () => {
    const key = `sk-ant-api03-${'k'.repeat(90)}-HOT1`
    const { call, lines, ws } = await boot({ ANTHROPIC_API_KEY: '' })
    await engine!.context.preview.waitReady(2_000)
    assert.equal(((await call('GET', '/health')).json as EngineHealth).claude.access, 'none')
    assert.equal(engine!.context.access.ok, false)
    const saved = await call('POST', '/claude/access', { kind: 'api-key', apiKey: key })
    assert.equal(saved.status, 200)
    assert.deepEqual([saved.json.source, saved.json.keyHint], ['stored', 'sk-ant-…HOT1'])
    // Rechargement à chaud : même processus, accès lu à chaque lecture.
    assert.equal(((await call('GET', '/health')).json as EngineHealth).claude.access, 'api-key')
    assert.deepEqual(engine!.context.access, { ok: true, access: { kind: 'api-key', secret: key } })
    const created = await call('POST', '/editor/requests', editRequest())
    assert.equal(created.status, 201)
    await engine!.context.editor.idle()
    const onDisk = await import('node:fs/promises').then((fs) => fs.readFile(path.join(ws.workspace, 'data', 'claude-access.json'), 'utf8'))
    assert.ok(!onDisk.includes(key) && !JSON.stringify(saved.json).includes(key) && !lines.join('\n').includes(key))
  })

  it('AI settings (B5) : la demande SUIVANTE prend le nouveau modèle et le nouvel effort, une demande en cours garde les siens ; /health suit', async () => {
    const calls: { model: string; effort: string }[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const agent = createFakeAgent(() => fakeScenarios.nothingChanged())
    const { call, ws } = await boot(
      { EDITOR_MODEL: 'claude-opus-5-5', EDITOR_EFFORT: 'medium' },
      {
        runAgent: async (run, limits) => {
          calls.push({ model: limits.model, effort: limits.effort })
          if (calls.length === 1) await gate
          return agent(run)
        },
      },
    )
    await engine!.context.preview.waitReady(2_000)
    const initial = await call('GET', '/claude/settings')
    assert.deepEqual([initial.status, initial.json.source, initial.json.current], [200, 'default', { model: 'claude-opus-5-5', effort: 'medium' }])
    assert.equal(((await call('GET', '/health')).json as EngineHealth).claude.editorModel, 'claude-opus-5-5')

    // 1. Fable 5.1 / high, puis une demande (bloquée dans Claude le temps de changer encore les réglages).
    assert.equal((await call('POST', '/claude/settings', { model: 'claude-fable-5-1', effort: 'high' })).status, 200)
    assert.equal(((await call('GET', '/health')).json as EngineHealth).claude.editorModel, 'claude-fable-5-1')
    const first = await call('POST', '/editor/requests', editRequest())
    assert.equal(first.status, 201)
    for (let i = 0; i < 500 && calls.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 5))
    // 2. Pendant la demande : Sonnet 5 / low. La demande en cours ne change pas.
    const changed = await call('POST', '/claude/settings', { model: 'claude-sonnet-5', effort: 'low' })
    assert.deepEqual([changed.status, changed.json.current], [200, { model: 'claude-sonnet-5', effort: 'low' }])
    assert.equal(engine!.context.settings.model, 'claude-sonnet-5')
    release()
    await engine!.context.editor.idle()
    const firstJob = (await call('GET', `/editor/jobs/${(first.json as EditJob).id}`)).json as EditJob
    assert.equal(firstJob.status, 'rejected')
    // Coût et modèle journalisés : ceux de la demande (Fable 5.1), pas ceux choisis pendant qu'elle tournait.
    assert.equal(firstJob.usage?.model, 'claude-fable-5-1')
    // 3. Demande suivante : nouveaux réglages, sans redémarrage.
    assert.equal((await call('POST', '/editor/requests', editRequest())).status, 201)
    await engine!.context.editor.idle()
    assert.deepEqual(calls, [
      { model: 'claude-fable-5-1', effort: 'high' },
      { model: 'claude-sonnet-5', effort: 'low' },
    ])
    assert.equal(((await call('GET', '/health')).json as EngineHealth).claude.editorModel, 'claude-sonnet-5')
    // Corps invalide : 400, rien ne change ; fichier écrit dans data/.
    const bad = await call('POST', '/claude/settings', { model: 'claude-sonnet-5', effort: 'low', maxTurns: 99 })
    assert.deepEqual([bad.status, bad.json.error.code], [400, 'bad_request'])
    const onDisk = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(path.join(ws.workspace, 'data', 'ai-settings.json'), 'utf8')))
    assert.deepEqual([onDisk.model, onDisk.effort], ['claude-sonnet-5', 'low'])
  })

  it('FOLLOWUPS #14 : l’arrêt attend le crochet stop des modules avant d’écrire le magasin', async () => {
    const order: string[] = []
    const slow: EngineModule = {
      name: 'slow',
      register: () => {},
      stop: async () => {
        await new Promise((resolve) => setTimeout(resolve, 150))
        order.push('module stopped')
      },
    }
    await boot({}, { modules: [slow], log: (line) => order.push(line) })
    await engine!.stop('test')
    engine = null
    assert.ok(order.indexOf('module stopped') >= 0 && order.indexOf('module stopped') < order.indexOf('Engine stopped.'))
  })

  it('FOLLOWUPS #12 : ENGINE_FAKE_CLAUDE=css — sans clé Claude, avertissement bruyant (journal, /health, modèle), demande menée au bout', async () => {
    const lines: string[] = []
    const sanity = conduitSanity()
    const { ws, call } = await boot({ ANTHROPIC_API_KEY: '', ENGINE_FAKE_CLAUDE: 'css' }, { runAgent: undefined, log: (line) => lines.push(line), sanity })
    assert.ok(lines.some((line) => line.includes('⚠⚠⚠ ENGINE_FAKE_CLAUDE=css')))
    await engine!.context.preview.waitReady(2_000)
    const health = (await call('GET', '/health')).json as EngineHealth & { fakeClaude?: string; warnings?: string[] }
    assert.deepEqual([health.ok, health.claude.access, health.fakeClaude], [true, 'none', 'css'])
    assert.match(health.warnings?.[0] ?? '', /FAKE Claude active/)
    const job = (await call('POST', '/editor/requests', editRequest({ zone: 'hero.lede' }))).json as EditJob
    assert.ok(job.id, JSON.stringify(job))
    await engine!.context.editor.idle()
    const done = (await call('GET', `/editor/jobs/${job.id}`)).json as EditJob
    assert.equal(done.status, 'done', JSON.stringify(done.steps))
    assert.ok(done.steps.some((step) => step.kind === 'warn' && /FAKE Claude \(css\)/.test(step.label)))
    const state = (await call('GET', '/editor/state?page=/')).json as EditorState
    assert.match(state.model.label, /Fake Claude \(css\)/)
    // Journal de consommation exact : rien n'a été consommé → aucun aiUsage dans Sanity ni dans le secours local.
    assert.ok(done.usage && done.usage.costUsd > 0, 'coût simulé gardé dans la demande')
    assert.deepEqual(Object.keys(sanity.docs).filter((id) => id.startsWith('aiUsage.')), [])
    assert.equal(existsSync(path.join(ws.workspace, 'data', 'usage-pending.jsonl')), false)
    assert.ok(lines.some((line) => line.includes(`usage not recorded for ${job.id}: fake Claude (css)`)))
  })

  it('SEC-08 : domaines du site lus dans <ENGINE_SOURCE_REPO>/src/admin.config.ts et passés au cycle de l’éditeur', async () => {
    const source = await mkdtemp(path.join(os.tmpdir(), 'kz-source-'))
    await mkdir(path.join(source, 'src'), { recursive: true })
    await writeFile(
      path.join(source, 'src', 'admin.config.ts'),
      "const adminConfig = { site: { name: 'Test', domain: 'example-site.com', url: 'https://www.example-site.com' }, pages: [] }\nexport default adminConfig\n",
    )
    const domains: (readonly string[] | undefined)[] = []
    try {
      const agent = createFakeAgent([fakeScenarios.nothingChanged('See https://www.example-site.com/pricing or https://other.example.')])
      const { call } = await boot({ ENGINE_SOURCE_REPO: source }, { runAgent: (run) => (domains.push(run.allowedDomains), agent(run)) })
      await engine!.context.preview.waitReady(2_000)
      const job = (await call('POST', '/editor/requests', editRequest())).json as EditJob
      await engine!.context.editor.idle()
      const done = (await call('GET', `/editor/jobs/${job.id}`)).json as EditJob
      assert.deepEqual(domains, [['example-site.com', 'www.example-site.com']])
      assert.equal(done.message, 'See https://www.example-site.com/pricing or [link removed].')
    } finally {
      await rm(source, { recursive: true, force: true })
    }
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
          ENGINE_IDENTITY_PUBLIC_KEY: TEST_IDENTITY.publicKey,
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
