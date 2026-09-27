import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, it } from 'vitest'
import { createPreviewProcess, previewEnv, type ChildLike, type SpawnFn } from './process'

/** Aperçu surveillé avec un FAUX processus (jamais de next dev lancé) et une fausse sonde HTTP. */

class FakeChild extends EventEmitter implements ChildLike {
  stdout = new PassThrough()
  stderr = new PassThrough()
  signals: string[] = []
  constructor(readonly pid: number) {
    super()
  }
  kill(signal: NodeJS.Signals = 'SIGTERM') {
    this.signals.push(signal)
    return true
  }
  exit(code: number | null, signal: NodeJS.Signals | null = null) {
    this.emit('exit', code, signal)
  }
}

function harness(options: { ready?: () => boolean; maxRestarts?: number } = {}) {
  const children: FakeChild[] = []
  const spawned: { command: string; args: string[]; env: NodeJS.ProcessEnv; detached: boolean; cwd: string }[] = []
  const killed: [number, string][] = []
  const spawn: SpawnFn = (command, args, opts) => {
    const child = new FakeChild(1000 + children.length)
    children.push(child)
    spawned.push({ command, args, ...opts })
    return child
  }
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const cookie = new Headers(init.headers).get('cookie')
    if (cookie !== 'kz_preview=preview-secret-xxxxxxxx') return new Response('', { status: 503 })
    return (options.ready ?? (() => true))() ? new Response('ok', { status: 200 }) : Promise.reject(new Error('ECONNREFUSED'))
  }) as unknown as typeof fetch
  const lines: string[] = []
  const preview = createPreviewProcess({
    repoDir: '/ws/repo',
    port: 4999,
    origin: 'http://127.0.0.1:4999',
    secret: 'preview-secret-xxxxxxxx',
    command: '/ws/repo/node_modules/.bin/next',
    spawn,
    fetchImpl,
    killGroup: (pid, signal) => {
      killed.push([pid, signal])
      const child = children.find((c) => c.pid === pid)
      if (child) setTimeout(() => child.exit(null, signal), 1)
    },
    baseEnv: { PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'sk-secret', SANITY_API_WRITE_TOKEN: 'w', ENGINE_SECRET: 'e' },
    backoffMs: [5],
    maxRestarts: options.maxRestarts ?? 3,
    probeIntervalMs: 5,
    stopTimeoutMs: 50,
    log: (line) => lines.push(line),
  })
  return { preview, children, spawned, killed, lines }
}

describe('createPreviewProcess', () => {
  it('lance next dev -H 127.0.0.1 -p <port> dans le clone, environnement sans secrets, puis prêt', async () => {
    const h = harness()
    h.preview.start()
    assert.equal(h.preview.status().state, 'starting')
    assert.deepEqual(h.spawned[0].args, ['dev', '-H', '127.0.0.1', '-p', '4999'])
    assert.equal(h.spawned[0].cwd, '/ws/repo')
    assert.equal(h.spawned[0].detached, true)
    assert.deepEqual(Object.keys(h.spawned[0].env).sort(), ['EDITOR', 'FORCE_COLOR', 'HOME', 'NEXT_TELEMETRY_DISABLED', 'PATH', 'REACT_EDITOR', 'VISUAL'])
    assert.equal(await h.preview.waitReady(1_000), true)
    assert.deepEqual({ ...h.preview.status(), lastExit: null }, { state: 'ready', ready: true, url: 'http://127.0.0.1:4999', pid: 1000, restarts: 0, lastExit: null, error: null })
    h.children[0].stdout.write('▲ Next.js 16\n compiling...\n ⨯ Error: boom\n')
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.ok(h.preview.logs().includes(' ⨯ Error: boom'))
    assert.ok(h.lines.some((line) => line.includes('Error: boom')))
    await h.preview.stop()
  })

  it('redémarre après un plantage, abandonne après trop de plantages', async () => {
    const h = harness({ maxRestarts: 2 })
    h.preview.start()
    await h.preview.waitReady(1_000)
    h.children[0].exit(1)
    assert.equal(h.preview.status().state, 'crashed')
    assert.equal(h.preview.status().ready, false)
    await h.preview.waitReady(1_000)
    assert.equal(h.children.length, 2)
    assert.equal(h.preview.status().restarts, 1)
    h.children[1].exit(1)
    await h.preview.waitReady(1_000)
    h.children[2].exit(1)
    assert.equal(h.preview.status().state, 'failed')
    assert.match(h.preview.status().error ?? '', /crashed 3 times/)
    assert.equal(await h.preview.waitReady(10), false)
  })

  it('arrêt propre : SIGTERM au groupe, plus de redémarrage', async () => {
    const h = harness()
    h.preview.start()
    await h.preview.waitReady(1_000)
    await h.preview.stop()
    assert.deepEqual(h.killed, [[1000, 'SIGTERM']])
    assert.equal(h.preview.status().state, 'stopped')
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(h.children.length, 1)
  })

  it('pas prêt tant que la sonde échoue', async () => {
    let up = false
    const h = harness({ ready: () => up })
    h.preview.start()
    assert.equal(await h.preview.waitReady(30), false)
    up = true
    assert.equal(await h.preview.waitReady(1_000), true)
    await h.preview.stop()
  })

  it('previewEnv ne garde que les variables système, avec un éditeur inerte (SEC-06)', () => {
    assert.deepEqual(previewEnv({ PATH: '/bin', ANTHROPIC_API_KEY: 'x', CLAUDE_CODE_OAUTH_TOKEN: 'y', TMPDIR: '/t', REACT_EDITOR: 'code', EDITOR: 'vim' }), {
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      REACT_EDITOR: 'none',
      VISUAL: 'true',
      EDITOR: 'true',
      PATH: '/bin',
      TMPDIR: '/t',
    })
  })

  it('SEC-06 : le processus next dev lancé reçoit REACT_EDITOR=none (launch-editor de Next ne lance rien)', () => {
    const seen: NodeJS.ProcessEnv[] = []
    const spawn: SpawnFn = (_command, _args, options) => {
      seen.push(options.env)
      return new FakeChild(0)
    }
    const preview = createPreviewProcess({
      repoDir: '/r',
      port: 4999,
      origin: 'http://127.0.0.1:4999',
      secret: 's',
      spawn,
      command: 'next',
      baseEnv: { PATH: '/bin', REACT_EDITOR: 'code' },
      fetchImpl: (async () => new Response('', { status: 503 })) as unknown as typeof fetch,
      log: () => {},
    })
    preview.start()
    preview.stopSync()
    assert.equal(seen[0]?.REACT_EDITOR, 'none')
  })

  it('sans next installé dans le clone : échec clair, pas de processus', async () => {
    const preview = createPreviewProcess({ repoDir: '/nonexistent/repo', port: 4999, origin: 'http://127.0.0.1:4999', secret: 's', log: () => {} })
    preview.start()
    assert.equal(preview.status().state, 'failed')
    assert.match(preview.status().error ?? '', /engine:setup/)
  })
})
