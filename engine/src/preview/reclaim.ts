import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import path from 'node:path'

/**
 * Aperçu ORPHELIN (constaté le 2026-09-28) : un moteur tué sans s'arrêter proprement (terminal fermé, kill -9) laisse
 * derrière lui son `next dev` — lancé détaché, dans son propre groupe — sur ENGINE_PREVIEW_PORT ; le moteur suivant ne
 * pouvait plus lancer le sien (port pris, plantages en boucle, puis « failed »).
 *
 * Au démarrage du moteur : si le port de l'aperçu est pris PAR UN PROCESSUS DONT LE DOSSIER DE TRAVAIL EST LE CLONE,
 * c'est un aperçu laissé par un moteur précédent de CET espace de travail : son groupe est arrêté (SIGTERM, puis
 * SIGKILL au bout de `graceMs`). Un autre programme sur ce port n'est JAMAIS touché : un message dit quoi faire.
 * Sans `lsof` (ou si la sonde échoue), rien n'est fait : le comportement d'avant s'applique.
 */

export type PortListener = {
  pid: number
  /** Groupe du processus (l'aperçu est lancé détaché : chef de son groupe). */
  pgid: number
  /** Dossier de travail réel (liens résolus), ou null s'il n'a pas pu être lu. */
  cwd: string | null
}

export type ReclaimDeps = {
  /** Processus qui écoute sur 127.0.0.1:<port>, ou null (port libre, ou sonde indisponible). */
  listenerOf(port: number): Promise<PortListener | null>
  killGroup(pgid: number, signal: NodeJS.Signals): void
  sleep(ms: number): Promise<void>
  log(line: string): void
}

export type ReclaimResult = 'free' | 'reclaimed' | 'foreign' | 'stuck'

export async function reclaimPreviewPort(
  input: { port: number; repoDir: string; graceMs?: number; pollMs?: number },
  deps: ReclaimDeps,
): Promise<ReclaimResult> {
  const listener = await deps.listenerOf(input.port).catch(() => null)
  if (!listener) return 'free'
  const repo = await realpath(input.repoDir).catch(() => path.resolve(input.repoDir))
  if (listener.cwd !== repo) {
    deps.log(
      `⚠ Port ${input.port} (draft preview) is used by another program (pid ${listener.pid}), not by a preview of this ` +
        'workspace: free it or change ENGINE_PREVIEW_PORT, or the preview cannot start.',
    )
    return 'foreign'
  }
  deps.log(`A draft preview left running by a previous engine (pid ${listener.pid}) holds port ${input.port}: stopping it.`)
  const graceMs = input.graceMs ?? 5_000
  const pollMs = input.pollMs ?? 200
  deps.killGroup(listener.pgid, 'SIGTERM')
  for (let waited = 0; waited < graceMs; waited += pollMs) {
    await deps.sleep(pollMs)
    if (!(await deps.listenerOf(input.port).catch(() => null))) return 'reclaimed'
  }
  deps.killGroup(listener.pgid, 'SIGKILL')
  for (let waited = 0; waited < 2_000; waited += pollMs) {
    await deps.sleep(pollMs)
    if (!(await deps.listenerOf(input.port).catch(() => null))) return 'reclaimed'
  }
  deps.log(`⚠ The previous draft preview (pid ${listener.pid}) did not stop: port ${input.port} is still in use.`)
  return 'stuck'
}

// ─── Implémentation système (macOS, Linux : lsof et ps) ──────────────────────

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 5_000, encoding: 'utf8' }, (error, stdout) => (error ? reject(error) : resolve(stdout)))
  })
}

/** Processus en écoute sur 127.0.0.1:<port> avec son groupe et son dossier de travail (lsof + ps). */
export async function systemListenerOf(port: number): Promise<PortListener | null> {
  const pids = await run('lsof', ['-nP', `-iTCP@127.0.0.1:${port}`, '-sTCP:LISTEN', '-t']).catch(() => '')
  const pid = Number(pids.split('\n').find((line) => /^\d+$/.test(line.trim()))?.trim())
  if (!Number.isInteger(pid) || pid <= 0) return null
  const pgid = Number((await run('ps', ['-o', 'pgid=', '-p', String(pid)]).catch(() => '')).trim())
  const cwdOut = await run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']).catch(() => '')
  const raw = cwdOut.split('\n').find((line) => line.startsWith('n'))?.slice(1) ?? null
  const cwd = raw ? await realpath(raw).catch(() => raw) : null
  return { pid, pgid: Number.isInteger(pgid) && pgid > 0 ? pgid : pid, cwd }
}

export function systemReclaimDeps(log: (line: string) => void): ReclaimDeps {
  return {
    listenerOf: systemListenerOf,
    killGroup: (pgid, signal) => {
      try {
        process.kill(-pgid, signal)
      } catch {
        // Groupe déjà parti.
      }
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log,
  }
}
