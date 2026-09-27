import { generateKeyPairSync } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import type { EngineHealth } from '../contracts/engine'
import type { EngineUser } from '../contracts/session'

import { handleMockEngineRequest } from './mock'
import { callEngine, readBodyCapped, useMockEngine, type EngineTransportDeps } from './transport'
import { verifyEngineUser } from './signature'

const SECRET = 'engine-secret-0123456789abcdef0123456789'
// Paire de clés d'identité Ed25519 générée pour le test.
const pair = generateKeyPairSync('ed25519')
const IDENTITY_PRIVATE = pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
const IDENTITY_PUBLIC = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
const client: EngineUser = { id: 'u1', name: 'Marie', email: 'm@c.com', role: 'client' }
const kuartz: EngineUser = { ...client, id: 'u2', role: 'kuartz' }
const realEnv = { ENGINE_URL: 'http://127.0.0.1:4043', ENGINE_SECRET: SECRET, ENGINE_IDENTITY_PRIVATE_KEY: IDENTITY_PRIVATE, NODE_ENV: 'development' }

function engine(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => handler(url, init ?? {}))
  const deps: EngineTransportDeps = { env: realEnv, fetchImpl, log: vi.fn() }
  return { fetchImpl, deps }
}

describe('callEngine — moteur réel', () => {
  it('Bearer + identité signée, URL de la liste blanche, requête filtrée, aucun en-tête du navigateur', async () => {
    const { fetchImpl, deps } = engine(async (url, init) => {
      const headers = new Headers(init.headers)
      expect(url).toBe('http://127.0.0.1:4043/editor/state?page=%2F')
      expect(headers.get('authorization')).toBe(`Bearer ${SECRET}`)
      expect(await verifyEngineUser(headers, IDENTITY_PUBLIC)).toEqual(client)
      // SEC-10 : l'identité n'est PAS signée avec le Bearer.
      expect(headers.get('x-kz-user-sig')).toMatch(/^[A-Za-z0-9_-]{86}$/)
      expect(headers.get('cookie')).toBeNull()
      expect(init.redirect).toBe('manual')
      return Response.json({ page: '/' }, { headers: { 'set-cookie': 'x=1', 'x-internal': 'y' } })
    })
    const res = await callEngine({ method: 'GET', segments: ['editor', 'state'], search: new URLSearchParams('page=/&evil=1'), user: client }, deps)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ page: '/' })
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-internal')).toBeNull()
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('route hors liste blanche → 404 sans appeler le moteur', async () => {
    const { fetchImpl, deps } = engine(() => Response.json({}))
    const res = await callEngine({ method: 'GET', segments: ['debug', 'env'], user: kuartz }, deps)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('droit manquant (diff, rollback pour le client) → 403 sans appeler le moteur', async () => {
    const { fetchImpl, deps } = engine(() => Response.json({}))
    expect((await callEngine({ method: 'GET', segments: ['publish', 'diff', 'c1'], user: client }, deps)).status).toBe(403)
    expect((await callEngine({ method: 'POST', segments: ['versions', '2', 'rollback'], body: '{}', user: client }, deps)).status).toBe(403)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect((await callEngine({ method: 'GET', segments: ['publish', 'diff', 'c1'], user: kuartz }, deps)).status).toBe(200)
  })
  it('corps : JSON re-sérialisé, invalide → 400, trop gros → 413', async () => {
    const { fetchImpl, deps } = engine((_url, init) => Response.json({ echo: JSON.parse(String(init.body)) }, { status: 201 }))
    const ok = await callEngine({ method: 'POST', segments: ['editor', 'requests'], body: ' {"note":"hi"} ', user: client }, deps)
    expect(ok.status).toBe(201)
    expect(await ok.json()).toEqual({ echo: { note: 'hi' } })
    expect((await callEngine({ method: 'POST', segments: ['publish'], body: '{nope', user: client }, deps)).status).toBe(400)
    expect((await callEngine({ method: 'POST', segments: ['ask'], body: JSON.stringify({ q: 'x'.repeat(70_000) }), user: client }, deps)).status).toBe(413)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('erreurs du moteur : EngineErrorBody relayé, réponse illisible → 502, 401 → 503 journalisé', async () => {
    const busy = engine(() => Response.json({ error: { code: 'busy', message: 'Claude is already working.' } }, { status: 409 }))
    const r1 = await callEngine({ method: 'POST', segments: ['editor', 'requests'], body: '{}', user: client }, busy.deps)
    expect(r1.status).toBe(409)
    expect(await r1.json()).toEqual({ error: { code: 'busy', message: 'Claude is already working.' } })

    const html = engine(() => new Response('<html>oops</html>', { status: 500 }))
    expect((await callEngine({ method: 'GET', segments: ['health'], user: client }, html.deps)).status).toBe(502)
    const plain = engine(() => Response.json({ message: 'no contract shape' }, { status: 500 }))
    const r2 = await callEngine({ method: 'GET', segments: ['health'], user: client }, plain.deps)
    expect(r2.status).toBe(500)
    expect(await r2.json()).toMatchObject({ error: { code: 'internal' } })

    const unauth = engine(() => Response.json({ error: { code: 'unauthorized', message: 'bad signature' } }, { status: 401 }))
    const r3 = await callEngine({ method: 'GET', segments: ['health'], user: client }, unauth.deps)
    expect(r3.status).toBe(503)
    expect(unauth.deps.log).toHaveBeenCalledWith(expect.stringMatching(/ENGINE_SECRET differs.*ENGINE_IDENTITY_PRIVATE_KEY/))

    const redirect = engine(() => new Response(null, { status: 302, headers: { location: 'https://evil.com' } }))
    expect((await callEngine({ method: 'GET', segments: ['health'], user: client }, redirect.deps)).status).toBe(502)
  })
  it('moteur injoignable → 502 ; délai dépassé → 504', async () => {
    const down = engine(() => {
      throw new TypeError('fetch failed')
    })
    expect((await callEngine({ method: 'GET', segments: ['health'], user: client }, down.deps)).status).toBe(502)
    const slow = engine(() => {
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    })
    const res = await callEngine({ method: 'GET', segments: ['health'], user: client }, slow.deps)
    expect(res.status).toBe(504)
  })
  it('captures : PNG relayé, autre type refusé', async () => {
    const png = engine(() => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }))
    const res = await callEngine({ method: 'GET', segments: ['editor', 'jobs', 'j1', 'shots', '001-after.png'], user: client }, png.deps)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await res.arrayBuffer())[1]).toBe(80)
    const svg = engine(() => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }))
    expect((await callEngine({ method: 'GET', segments: ['editor', 'jobs', 'j1', 'shots', '001-after.png'], user: client }, svg.deps)).status).toBe(502)
  })
  it('configuration absente → 503 not configured', async () => {
    const res = await callEngine({ method: 'GET', segments: ['health'], user: client }, { env: { NODE_ENV: 'development' }, log: vi.fn() })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: { code: 'unavailable', message: 'The AI engine is not configured.' } })
  })
  it('régression SEC-10 : sans clé d’identité (ou clé invalide) → 503, jamais d’appel signé avec le Bearer', async () => {
    const noKey = engine(() => Response.json({}))
    const deps1 = { ...noKey.deps, env: { ...realEnv, ENGINE_IDENTITY_PRIVATE_KEY: undefined } }
    expect((await callEngine({ method: 'GET', segments: ['health'], user: client }, deps1)).status).toBe(503)
    const badKey = { ...noKey.deps, env: { ...realEnv, ENGINE_IDENTITY_PRIVATE_KEY: IDENTITY_PUBLIC } }
    expect((await callEngine({ method: 'GET', segments: ['health'], user: client }, badKey)).status).toBe(503)
    expect(noKey.fetchImpl).not.toHaveBeenCalled()
  })
})

describe('moteur simulé (ENGINE_MOCK=1)', () => {
  const mockDeps: EngineTransportDeps = { env: { ENGINE_MOCK: '1', NODE_ENV: 'development' }, mock: handleMockEngineRequest, log: vi.fn() }

  it('santé simulée, sans réseau, cohérente avec la règle du vrai moteur (AI-06)', async () => {
    const res = await callEngine({ method: 'GET', segments: ['health'], user: client }, mockDeps)
    expect(res.status).toBe(200)
    const health = (await res.json()) as EngineHealth
    expect(health).toMatchObject({ ok: true, version: 'mock', mode: 'local' })
    // engine/src/server/health.ts : ok = access !== 'none' && preview.ready && branch === 'draft'.
    expect(health.ok).toBe(health.claude.access !== 'none' && health.preview.ready && health.git.branch === 'draft')
  })
  it('publication simulée implémentée par publish-ui (FOLLOWUPS #15) : état relayé tel quel', async () => {
    const res = await callEngine({ method: 'GET', segments: ['publish', 'status'], user: client }, mockDeps)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ state: expect.any(String), pending: { total: expect.any(Number) } })
  })
  it('la liste blanche et les droits s’appliquent aussi au mock', async () => {
    const mock = vi.fn(handleMockEngineRequest)
    const deps = { ...mockDeps, mock }
    expect((await callEngine({ method: 'GET', segments: ['publish', 'diff', 'c1'], user: client }, deps)).status).toBe(403)
    expect((await callEngine({ method: 'GET', segments: ['nope'], user: client }, deps)).status).toBe(404)
    expect(mock).not.toHaveBeenCalled()
  })
  it('jamais en production (refus bruyant)', () => {
    const log = vi.fn()
    expect(useMockEngine({ ENGINE_MOCK: '1', NODE_ENV: 'production' }, log)).toBe(false)
    expect(useMockEngine({ ENGINE_MOCK: '1', NODE_ENV: 'development' }, log)).toBe(true)
    expect(useMockEngine({ NODE_ENV: 'development' }, log)).toBe(false)
  })
})

describe('readBodyCapped', () => {
  const stream = (...parts: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(new TextEncoder().encode(p))
        c.close()
      },
    })
  it('lit un corps sous la limite, s’arrête au-delà', async () => {
    expect(await readBodyCapped(stream('{"a":', '1}'), 100)).toBe('{"a":1}')
    expect(await readBodyCapped(stream('x'.repeat(60), 'y'.repeat(60)), 100)).toBeNull()
    expect(await readBodyCapped(null, 100)).toBe('')
  })
})
