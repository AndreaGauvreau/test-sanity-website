import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'vitest'
import { aiSettingsProblem, type AiSettings, type EngineUser } from '../../../src/admin/core/contracts'
import { CLIENT, KUARTZ, signedIdentity, TEST_IDENTITY } from '../jobs/testing'
import { EngineError } from '../server/errors'
import { createEngineServer, createRouter } from '../server/http'
import { registerAiSettingsRoutes } from '.'
import { AI_SETTINGS_FILE, createAiSettingsService, openAiSettingsStore, type AiSettingsStore } from './ai-settings'

/**
 * Réglages de l'IA (B5 · « AI settings ») : magasin `data/ai-settings.json`, validation stricte, service rechargeable,
 * routes et droits. Rechargement à chaud de bout en bout (la demande suivante prend le nouveau modèle) : main.test.ts.
 */

const SECRET = 'engine-secret-for-tests-0123456789'
const EDITOR: EngineUser = { id: 'u-ed', name: 'Eddie', email: 'ed@conduit.test', role: 'editor' }
const DEFAULTS = { model: 'claude-opus-5-5', effort: 'medium' } as const
const NOW = new Date('2026-09-28T10:00:00.000Z')

const dirs: string[] = []
const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise((resolve) => server.close(resolve))
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'kz-ai-settings-'))
  dirs.push(dir)
  return dir
}

async function makeService(store?: AiSettingsStore, log: string[] = []) {
  const dataDir = await tempDir()
  const used = store ?? openAiSettingsStore({ dataDir, now: () => NOW })
  const service = createAiSettingsService({ store: used, defaults: DEFAULTS, askModel: 'claude-haiku-4-5', log: (line) => log.push(line) })
  await service.load()
  return { service, dataDir, log }
}

describe('validation stricte (aiSettingsProblem du contrat)', () => {
  it('accepte les trois modèles et les cinq niveaux, refuse tout le reste sans citer l’entrée', () => {
    for (const model of ['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5']) {
      for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) assert.equal(aiSettingsProblem({ model, effort }), null)
    }
    const refused: unknown[] = [
      null,
      'claude-opus-5-5',
      [],
      {},
      { model: 'claude-opus-5-5' },
      { effort: 'medium' },
      { model: 'claude-opus-5', effort: 'medium' },
      { model: 'claude-haiku-4-5', effort: 'medium' },
      { model: 'CLAUDE-OPUS-5-5', effort: 'medium' },
      { model: 'claude-opus-5-5', effort: 'ultra' },
      { model: 'claude-opus-5-5', effort: 3 },
      { model: 'claude-opus-5-5', effort: 'medium', maxTurns: 99 },
      { model: 'claude-opus-5-5', effort: 'medium', extra: '<script>' },
    ]
    for (const body of refused) {
      const problem = aiSettingsProblem(body)
      assert.ok(problem, JSON.stringify(body))
      assert.ok(!problem.includes('<script>') && !problem.includes('ultra') && !problem.includes('CLAUDE'))
    }
    assert.equal(aiSettingsProblem({ model: 'x', effort: 'medium' }), 'Choose one of these models: Opus 5.5, Fable 5.1, Sonnet 5.')
    assert.equal(aiSettingsProblem({ model: 'claude-sonnet-5', effort: 'x' }), 'Choose a thinking effort: low, medium, high, xhigh, max.')
  })
})

describe('magasin data/ai-settings.json', () => {
  it('absent → valeurs par défaut ; écriture atomique 0600, sans fichier temporaire restant', async () => {
    const dataDir = await tempDir()
    const store = openAiSettingsStore({ dataDir, now: () => NOW })
    assert.deepEqual(await store.read(), { saved: null })
    const saved = await store.write({ model: 'claude-fable-5-1', effort: 'high' })
    assert.deepEqual(saved, { settings: { model: 'claude-fable-5-1', effort: 'high' }, updatedAt: NOW.toISOString() })
    const file = path.join(dataDir, AI_SETTINGS_FILE)
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { version: 1, model: 'claude-fable-5-1', effort: 'high', updatedAt: NOW.toISOString() })
    assert.equal((await stat(file)).mode & 0o777, 0o600)
    assert.deepEqual(await readdir(dataDir), [AI_SETTINGS_FILE])
    assert.deepEqual((await store.read()).saved, saved)
  })

  it('fichier illisible ou retouché (modèle inconnu, niveau inconnu) → valeurs par défaut + avertissement', async () => {
    for (const content of ['{ nope', JSON.stringify({ version: 1, model: 'claude-opus-5', effort: 'high' }), JSON.stringify({ version: 1, model: 'claude-sonnet-5', effort: 'huge' }), JSON.stringify({ version: 2, model: 'claude-sonnet-5', effort: 'low' })]) {
      const dataDir = await tempDir()
      await writeFile(path.join(dataDir, AI_SETTINGS_FILE), content)
      const read = await openAiSettingsStore({ dataDir }).read()
      assert.equal(read.saved, null)
      assert.match(read.problem ?? '', /not valid: the default AI settings apply/)
      const log: string[] = []
      const service = createAiSettingsService({ store: openAiSettingsStore({ dataDir }), defaults: DEFAULTS, askModel: 'claude-haiku-4-5', log: (line) => log.push(line) })
      await service.load()
      assert.deepEqual(service.state().source, 'default')
      assert.equal(log.length, 1)
    }
  })
})

describe('service des réglages', () => {
  it('par défaut : valeurs de l’environnement ; enregistrer applique aussitôt (current() synchrone) et survit au rechargement', async () => {
    const { service, dataDir, log } = await makeService()
    assert.deepEqual(service.state(), { current: DEFAULTS, defaults: DEFAULTS, source: 'default', askModel: 'claude-haiku-4-5' })
    const state = await service.save({ model: 'claude-sonnet-5', effort: 'xhigh' })
    assert.deepEqual(state, {
      current: { model: 'claude-sonnet-5', effort: 'xhigh' },
      defaults: DEFAULTS,
      source: 'saved',
      updatedAt: NOW.toISOString(),
      askModel: 'claude-haiku-4-5',
    })
    assert.deepEqual(service.current(), { model: 'claude-sonnet-5', effort: 'xhigh' })
    assert.match(log.join('\n'), /AI settings saved: claude-sonnet-5, effort xhigh/)
    // Nouveau démarrage du moteur : le fichier est relu.
    const again = createAiSettingsService({ store: openAiSettingsStore({ dataDir }), defaults: DEFAULTS, askModel: 'claude-haiku-4-5' })
    await again.load()
    assert.deepEqual(again.current(), { model: 'claude-sonnet-5', effort: 'xhigh' })
  })

  it('valeurs par défaut hors liste (EDITOR_MODEL=claude-opus-5) gardées telles quelles', async () => {
    const dataDir = await tempDir()
    const service = createAiSettingsService({ store: openAiSettingsStore({ dataDir }), defaults: { model: 'claude-opus-5', effort: 'high' }, askModel: 'claude-haiku-4-5' })
    await service.load()
    assert.deepEqual(service.current(), { model: 'claude-opus-5', effort: 'high' })
  })

  it('corps invalide → 400 bad_request, rien d’écrit ; disque en erreur → réglages en cours inchangés', async () => {
    const { service, dataDir } = await makeService()
    await assert.rejects(service.save({ model: 'claude-opus-5-5', effort: 'medium', admin: true }), (error: unknown) => {
      assert.ok(error instanceof EngineError)
      assert.deepEqual([error.status, error.code], [400, 'bad_request'])
      return true
    })
    assert.deepEqual(await readdir(dataDir), [])
    const broken: AiSettingsStore = { file: '/nowhere', read: async () => ({ saved: null }), write: async () => Promise.reject(new Error('EACCES')) }
    const { service: failing } = await makeService(broken)
    await assert.rejects(failing.save({ model: 'claude-fable-5-1', effort: 'max' } satisfies AiSettings), /EACCES/)
    assert.deepEqual(failing.current(), DEFAULTS)
  })
})

describe('routes /claude/settings (droit ai.access revérifié par le moteur)', () => {
  it('Kuartz et client : oui ; editor : 403 ; corps invalide : 400 lisible', async () => {
    const { service } = await makeService()
    const router = createRouter()
    registerAiSettingsRoutes(router, service)
    const server = createEngineServer({ router, secret: SECRET, identityPublicKey: TEST_IDENTITY.publicKey, log: () => {} })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const call = async (method: string, user: EngineUser, body?: unknown) => {
      const headers: Record<string, string> = { authorization: `Bearer ${SECRET}`, ...(await signedIdentity(user)) }
      if (body !== undefined) headers['content-type'] = 'application/json'
      const res = await fetch(`${base}/claude/settings`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: res.status, json: await res.json() }
    }
    assert.equal((await call('GET', EDITOR)).status, 403)
    assert.equal((await call('POST', EDITOR, { model: 'claude-sonnet-5', effort: 'low' })).status, 403)
    assert.equal(service.current().model, 'claude-opus-5-5')
    assert.equal((await call('GET', CLIENT)).json.source, 'default')
    const bad = await call('POST', KUARTZ, { model: 'claude-opus-5-5', effort: 'extreme' })
    assert.deepEqual([bad.status, bad.json.error.code], [400, 'bad_request'])
    assert.match(bad.json.error.message, /^Choose a thinking effort/)
    const saved = await call('POST', CLIENT, { model: 'claude-fable-5-1', effort: 'high' })
    assert.equal(saved.status, 200)
    assert.deepEqual(saved.json.current, { model: 'claude-fable-5-1', effort: 'high' })
    assert.deepEqual((await call('GET', KUARTZ)).json.current, { model: 'claude-fable-5-1', effort: 'high' })
  })
})
