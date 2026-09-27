import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EditJob, EngineHealth, EngineUser } from '../../../src/admin/core/contracts'
import { createFakeAgent, readAgentSettings, type AgentSettings, type FakeScript } from '../claude'
import { createFakeSanity, type FakeSanity } from '../content/fake'
import { createTextStore } from '../content/texts'
import type { PreviewSignal } from '../content/visible'
import { openWorkRepo, type WorkRepo } from '../git/git'
import type { Preview, VisualSession, VisualVerdict } from '../guards'
import { measuresOf } from '../guards/measure-fixtures'
import { openEngineStore, type EngineStore } from '../store/store'
import { createEngineLock, type EngineLock } from './lock'
import { createEditorService, type EditorService } from './service'
import type { EditorDeps, UsageRecorder } from './types'

/**
 * Banc d'essai du cycle d'une demande (tests seulement, pas un fichier de test) : un espace de travail TEMPORAIRE façon
 * Conduit (dépôt git avec zones.json, tokens.json, tokens.css, RULES.md et CSS Modules des fixtures d'engine-guards),
 * faux Claude (engine-claude), faux aperçu, faux Sanity. Jamais de réseau, jamais le vrai dépôt.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const CONDUIT = path.resolve(here, '../guards/fixtures/conduit')
const RULES = path.resolve(here, '../../../src/editor/RULES.md')

export const HERO_CSS = 'src/components/sections/Hero/Hero.module.css'
export const HERO_TSX = 'src/components/sections/Hero/Hero.tsx'
export const PAGE_DOC = 'dockSchedulingPage'
export const TITLE_FIELD = `${PAGE_DOC}:hero.title`

export const CLIENT: EngineUser = { id: 'u-client', name: 'Marie Client', email: 'marie@conduit.test', role: 'client' }
export const KUARTZ: EngineUser = { id: 'u-kz', name: 'Kuartz Dev', email: 'dev@kuartz.test', role: 'kuartz' }

const HERO_COMPONENT = `import styles from './Hero.module.css'

export function Hero({ title, lede }: { title: string; lede: string }) {
  return (
    <section className={styles.hero} data-edit="hero">
      <h1 className={styles.title} data-edit="hero.title">{title}</h1>
      <p className={styles.lede} data-edit="hero.lede">{lede}</p>
    </section>
  )
}
`

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' }).trim()

/** Espace de travail temporaire : <tmp>/repo (git, branches main et draft, draft extraite), data/, shots/, claude/. */
export async function makeWorkspace(): Promise<{ workspace: string; repoDir: string; repo: WorkRepo; git: (...args: string[]) => string }> {
  const workspace = await realpath(await mkdtemp(path.join(os.tmpdir(), 'kz-engine-')))
  const repoDir = path.join(workspace, 'repo')
  await cp(CONDUIT, repoDir, { recursive: true })
  await writeFile(path.join(repoDir, 'src/editor/RULES.md'), await readFile(RULES, 'utf8'))
  await writeFile(path.join(repoDir, HERO_TSX), HERO_COMPONENT)
  await mkdir(path.join(repoDir, 'src/app/(site)/blog/[slug]'), { recursive: true })
  await writeFile(path.join(repoDir, 'src/app/(site)/page.tsx'), 'export default function Home() { return null }\n')
  await writeFile(path.join(repoDir, 'src/app/(site)/blog/[slug]/page.tsx'), 'export default function Post() { return null }\n')
  await writeFile(path.join(repoDir, '.gitignore'), '.env*\nnode_modules/\n.next/\n')
  git(repoDir, 'init', '--quiet', '--initial-branch=draft')
  git(repoDir, 'add', '--all')
  git(repoDir, 'commit', '--quiet', '-m', 'initial')
  git(repoDir, 'branch', 'main')
  for (const dir of ['data', 'shots', 'claude']) await mkdir(path.join(workspace, dir), { recursive: true })
  return { workspace, repoDir, repo: await openWorkRepo(repoDir, workspace), git: (...args) => git(repoDir, ...args) }
}

/** Faux Sanity avec la page d'accueil de Conduit publiée (sans brouillon). */
export function conduitSanity(): FakeSanity {
  return createFakeSanity([
    {
      _id: PAGE_DOC,
      _type: 'dockSchedulingPage',
      hero: { title: 'Dock scheduling that just works', lede: 'Book, track and run every dock appointment.' },
      getStarted: { title: 'Get started', titleMuted: 'in minutes', text: 'Talk to our team.' },
    },
  ])
}

export type FakeSessionOptions = {
  /** Verdicts successifs de verify() (le dernier se répète) ; défaut : tout va bien. */
  verdicts?: Partial<VisualVerdict>[]
  /** open() échoue. */
  failOpen?: boolean
}

/** Faux aperçu : sessions dont le rendu est « identique » sauf ce que disent les verdicts. */
export function fakePreview(options: FakeSessionOptions = {}) {
  const opened: { page: string; zone: string; index: number }[] = []
  let closed = 0
  let verifies = 0
  const preview: Preview = {
    async open(page, zone, index) {
      if (options.failOpen) throw new Error('preview down')
      opened.push({ page, zone, index })
      const before = measuresOf({})
      const session: VisualSession = {
        before,
        pageTexts: [],
        occurrences: before,
        painted: before as unknown as VisualSession['painted'],
        measure: async () => measuresOf({}),
        verify: async () => {
          const list = options.verdicts ?? []
          const partial = list.length ? list[Math.min(verifies, list.length - 1)] : {}
          verifies++
          return {
            render: { ok: true },
            responsive: { ok: true },
            isolation: { ok: true, zones: [] },
            after: before,
            occurrences: before,
            painted: before as unknown as VisualVerdict['painted'],
            unmeasured: [],
            unreadable: [],
            ...partial,
          }
        },
        saveShots: async (dir) => {
          await mkdir(dir, { recursive: true })
          const names = ['375-before.png', '375-after.png']
          for (const name of names) await writeFile(path.join(dir, name), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
          return names
        },
        close: async () => void closed++,
      }
      return session
    },
  }
  return { preview, opened, closed: () => closed, verifies: () => verifies }
}

export const freshSignal = (): PreviewSignal & { calls: { page: string; texts: readonly string[] }[] } => {
  const calls: { page: string; texts: readonly string[] }[] = []
  return { calls, waitFresh: async (page, texts) => (calls.push({ page, texts }), true) }
}

export type Bench = {
  workspace: string
  repoDir: string
  repo: WorkRepo
  git: (...args: string[]) => string
  store: EngineStore
  sanity: FakeSanity
  preview: ReturnType<typeof fakePreview>
  signal: ReturnType<typeof freshSignal>
  lock: EngineLock
  agent: ReturnType<typeof createFakeAgent>
  budgets: number[]
  usage: EditJob[]
  service: EditorService
  settings: AgentSettings
  cleanup(): Promise<void>
  /** Attend que la demande atteigne un statut (ou un statut final). */
  until(jobId: string, statuses: EditJob['status'][], timeoutMs?: number): Promise<EditJob>
}

export async function makeBench(
  script: FakeScript,
  options: {
    preview?: FakeSessionOptions
    maxRequestUsd?: number
    questionTimeoutMs?: number
    noWriteToken?: boolean
    typecheck?: EditorDeps['typecheck']
    access?: EditorDeps['access']
    previewReady?: () => boolean
  } = {},
): Promise<Bench> {
  const ws = await makeWorkspace()
  const store = await openEngineStore(path.join(ws.workspace, 'data'))
  const sanity = conduitSanity()
  const preview = fakePreview(options.preview)
  const signal = freshSignal()
  const lock = createEngineLock()
  const agent = createFakeAgent(script)
  const budgets: number[] = []
  const usage: EditJob[] = []
  const settings = readAgentSettings(
    { EDITOR_QUESTION_TIMEOUT_MS: String(options.questionTimeoutMs ?? 60_000) },
    { configDir: path.join(ws.workspace, 'claude') },
  )
  const recorder: UsageRecorder = { record: async ({ job }) => void usage.push(job) }
  const health = async (): Promise<EngineHealth> => ({
    ok: true,
    version: 'test',
    mode: 'local',
    claude: { access: 'api-key', editorModel: settings.model, askModel: 'claude-haiku-4-5' },
    sanityWrite: !options.noWriteToken,
    preview: { url: 'http://127.0.0.1:4999', ready: true },
    git: { branch: 'draft', clean: true, aheadOfMain: 0 },
  })
  const service = createEditorService({
    repo: ws.repo,
    store: store.editor,
    texts: createTextStore(options.noWriteToken ? null : sanity),
    preview: preview.preview,
    signal,
    ...(options.previewReady ? { previewReady: options.previewReady } : {}),
    previewUrl: (page) => ({ url: `http://127.0.0.1:4999${page}?kz_preview=test-secret`, origin: 'http://127.0.0.1:4999' }),
    runAgent: (run, limits) => (budgets.push(limits.maxBudgetUsd), agent(run)),
    access: options.access ?? { ok: true, access: { kind: 'api-key', secret: 'sk-test' } },
    settings,
    maxRequestUsd: options.maxRequestUsd ?? 1.5,
    lock,
    shotsDir: path.join(ws.workspace, 'shots'),
    health,
    usage: recorder,
    typecheck: options.typecheck ?? (async () => null),
    log: () => {},
  })
  lock.setEditorGate(service)
  const until = async (jobId: string, statuses: EditJob['status'][], timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const job = store.editor.job(jobId)?.job
      if (job && statuses.includes(job.status)) return job
      if (Date.now() > deadline) throw new Error(`Job ${jobId} stuck in ${job?.status}; expected ${statuses.join('/')}`)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  return {
    ...ws,
    store,
    sanity,
    preview,
    signal,
    lock,
    agent,
    budgets,
    usage,
    service,
    settings,
    until,
    cleanup: async () => {
      await service.idle()
      await store.editor.flush()
      await rm(ws.workspace, { recursive: true, force: true })
    },
  }
}

/** Demande type (contrat EditRequest). */
export function editRequest(partial: Partial<{ zone: string; scope: ('style' | 'text')[]; note: string; changeId: string; page: string }> = {}) {
  return {
    page: partial.page ?? '/',
    targets: [{ zone: partial.zone ?? 'hero.lede', index: 0, label: 'whatever the browser says' }],
    scope: partial.scope ?? ['style'],
    note: partial.note ?? 'Make the lede darker.',
    viewport: 1280,
    ...(partial.changeId ? { changeId: partial.changeId } : {}),
  }
}
