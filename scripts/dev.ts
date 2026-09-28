import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import readline from 'node:readline'
import { devPlan, parseDotenv, portOf, prefixLine, type Painter } from './dev/plan'

/**
 * `npm run dev` : TOUT l'environnement local en une seule commande.
 *   [site] next dev : site + admin + Studio, 127.0.0.1:PORT (4040 par défaut) ;
 *   [ai]   moteur IA (engine/, ENGINE_PORT), qui lance et surveille lui-même l'aperçu du brouillon (ENGINE_PREVIEW_PORT).
 * Avant le moteur : `engine:setup` (idempotent : clone, dépendances, .env.local de l'aperçu) puis `engine:setup -- sync`
 * (avance le clone sur les commits de la source quand rien n'attend). Un refus de sync (demande en cours, publication
 * locale à rapatrier…) n'empêche pas de démarrer : son message s'affiche et le moteur part sur le clone tel quel.
 * Le moteur n'est pas lancé si ENGINE_MOCK=1, si engine/.env.local manque ou si un moteur répond déjà (scripts/dev/plan.ts).
 * Ctrl+C arrête tout proprement (le moteur arrête l'aperçu). Site seul : `npm run dev:site` ; moteur seul : `npm run engine`.
 *
 * Les fichiers .env ne sont que LUS (ENGINE_MOCK, ports) : chaque processus charge les siens (Next : .env.local ; moteur :
 * --env-file=engine/.env.local), le site n'hérite jamais des secrets du moteur. Rien n'est inscrit dans un gestionnaire
 * de processus (PM2…) : tout s'arrête avec le terminal.
 */

const ROOT = process.cwd()
const BIN = (name: string) => path.join(ROOT, 'node_modules', '.bin', name)
const ENGINE_ENV = 'engine/.env.local'
/** Le moteur se donne 45 s au plus pour s'arrêter (engine/src/main.ts) : au-delà, arrêt forcé. */
const STOP_TIMEOUT_MS = 50_000

const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
const paint = (code: number): Painter => (text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text)
const LABELS = { dev: paint(90), site: paint(36), ai: paint(35) } as const
type Label = keyof typeof LABELS

const say = (line: string) => console.log(prefixLine('dev', line, LABELS.dev))

function readEnvFile(file: string): Record<string, string> | null {
  const full = path.join(ROOT, file)
  return existsSync(full) ? parseDotenv(readFileSync(full, 'utf8')) : null
}

/** Quelque chose écoute-t-il déjà sur ce port (127.0.0.1) ? */
function portBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    const done = (busy: boolean) => {
      socket.destroy()
      resolve(busy)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(1_000, () => done(false))
  })
}

const children = new Set<ChildProcess>()
let stopping = false
let exitCode = 0

/** Lance un processus, chaque ligne de sa sortie préfixée ([site], [ai]). */
function launch(label: Label, command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(color ? { FORCE_COLOR: '1' } : {}) },
  })
  children.add(child)
  child.once('close', () => {
    children.delete(child)
    if (stopping && children.size === 0) process.exit(exitCode)
  })
  child.once('error', (error) => console.error(prefixLine(label, `could not start: ${error.message}`, LABELS[label])))
  const pipes: Array<[NodeJS.ReadableStream | null, NodeJS.WriteStream]> = [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]
  for (const [input, output] of pipes) {
    if (input) readline.createInterface({ input }).on('line', (line) => output.write(`${prefixLine(label, line, LABELS[label])}\n`))
  }
  return child
}

/** Étape préalable (mise en place, sync) : code de sortie, 1 si interrompue. */
function step(label: Label, command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = launch(label, command, args)
    child.once('close', (code, signal) => resolve(signal ? 1 : (code ?? 1)))
  })
}

/**
 * Arrêt de tout. Au Ctrl+C, le terminal envoie déjà SIGINT à chaque processus du groupe : le relayer ne gêne pas (l'arrêt
 * du moteur est idempotent) et couvre un `kill` adressé au seul lanceur.
 */
function stopAll(signal: NodeJS.Signals) {
  if (stopping) return
  stopping = true
  if (children.size === 0) process.exit(exitCode)
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill(signal)
  setTimeout(() => {
    for (const child of children) child.kill('SIGKILL')
    process.exit(1)
  }, STOP_TIMEOUT_MS).unref()
}

async function main() {
  process.on('SIGINT', () => stopAll('SIGINT'))
  process.on('SIGTERM', () => stopAll('SIGTERM'))
  process.on('SIGHUP', () => stopAll('SIGTERM'))

  const siteEnv = readEnvFile('.env.local') ?? {}
  const engineEnv = readEnvFile(ENGINE_ENV)
  const sitePort = portOf(process.env.PORT) ?? 4040
  const enginePort = portOf(engineEnv?.ENGINE_PORT)
  const plan = devPlan({
    sitePort,
    sitePortBusy: await portBusy(sitePort),
    mock: siteEnv.ENGINE_MOCK === '1',
    engineEnvFile: engineEnv !== null,
    enginePort,
    enginePortBusy: enginePort !== null && (await portBusy(enginePort)),
  })
  for (const note of plan.notes) say(note)
  if (plan.abort) process.exit(1)

  let startEngine = plan.startEngine
  if (startEngine) {
    say('Preparing the AI engine workspace (clone, sync with your commits)…')
    const setup = [`--env-file=${ENGINE_ENV}`, 'engine/src/workspace/setup.ts']
    if ((await step('ai', BIN('tsx'), setup)) !== 0) {
      if (stopping) return
      say('Engine setup failed (see above): starting the site without the AI engine.')
      startEngine = false
    } else if ((await step('ai', BIN('tsx'), [...setup, 'sync'])) !== 0) {
      if (stopping) return
      say('Sync skipped (see above): the AI engine starts on its current clone.')
    }
  }
  if (stopping) return

  const site = launch('site', BIN('next'), ['dev', '-H', '127.0.0.1', '-p', String(sitePort)])
  site.once('close', (code, signal) => {
    if (stopping) return
    exitCode = code || 1
    say(`The site stopped (${signal ?? `exit code ${code}`}): stopping everything.`)
    stopAll('SIGTERM')
  })
  if (startEngine) {
    const engine = launch('ai', BIN('tsx'), [`--env-file=${ENGINE_ENV}`, 'engine/src/main.ts'])
    engine.once('close', (code, signal) => {
      if (stopping) return
      say(
        `The AI engine stopped (${signal ?? `exit code ${code}`}). The site and admin keep running; ` +
          'once the message above is fixed, restart it with `npm run engine` in another terminal.',
      )
    })
  }
}

void main()
