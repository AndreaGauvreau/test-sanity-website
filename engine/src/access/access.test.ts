import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm, stat, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'vitest'
import type { EngineUser } from '../../../src/admin/core/contracts'
import { CompleteError, credentialEnv, type ClaudeCredential, type CompleteInput, type CompleteResult } from '../claude'
import { CLIENT, KUARTZ, signedIdentity, TEST_IDENTITY } from '../jobs/testing'
import { createEngineServer, createRouter } from '../server/http'
import { registerAccessRoutes } from '.'
import { testApiKey, testSubscription, MODELS_URL, TEST_MESSAGES } from './connection-test'
import { detectMachineLogin, keychainAccount, keychainService, machineLoginOf, systemProbe, type MachineProbe } from './machine'
import { NO_ACCESS, NOT_SIGNED_IN, resolveEngineAccess, SUBSCRIPTION_HOSTED } from './resolve'
import { createClaudeAccessService, type ClaudeAccessDeps } from './service'
import { ACCESS_FILE, openAccessStore, UNREADABLE_KEY, type StoredAccess } from './store'

// Fausses clés de TEST (jamais de vraies) : forme d'une clé API Anthropic, et d'un jeton d'abonnement.
const API_KEY = `sk-ant-api03-${'A1b2C3d4'.repeat(11)}-TEST`
const OTHER_KEY = `sk-ant-api03-${'Z9y8X7w6'.repeat(11)}-KEY2`
const OAT = `sk-ant-oat01-${'x'.repeat(95)}`
const SECRET = 'engine-secret-for-tests-0123456789'
const EDITOR: EngineUser = { id: 'u-ed', name: 'Eddie', email: 'ed@conduit.test', role: 'editor' }

const dirs: string[] = []
const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise((resolve) => server.close(resolve))
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'kz-access-'))
  dirs.push(dir)
  return dir
}

function fakeProbe(loggedIn: boolean, platform: NodeJS.Platform = 'darwin'): MachineProbe & { calls: [string, string][] } {
  const calls: [string, string][] = []
  return {
    calls,
    platform,
    home: '/Users/test',
    user: 'test',
    keychainHas: async (service, account) => {
      calls.push([service, account])
      return loggedIn
    },
    fileExists: async () => false,
  }
}

type FetchCall = { url: string; init: RequestInit }
function fakeFetch(status: number | Error) {
  const calls: FetchCall[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (status instanceof Error) throw status
    return new Response(JSON.stringify({ data: [] }), { status })
  }) as typeof fetch
  return { impl, calls }
}

function fakeComplete(outcome: 'ok' | CompleteError) {
  const calls: CompleteInput[] = []
  const complete = async (input: CompleteInput): Promise<CompleteResult> => {
    calls.push(input)
    if (outcome !== 'ok') throw outcome
    return {
      text: 'OK',
      stopReason: 'success',
      usage: { model: input.model, inputTokens: 10, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, costKind: 'billed', access: 'subscription', durationMs: 5 },
    }
  }
  return Object.assign(complete, { calls })
}

async function makeService(options: Partial<ClaudeAccessDeps> & { dataDir?: string } = {}) {
  const dataDir = options.dataDir ?? (await tempDir())
  const logs: string[] = []
  const deps: ClaudeAccessDeps = {
    env: {},
    mode: 'local',
    localMode: true,
    store: openAccessStore({ dataDir, secret: SECRET }),
    machineLogin: { storageDir: '' },
    probe: fakeProbe(true),
    testModel: 'claude-haiku-4-5-20251001',
    testConfigDir: path.join(dataDir, 'claude-test'),
    fetchImpl: fakeFetch(200).impl,
    complete: fakeComplete('ok'),
    now: () => new Date('2026-09-27T12:00:00Z'),
    log: (line) => logs.push(line),
    ...options,
  }
  const service = createClaudeAccessService(deps)
  await service.refresh()
  return { service, logs, dataDir, deps }
}

describe('magasin chiffré (claude-access.json)', () => {
  it('fichier 0600, clé chiffrée (jamais en clair), relue avec le même secret', async () => {
    const dataDir = await tempDir()
    const store = openAccessStore({ dataDir, secret: SECRET })
    await store.saveApiKey(API_KEY)
    const file = path.join(dataDir, ACCESS_FILE)
    assert.equal((await stat(file)).mode & 0o777, 0o600)
    const raw = await readFile(file, 'utf8')
    assert.ok(!raw.includes(API_KEY) && !raw.includes(API_KEY.slice(-12)), 'la clé ne doit jamais être en clair')
    assert.deepEqual(await store.read(), { saved: 'api-key', apiKey: API_KEY })
  })

  it('autre ENGINE_SECRET ou fichier retouché : clé illisible, message clair, jamais d’exception', async () => {
    const dataDir = await tempDir()
    await openAccessStore({ dataDir, secret: SECRET }).saveApiKey(API_KEY)
    assert.deepEqual(await openAccessStore({ dataDir, secret: 'another-secret-0123456789' }).read(), {
      saved: 'api-key',
      apiKey: null,
      problem: UNREADABLE_KEY,
    })
    const file = path.join(dataDir, ACCESS_FILE)
    const content = JSON.parse(await readFile(file, 'utf8'))
    content.key.data = Buffer.from('tampered').toString('base64')
    await writeFile(file, JSON.stringify(content))
    assert.equal((await openAccessStore({ dataDir, secret: SECRET }).read()).apiKey, null)
  })

  it('permissions élargies resserrées à la lecture ; abonnement et test gardés ; clear efface', async () => {
    const dataDir = await tempDir()
    const store = openAccessStore({ dataDir, secret: SECRET })
    await store.saveSubscription()
    await chmod(path.join(dataDir, ACCESS_FILE), 0o644)
    await store.saveTest({ at: '2026-09-27T12:00:00.000Z', ok: true, message: 'Connected' })
    assert.deepEqual(await store.read(), { saved: 'subscription', apiKey: null, lastTest: { at: '2026-09-27T12:00:00.000Z', ok: true, message: 'Connected' } })
    assert.equal((await stat(path.join(dataDir, ACCESS_FILE))).mode & 0o777, 0o600)
    await store.clear()
    assert.deepEqual(await store.read(), { saved: null, apiKey: null })
  })
})

describe('résolution de l’accès (ordre et mode)', () => {
  const none: StoredAccess = { saved: null, apiKey: null }
  const machineLogin = { storageDir: '' }
  const run = (env: Record<string, string>, stored: StoredAccess, localMode = true, loggedIn = true) =>
    resolveEngineAccess({ env, stored, localMode, machine: { loggedIn }, machineLogin })

  it('ANTHROPIC_API_KEY de l’environnement l’emporte toujours ; indice de 4 caractères seulement', () => {
    const r = run({ ANTHROPIC_API_KEY: API_KEY }, { saved: 'api-key', apiKey: OTHER_KEY })
    assert.equal(r.source, 'env')
    assert.equal(r.keyHint, 'sk-ant-…TEST')
    assert.deepEqual(r.result, { ok: true, access: { kind: 'api-key', secret: API_KEY } })
  })

  it('clé enregistrée, puis abonnement de la machine, puis jeton de l’environnement', () => {
    assert.equal(run({}, { saved: 'api-key', apiKey: OTHER_KEY }).source, 'stored')
    const machine = run({ CLAUDE_CODE_OAUTH_TOKEN: OAT }, { saved: 'subscription', apiKey: null })
    assert.equal(machine.source, 'machine')
    assert.deepEqual(machine.result, { ok: true, access: { kind: 'subscription', secret: null, machineLogin } })
    // Machine non connectée : repli sur CLAUDE_CODE_OAUTH_TOKEN, sinon la marche à suivre.
    assert.equal(run({ CLAUDE_CODE_OAUTH_TOKEN: OAT }, { saved: 'subscription', apiKey: null }, true, false).source, 'env')
    assert.deepEqual(run({}, { saved: 'subscription', apiKey: null }, true, false).result, { ok: false, error: NOT_SIGNED_IN })
    assert.equal(run({ CLAUDE_CODE_OAUTH_TOKEN: OAT }, none).source, 'env')
    assert.deepEqual(run({}, none), { result: { ok: false, error: NO_ACCESS }, source: 'none' })
  })

  it('jamais d’abonnement en mode hébergé (machine ni jeton)', () => {
    assert.deepEqual(run({}, { saved: 'subscription', apiKey: null }, false).result, { ok: false, error: SUBSCRIPTION_HOSTED })
    const token = run({ CLAUDE_CODE_OAUTH_TOKEN: OAT, ENGINE_MODE: 'hosted' }, none, false)
    assert.equal(token.result.ok, false)
    assert.equal(token.source, 'none')
  })

  it('un sk-ant-oat dans ANTHROPIC_API_KEY reste refusé', () => {
    const r = run({ ANTHROPIC_API_KEY: OAT }, { saved: 'api-key', apiKey: OTHER_KEY })
    assert.equal(r.result.ok, false)
    assert.equal(r.source, 'env')
  })
})

describe('connexion de la machine (sans lire le secret)', () => {
  it('service et compte du trousseau calculés comme Claude Code', () => {
    assert.equal(keychainService({ storageDir: '' }), 'Claude Code-credentials')
    assert.match(keychainService({ storageDir: '/Users/x/.claude-alt' }), /^Claude Code-credentials-[0-9a-f]{8}$/)
    assert.equal(keychainAccount('andrea'), 'andrea')
    assert.equal(keychainAccount('bad name'), 'claude-code-user')
    assert.deepEqual(machineLoginOf({}), { storageDir: '' })
    assert.deepEqual(machineLoginOf({ CLAUDE_CONFIG_DIR: '/c' }), { storageDir: '/c' })
    assert.deepEqual(machineLoginOf({ CLAUDE_CONFIG_DIR: '/c', CLAUDE_SECURESTORAGE_CONFIG_DIR: '' }), { storageDir: '' })
  })

  it('trousseau (macOS) puis fichier .credentials.json', async () => {
    assert.deepEqual(await detectMachineLogin({ storageDir: '' }, fakeProbe(true)), { loggedIn: true, where: 'keychain' })
    const linux = { ...fakeProbe(false, 'linux'), fileExists: async (file: string) => file === '/Users/test/.claude/.credentials.json' }
    assert.deepEqual(await detectMachineLogin({ storageDir: '' }, linux), { loggedIn: true, where: 'file' })
    assert.deepEqual(await detectMachineLogin({ storageDir: '' }, fakeProbe(false)), { loggedIn: false })
  })

  it('`claude auth status` fait foi : un élément du trousseau présent mais sans connexion utilisable → non connecté', async () => {
    const probe = { ...fakeProbe(true), authStatus: async () => false }
    assert.deepEqual(await detectMachineLogin({ storageDir: '' }, probe), { loggedIn: false })
    assert.deepEqual(await detectMachineLogin({ storageDir: '' }, { ...fakeProbe(false), authStatus: async () => true }), { loggedIn: true, where: 'claude' })
    // Binaire muet (null) : repli sur le trousseau.
    assert.deepEqual(await detectMachineLogin({ storageDir: '' }, { ...fakeProbe(true), authStatus: async () => null }), { loggedIn: true, where: 'keychain' })
  })

  it('sonde réelle : `auth status --json` lancé avec l’env minimal (jamais les secrets du moteur), loggedIn lu', async () => {
    const dir = await tempDir()
    const fakeClaude = path.join(dir, 'claude')
    const envDump = path.join(dir, 'env.txt')
    await writeFile(fakeClaude, `#!/bin/sh\nenv > "${envDump}"\necho "$@" >> "${envDump}"\necho '{"loggedIn":true,"authMethod":"claude.ai"}'\n`, { mode: 0o755 })
    const probe = systemProbe(
      { PATH: '/usr/bin:/bin', HOME: '/Users/test', USER: 'test', ANTHROPIC_API_KEY: 'leak', ENGINE_SECRET: 'leak', SANITY_API_WRITE_TOKEN: 'leak' },
      { configDir: path.join(dir, 'cfg'), binary: fakeClaude },
    )
    assert.equal(await probe.authStatus!({ storageDir: '' }), true)
    const dumped = await readFile(envDump, 'utf8')
    assert.ok(!dumped.includes('leak'), 'aucun secret du moteur dans l’env de Claude Code')
    assert.match(dumped, /^CLAUDE_SECURESTORAGE_CONFIG_DIR=$/m)
    assert.match(dumped, new RegExp(`^CLAUDE_CONFIG_DIR=${path.join(dir, 'cfg')}$`, 'm'))
    assert.match(dumped, /^auth status --json$/m)
    assert.equal(await systemProbe({}, { configDir: path.join(dir, 'cfg'), binary: null }).authStatus, undefined)
  })

  it('env du sous-processus : AUCUN secret, CLAUDE_SECURESTORAGE_CONFIG_DIR vide, $USER pour le trousseau', () => {
    const machine: ClaudeCredential = { kind: 'subscription', secret: null, machineLogin: { storageDir: '' } }
    const env = credentialEnv(machine, { USER: 'andrea', ANTHROPIC_API_KEY: 'leak', ENGINE_SECRET: 'leak' })
    assert.deepEqual(env, { USER: 'andrea', CLAUDE_SECURESTORAGE_CONFIG_DIR: '' })
  })
})

describe('test de connexion (faux réseau, faux Claude Code)', () => {
  it('clé API : GET /v1/models (gratuit), statut → message lisible', async () => {
    const ok = fakeFetch(200)
    assert.deepEqual(await testApiKey(API_KEY, ok.impl), { ok: true, message: TEST_MESSAGES.apiOk })
    assert.equal(ok.calls[0].url, MODELS_URL)
    assert.equal(ok.calls[0].init.method, 'GET')
    assert.equal(new Headers(ok.calls[0].init.headers).get('x-api-key'), API_KEY)
    assert.equal((await testApiKey(API_KEY, fakeFetch(401).impl)).message, TEST_MESSAGES.invalidKey)
    assert.equal((await testApiKey(API_KEY, fakeFetch(429).impl)).message, TEST_MESSAGES.rateLimited)
    assert.equal((await testApiKey(API_KEY, fakeFetch(529).impl)).message, TEST_MESSAGES.anthropicDown(529))
    assert.equal((await testApiKey(API_KEY, fakeFetch(new TypeError('fetch failed')).impl)).message, TEST_MESSAGES.network)
  })

  it('abonnement : un tour minimal, modèle le moins cher, 16 jetons ; machine non connectée → marche à suivre', async () => {
    const access = { kind: 'subscription' as const, secret: null, machineLogin: { storageDir: '' } }
    const complete = fakeComplete('ok')
    assert.deepEqual(await testSubscription({ access, model: 'claude-haiku-4-5-20251001', configDir: '/tmp/x', complete }), {
      ok: true,
      message: TEST_MESSAGES.subscriptionOk,
    })
    assert.equal(complete.calls[0].model, 'claude-haiku-4-5-20251001')
    assert.equal(complete.calls[0].maxTokens, 16)
    const loggedOut = fakeComplete(new CompleteError('Not logged in · Please run /login'))
    assert.equal((await testSubscription({ access, model: 'm', configDir: '/tmp/x', complete: loggedOut })).message, TEST_MESSAGES.notSignedIn)
  })
})

describe('service : enregistrement, test, effacement, rechargement à chaud', () => {
  it('clé API enregistrée → accès immédiat (sans redémarrage), réponse sans la clé, journal sans la clé', async () => {
    const { service, logs } = await makeService()
    assert.equal(service.current().ok, false)
    const state = await service.save({ kind: 'api-key', apiKey: `  ${API_KEY.slice(0, 40)}\n${API_KEY.slice(40)}  ` })
    assert.deepEqual(service.current(), { ok: true, access: { kind: 'api-key', secret: API_KEY } })
    assert.equal(state.source, 'stored')
    assert.equal(state.keyHint, 'sk-ant-…TEST')
    const tested = await service.test()
    assert.deepEqual(tested.lastTest, { at: '2026-09-27T12:00:00.000Z', ok: true, message: TEST_MESSAGES.apiOk })
    const all = JSON.stringify([state, tested, logs])
    assert.ok(!all.includes(API_KEY) && !all.includes(API_KEY.slice(13, 40)), 'ni réponse ni journal ne contiennent la clé')
  })

  it('refus : sk-ant-oat, clé tronquée, champ inconnu, abonnement en hébergé ; rien d’enregistré', async () => {
    const { service, dataDir } = await makeService()
    await assert.rejects(service.save({ kind: 'api-key', apiKey: OAT }), (e: { status: number; message: string }) => e.status === 400 && /subscription token/.test(e.message) && !e.message.includes(OAT))
    await assert.rejects(service.save({ kind: 'api-key', apiKey: 'sk-ant-api03-short' }), { status: 400 })
    await assert.rejects(service.save({ kind: 'api-key', apiKey: API_KEY, extra: 1 }), { status: 400 })
    await assert.rejects(service.save({ kind: 'token', apiKey: API_KEY }), (e: { message: string }) => !e.message.includes(API_KEY))
    const hosted = await makeService({ mode: 'hosted', localMode: false, dataDir })
    await assert.rejects(hosted.service.save({ kind: 'subscription' }), { status: 403, message: SUBSCRIPTION_HOSTED })
    assert.equal((await hosted.service.state()).saved, null)
    assert.equal((await hosted.service.state()).machine, undefined)
  })

  it('« Use my Claude subscription » en local : connexion de la machine, test par un tour minimal', async () => {
    const complete = fakeComplete('ok')
    const { service } = await makeService({ complete })
    const state = await service.save({ kind: 'subscription' })
    assert.equal(state.source, 'machine')
    assert.equal(state.access, 'subscription')
    assert.deepEqual(service.current(), { ok: true, access: { kind: 'subscription', secret: null, machineLogin: { storageDir: '' } } })
    const tested = await service.test()
    assert.equal(tested.lastTest?.ok, true)
    assert.equal(complete.calls.length, 1)
  })

  it('machine non connectée : état clair, test en échec sans appeler Claude', async () => {
    const complete = fakeComplete('ok')
    const { service } = await makeService({ probe: fakeProbe(false), complete })
    const state = await service.save({ kind: 'subscription' })
    assert.equal(state.access, 'none')
    assert.deepEqual(state.machine, { loggedIn: false })
    assert.equal(state.problem, NOT_SIGNED_IN)
    const tested = await service.test()
    assert.deepEqual(tested.lastTest, { at: '2026-09-27T12:00:00.000Z', ok: false, message: NOT_SIGNED_IN })
    assert.equal(complete.calls.length, 0)
  })

  it('ANTHROPIC_API_KEY de l’environnement prioritaire : l’écran le sait (envApiKey), la clé enregistrée est gardée', async () => {
    const { service } = await makeService({ env: { ANTHROPIC_API_KEY: OTHER_KEY } })
    const state = await service.save({ kind: 'api-key', apiKey: API_KEY })
    assert.equal(state.source, 'env')
    assert.equal(state.envApiKey, true)
    assert.equal(state.saved, 'api-key')
    assert.equal(state.keyHint, 'sk-ant-…KEY2')
  })

  it('Disconnect : efface ce qui est enregistré, accès retiré aussitôt', async () => {
    const { service, dataDir } = await makeService()
    await service.save({ kind: 'api-key', apiKey: API_KEY })
    const state = await service.clear()
    assert.equal(state.access, 'none')
    assert.equal(service.current().ok, false)
    await assert.rejects(stat(path.join(dataDir, ACCESS_FILE)), { code: 'ENOENT' })
  })

  it('abonnement choisi : un /login fait dans un terminal s’applique sans passer par B5 (sonde périodique)', async () => {
    let loggedIn = false
    const probe = { ...fakeProbe(false), authStatus: async () => loggedIn }
    const { service } = await makeService({ probe })
    await service.save({ kind: 'subscription' })
    assert.equal(service.current().ok, false)
    const stop = service.watch(10)
    loggedIn = true
    await new Promise((resolve) => setTimeout(resolve, 50))
    stop()
    assert.equal(service.current().ok, true)
  })

  it('un seul test à la fois', async () => {
    let calls = 0
    const slow = (async () => {
      calls++
      await new Promise((resolve) => setTimeout(resolve, 20))
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const { service } = await makeService({ fetchImpl: slow })
    await service.save({ kind: 'api-key', apiKey: API_KEY })
    await Promise.all([service.test(), service.test()])
    assert.equal(calls, 1)
  })
})

describe('routes /claude/access* (droit ai.access revérifié par le moteur)', () => {
  it('Kuartz et client : oui ; editor : 403 ; la clé ne revient jamais', async () => {
    const { service } = await makeService()
    const router = createRouter()
    registerAccessRoutes(router, service)
    const server = createEngineServer({ router, secret: SECRET, identityPublicKey: TEST_IDENTITY.publicKey, log: () => {} })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const call = async (method: string, route: string, user: EngineUser, body?: unknown) => {
      const headers: Record<string, string> = { authorization: `Bearer ${SECRET}`, ...(await signedIdentity(user)) }
      if (body !== undefined) headers['content-type'] = 'application/json'
      const res = await fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: res.status, text: await res.text() }
    }
    assert.equal((await call('GET', '/claude/access', EDITOR)).status, 403)
    assert.equal((await call('POST', '/claude/access', EDITOR, { kind: 'api-key', apiKey: API_KEY })).status, 403)
    const saved = await call('POST', '/claude/access', CLIENT, { kind: 'api-key', apiKey: API_KEY })
    assert.equal(saved.status, 200)
    assert.ok(!saved.text.includes(API_KEY))
    assert.equal(JSON.parse(saved.text).keyHint, 'sk-ant-…TEST')
    const tested = await call('POST', '/claude/access/test', KUARTZ, {})
    assert.equal(JSON.parse(tested.text).lastTest.ok, true)
    assert.equal((await call('POST', '/claude/access/clear', KUARTZ, {})).status, 200)
    assert.equal(JSON.parse((await call('GET', '/claude/access', CLIENT)).text).access, 'none')
  })
})
