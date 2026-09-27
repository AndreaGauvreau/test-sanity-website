import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { EngineConfigError, isInside, readEngineConfig } from './config'

/** Configuration du moteur : chemins sûrs (piège 5 du POC), refus clairs, aucun secret dans les messages. */

const SECRET = 'engine-secret-0123456789abcdef'
const PREVIEW_SECRET = 'preview-secret-0123456789abcdef'
const READ_TOKEN = 'sk-read-token-value'

const ENV = {
  ENGINE_MODE: 'local',
  ENGINE_PORT: '4043',
  ENGINE_PREVIEW_PORT: '4042',
  ENGINE_SECRET: SECRET,
  ENGINE_PREVIEW_SECRET: PREVIEW_SECRET,
  ADMIN_ORIGIN: 'http://127.0.0.1:4040',
  ENGINE_WORKSPACE: '/work/site-engine',
  ENGINE_SOURCE_REPO: '/work/site',
  NEXT_PUBLIC_SANITY_PROJECT_ID: 'abc123',
  NEXT_PUBLIC_SANITY_DATASET: 'development',
  SANITY_API_READ_TOKEN: READ_TOKEN,
}

const problemsOf = (env: Record<string, string | undefined>) => {
  try {
    readEngineConfig(env, { home: '/Users/me' })
  } catch (error) {
    assert.ok(error instanceof EngineConfigError)
    return error.problems
  }
  return []
}

describe('readEngineConfig', () => {
  it('lit une configuration complète : chemins dérivés absolus, aperçu, Sanity, défauts', () => {
    const config = readEngineConfig(ENV, { home: '/Users/me' })
    assert.equal(config.mode, 'local')
    assert.equal(config.explicitLocal, true)
    assert.equal(config.host, '127.0.0.1')
    assert.equal(config.port, 4043)
    assert.deepEqual(config.paths, {
      sourceRepo: '/work/site',
      workspace: '/work/site-engine',
      repo: '/work/site-engine/repo',
      data: '/work/site-engine/data',
      claude: '/work/site-engine/claude',
      shots: '/work/site-engine/shots',
    })
    assert.deepEqual(config.preview, { port: 4042, origin: 'http://127.0.0.1:4042', secret: PREVIEW_SECRET, adminOrigin: 'http://127.0.0.1:4040' })
    assert.equal(config.sanity.writeToken, null)
    assert.equal(config.sanity.apiVersion, '2026-09-01')
    assert.equal(config.git.push, false)
    assert.equal(config.sourceBranch, null)
    assert.equal(config.maxRequestUsd, null)
    assert.equal(config.models.ask, 'claude-haiku-4-5-20251001')
  })

  it('ENGINE_MODE absent : local par défaut, mais pas « explicite » (abonnement Claude refusé)', () => {
    const config = readEngineConfig({ ...ENV, ENGINE_MODE: undefined }, { home: '/Users/me' })
    assert.deepEqual([config.mode, config.explicitLocal], ['local', false])
    assert.equal(readEngineConfig({ ...ENV, ENGINE_MODE: 'hosted' }, { home: '/Users/me' }).explicitLocal, false)
    assert.ok(problemsOf({ ...ENV, ENGINE_MODE: 'cloud' }).some((p) => p.includes('ENGINE_MODE')))
  })

  it('piège 5 : chemin vide, relatif, racine, dossier personnel refusés', () => {
    assert.ok(problemsOf({ ...ENV, ENGINE_WORKSPACE: '' }).some((p) => /ENGINE_WORKSPACE is missing or empty/.test(p)))
    assert.ok(problemsOf({ ...ENV, ENGINE_WORKSPACE: '   ' }).some((p) => /ENGINE_WORKSPACE is missing/.test(p)))
    assert.ok(problemsOf({ ...ENV, ENGINE_WORKSPACE: '../site-engine' }).some((p) => /absolute/.test(p)))
    assert.ok(problemsOf({ ...ENV, ENGINE_WORKSPACE: '/' }).some((p) => /root/.test(p)))
    assert.ok(problemsOf({ ...ENV, ENGINE_WORKSPACE: '/Users/me' }).some((p) => /home folder/.test(p)))
    assert.ok(problemsOf({ ...ENV, ENGINE_SOURCE_REPO: undefined }).some((p) => /ENGINE_SOURCE_REPO is missing/.test(p)))
  })

  it('espace de travail hors du dépôt source et différent de lui', () => {
    assert.ok(problemsOf({ ...ENV, ENGINE_WORKSPACE: '/work/site' }).some((p) => /must be different/.test(p)))
    assert.ok(problemsOf({ ...ENV, ENGINE_WORKSPACE: '/work/site/.engine' }).some((p) => /OUTSIDE the source repository/.test(p)))
    assert.ok(problemsOf({ ...ENV, ENGINE_WORKSPACE: '/work', ENGINE_SOURCE_REPO: '/work/site' }).some((p) => /cannot be inside/.test(p)))
    // Préfixe commun sans inclusion : permis.
    assert.deepEqual(problemsOf({ ...ENV, ENGINE_WORKSPACE: '/work/site-engine', ENGINE_SOURCE_REPO: '/work/site' }), [])
  })

  it('ports, secrets, origine de l’admin, URL', () => {
    assert.ok(problemsOf({ ...ENV, ENGINE_PORT: 'abc' }).some((p) => p.includes('ENGINE_PORT')))
    assert.ok(problemsOf({ ...ENV, ENGINE_PORT: '80' }).some((p) => p.includes('between 1024')))
    assert.ok(problemsOf({ ...ENV, ENGINE_PREVIEW_PORT: '4043' }).some((p) => /must differ/.test(p)))
    assert.ok(problemsOf({ ...ENV, ENGINE_SECRET: 'short' }).some((p) => /ENGINE_SECRET must be at least 16/.test(p)))
    assert.ok(problemsOf({ ...ENV, ENGINE_PREVIEW_SECRET: SECRET }).some((p) => /must differ/.test(p)))
    assert.ok(problemsOf({ ...ENV, ADMIN_ORIGIN: 'http://127.0.0.1:4040/' }).some((p) => /strict origin/.test(p)))
    assert.ok(problemsOf({ ...ENV, ADMIN_ORIGIN: 'http://127.0.0.1:4040/admin' }).some((p) => /strict origin/.test(p)))
    assert.ok(problemsOf({ ...ENV, VERCEL_DEPLOY_HOOK_URL: 'http://api.vercel.com/x' }).some((p) => /VERCEL_DEPLOY_HOOK_URL/.test(p)))
    assert.ok(problemsOf({ ...ENV, ENGINE_GIT_PUSH: 'yes' }).some((p) => /ENGINE_GIT_PUSH/.test(p)))
    assert.ok(problemsOf({ ...ENV, EDITOR_MAX_REQUEST_USD: '-1' }).some((p) => /EDITOR_MAX_REQUEST_USD/.test(p)))
    assert.ok(problemsOf({ ...ENV, ENGINE_SOURCE_BRANCH: '--upload-pack=x' }).some((p) => /ENGINE_SOURCE_BRANCH/.test(p)))
    assert.equal(readEngineConfig({ ...ENV, EDITOR_MAX_REQUEST_USD: '2.5', ENGINE_GIT_PUSH: '1', ENGINE_SOURCE_BRANCH: 'dashboard' }, { home: '/x' }).maxRequestUsd, 2.5)
  })

  it('jamais de secret dans les messages, même quand la valeur est refusée', () => {
    const env = { ...ENV, ENGINE_SECRET: 'has space in it but long enough', SANITY_API_WRITE_TOKEN: 'write token with spaces', NEXT_PUBLIC_SANITY_DATASET: 'BAD DATASET' }
    let message = ''
    try {
      readEngineConfig(env, { home: '/x' })
    } catch (error) {
      message = (error as Error).message
    }
    assert.ok(message.includes('ENGINE_SECRET cannot contain spaces'))
    for (const value of [env.ENGINE_SECRET, env.SANITY_API_WRITE_TOKEN, 'BAD DATASET', PREVIEW_SECRET, READ_TOKEN]) assert.ok(!message.includes(value))
  })

  it('isInside', () => {
    assert.equal(isInside('/a/b', '/a'), true)
    assert.equal(isInside('/a', '/a'), true)
    assert.equal(isInside('/ab', '/a'), false)
    assert.equal(isInside('/a', '/a/b'), false)
  })
})
