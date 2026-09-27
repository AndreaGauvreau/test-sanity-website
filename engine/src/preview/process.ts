import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { PREVIEW_COOKIE } from '../content/visible'

/**
 * Aperçu du brouillon (127.0.0.1:ENGINE_PREVIEW_PORT) : `next dev -H 127.0.0.1 -p <port>` dans le clone de travail
 * (branche draft), lancé et surveillé par le moteur.
 * - environnement MINIMAL (jamais les secrets du moteur : Claude, jeton d'écriture Sanity, ENGINE_SECRET) ; le site lit
 *   ses variables d'aperçu dans le `.env.local` du clone, écrit par `npm run engine:setup` ;
 * - sonde de disponibilité : une requête HTTP avec le cookie du secret d'aperçu (toute réponse < 500 = prêt) ;
 * - redémarrage après un plantage (attente croissante), abandon après `maxRestarts` plantages en `windowMs` ;
 * - arrêt propre : SIGTERM au groupe de processus (next dev lance des processus enfants), SIGKILL après 5 s.
 */

export type ChildLike = {
  pid?: number
  stdout: Readable | null
  stderr: Readable | null
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  kill(signal?: NodeJS.Signals): boolean
}

export type SpawnFn = (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; detached: boolean }) => ChildLike

export type PreviewState = 'stopped' | 'starting' | 'ready' | 'crashed' | 'failed'

export type PreviewStatus = {
  state: PreviewState
  ready: boolean
  /** Origine de l'aperçu, sans secret. */
  url: string
  pid: number | null
  restarts: number
  lastExit: { code: number | null; signal: string | null; at: string } | null
  /** Raison d'un état `failed` (anglais). */
  error: string | null
}

export type PreviewProcess = {
  start(): void
  stop(): Promise<void>
  /** Arrêt immédiat (sortie du processus du moteur, sans attente). */
  stopSync(): void
  status(): PreviewStatus
  /** Attend l'état prêt (false au délai dépassé ou en échec). */
  waitReady(timeoutMs: number): Promise<boolean>
  /** 200 dernières lignes de sortie de next dev. */
  logs(): string[]
}

export type PreviewProcessSettings = {
  repoDir: string
  port: number
  /** http://127.0.0.1:<port> */
  origin: string
  secret: string
  spawn?: SpawnFn
  fetchImpl?: typeof fetch
  /** Envoie un signal au groupe du processus (défaut : process.kill(-pid)). */
  killGroup?: (pid: number, signal: NodeJS.Signals) => void
  /** Commande à lancer (défaut : node_modules/.bin/next du clone). */
  command?: string
  baseEnv?: Readonly<Record<string, string | undefined>>
  backoffMs?: readonly number[]
  maxRestarts?: number
  windowMs?: number
  probeIntervalMs?: number
  stopTimeoutMs?: number
  log?: (line: string) => void
}

const LOG_LINES = 200
// Lignes de next dev reprises dans le journal du moteur (le reste reste dans logs()).
const INTERESTING = /error|warn|fail|ready|started|⨯|⚠|✓/i

/** Environnement minimal de next dev : jamais `...process.env` (secrets du moteur). */
export function previewEnv(base: Readonly<Record<string, string | undefined>>): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' }
  for (const name of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'TZ']) {
    if (base[name] !== undefined) env[name] = base[name]
  }
  return env as NodeJS.ProcessEnv
}

export function createPreviewProcess(settings: PreviewProcessSettings): PreviewProcess {
  const spawn: SpawnFn = settings.spawn ?? ((command, args, options) => nodeSpawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] }))
  const fetchImpl = settings.fetchImpl ?? fetch
  const killGroup =
    settings.killGroup ??
    ((pid: number, signal: NodeJS.Signals) => {
      try {
        process.kill(-pid, signal)
      } catch {
        process.kill(pid, signal)
      }
    })
  const backoff = settings.backoffMs ?? [1_000, 2_000, 5_000, 10_000, 30_000]
  const maxRestarts = settings.maxRestarts ?? 5
  const windowMs = settings.windowMs ?? 5 * 60_000
  const probeIntervalMs = settings.probeIntervalMs ?? 1_000
  const stopTimeoutMs = settings.stopTimeoutMs ?? 5_000
  const log = settings.log ?? ((line: string) => console.log(`[preview] ${line}`))
  const command = settings.command ?? path.join(settings.repoDir, 'node_modules', '.bin', 'next')
  const args = ['dev', '-H', '127.0.0.1', '-p', String(settings.port)]

  let child: ChildLike | null = null
  let state: PreviewState = 'stopped'
  let stopping = false
  let restarts = 0
  let crashes: number[] = []
  let lastExit: PreviewStatus['lastExit'] = null
  let error: string | null = null
  let restartTimer: ReturnType<typeof setTimeout> | undefined
  let probeTimer: ReturnType<typeof setTimeout> | undefined
  let exited: Promise<void> = Promise.resolve()
  const lines: string[] = []
  const waiters = new Set<() => void>()

  const notify = () => {
    for (const waiter of [...waiters]) waiter()
  }
  const setState = (next: PreviewState) => {
    state = next
    notify()
  }
  const remember = (chunk: Buffer | string) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue
      lines.push(line)
      if (lines.length > LOG_LINES) lines.shift()
      if (INTERESTING.test(line)) log(line.slice(0, 300))
    }
  }

  async function probe(): Promise<boolean> {
    try {
      const response = await fetchImpl(`${settings.origin}/`, {
        headers: { cookie: `${PREVIEW_COOKIE}=${settings.secret}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      })
      await response.body?.cancel().catch(() => {})
      return response.status < 500
    } catch {
      return false
    }
  }

  const scheduleProbe = () => {
    clearTimeout(probeTimer)
    probeTimer = setTimeout(async () => {
      if (stopping || !child || (state !== 'starting' && state !== 'ready')) return
      const ok = await probe()
      if (stopping || !child) return
      if (ok && state === 'starting') {
        log(`ready on ${settings.origin}`)
        setState('ready')
      } else if (!ok && state === 'ready') {
        setState('starting')
      }
      // Prêt : on revérifie de temps en temps (un next dev bloqué redevient « pas prêt »).
      scheduleProbe()
    }, state === 'ready' ? Math.max(probeIntervalMs, 10_000) : probeIntervalMs)
    probeTimer.unref?.()
  }

  function launch() {
    if (!settings.command && !existsSync(command)) {
      error = 'The preview cannot start: next is not installed in the work repository (run `npm run engine:setup`).'
      log(error)
      setState('failed')
      return
    }
    error = null
    setState('starting')
    let current: ChildLike
    try {
      current = spawn(command, args, { cwd: settings.repoDir, env: previewEnv(settings.baseEnv ?? process.env), detached: true })
    } catch (err) {
      error = `The preview could not be started: ${err instanceof Error ? err.message : String(err)}`
      log(error)
      setState('failed')
      return
    }
    child = current
    current.stdout?.on('data', remember)
    current.stderr?.on('data', remember)
    exited = new Promise<void>((resolve) => {
      let done = false
      const onEnd = (code: number | null, signal: NodeJS.Signals | null) => {
        if (done) return
        done = true
        resolve()
        if (child === current) child = null
        lastExit = { code, signal, at: new Date().toISOString() }
        clearTimeout(probeTimer)
        if (stopping) return setState('stopped')
        crashes = [...crashes.filter((at) => Date.now() - at < windowMs), Date.now()]
        if (crashes.length > maxRestarts) {
          error = `The preview crashed ${crashes.length} times in a row: it is no longer restarted. Check the engine logs.`
          log(error)
          return setState('failed')
        }
        const wait = backoff[Math.min(crashes.length - 1, backoff.length - 1)]
        log(`next dev exited (${signal ?? code}); restarting in ${Math.round(wait / 1000)} s`)
        setState('crashed')
        restartTimer = setTimeout(() => {
          if (stopping) return
          restarts++
          launch()
        }, wait)
        restartTimer.unref?.()
      }
      current.on('exit', onEnd)
      current.on('error', (err) => {
        remember(`spawn error: ${err.message}`)
        onEnd(null, null)
      })
    })
    scheduleProbe()
  }

  const signalChild = (signal: NodeJS.Signals) => {
    const current = child
    if (!current) return
    try {
      if (current.pid) killGroup(current.pid, signal)
      else current.kill(signal)
    } catch {
      current.kill(signal)
    }
  }

  return {
    start() {
      if (child || state === 'starting') return
      stopping = false
      crashes = []
      launch()
    },
    async stop() {
      stopping = true
      clearTimeout(restartTimer)
      clearTimeout(probeTimer)
      if (!child) return setState('stopped')
      signalChild('SIGTERM')
      const killer = setTimeout(() => signalChild('SIGKILL'), stopTimeoutMs)
      killer.unref?.()
      await exited
      clearTimeout(killer)
      setState('stopped')
    },
    stopSync() {
      stopping = true
      clearTimeout(restartTimer)
      clearTimeout(probeTimer)
      signalChild('SIGTERM')
    },
    status: () => ({
      state,
      ready: state === 'ready',
      url: settings.origin,
      pid: child?.pid ?? null,
      restarts,
      lastExit,
      error,
    }),
    waitReady(timeoutMs) {
      if (state === 'ready') return Promise.resolve(true)
      return new Promise((resolve) => {
        const finish = (value: boolean) => {
          clearTimeout(timer)
          waiters.delete(check)
          resolve(value)
        }
        const check = () => {
          if (state === 'ready') finish(true)
          else if (state === 'failed' || state === 'stopped') finish(false)
        }
        const timer = setTimeout(() => finish(false), timeoutMs)
        waiters.add(check)
      })
    },
    logs: () => [...lines],
  }
}
