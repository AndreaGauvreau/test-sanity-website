import { z } from 'zod'
import adminConfig from '../../../../admin.config'
import zonesFile from '../../../../editor/zones.json'
import { sumUsage } from '../../contracts/format'
import type {
  Answer,
  ChangeSummaryItem,
  CheckResult,
  EditJob,
  EditRequest,
  EditorState,
  PendingChange,
  PendingDesignItem,
  Question,
  Step,
  StepKind,
  TextChange,
  ThreadEntry,
  Usage,
} from '../../contracts/engine'
import { engineErrorBody } from '../errors'
import { MOCK_HEALTH } from './health'
import type { MockEngineRequest, MockEngineResponse, MockHandler } from './types'

/**
 * Éditeur IA SIMULÉ (routes /editor/*, ENGINE_MOCK=1) — propriétaire : editor-sidebar.
 *
 * Rejoue le cycle d'une demande dans le temps, sans minuteur : l'état avance à chaque lecture d'après l'horloge
 * (`advance`). queued → running (étapes) → waiting (question 🟢 ⚪ 🔴) → réponse → running → done (résumé, contrôles,
 * usage) → Validate / Cancel ; Stop ; échec (« fail » dans la demande) ; refus (« already » / « nothing »).
 * Mêmes règles que le vrai moteur : une demande à la fois (409 busy), une modification en attente à la fois
 * (409 awaiting_validation), entrées validées (zod), question sans réponse 15 min → stopped.
 * Fil persistant en mémoire (globalThis : survit au rechargement à chaud, pas au redémarrage du serveur).
 * AUCUNE écriture réelle : ni Sanity, ni git.
 */

// ─── Validation des entrées (miroir du moteur) ──────────────────────────────────────────────────────────

const SAFE_ID = /^[\w.-]+$/

const Target = z.object({
  zone: z.string().min(1).max(80).regex(SAFE_ID),
  index: z.number().int().min(0).max(999),
  doc: z.string().min(1).max(128).regex(SAFE_ID).optional(),
  key: z.string().min(1).max(128).regex(SAFE_ID).optional(),
  label: z.string().min(1).max(120),
})

// eslint-disable-next-line no-control-regex
const NO_CONTROL = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/
const visible = (s: string) => Array.from(s.trim()).length

export const EditRequestSchema = z.object({
  page: z.string().min(1).max(200).startsWith('/'),
  targets: z.array(Target).min(1).max(8),
  scope: z
    .array(z.enum(['style', 'text']))
    .min(1)
    .max(2)
    .refine((s) => new Set(s).size === s.length, 'Duplicate scope.'),
  note: z
    .string()
    .regex(NO_CONTROL, 'Invalid characters.')
    .refine((s) => visible(s) >= 1 && visible(s) <= 600, 'The request must be 1 to 600 characters.'),
  viewport: z.union([z.literal(1280), z.literal(768), z.literal(375)]),
  changeId: z.string().min(1).max(128).regex(SAFE_ID).optional(),
})

const AnswerSchema = z
  .object({
    questionId: z.string().min(1).max(64),
    optionId: z.string().min(1).max(64).optional(),
    other: z
      .string()
      .regex(NO_CONTROL, 'Invalid characters.')
      .refine((s) => visible(s) >= 1 && visible(s) <= 300, 'Your answer must be 1 to 300 characters.')
      .optional(),
  })
  .refine((a) => (a.optionId ? !a.other : !!a.other), 'Choose one option or write your own answer.')

export const AnswersSchema = z.object({ answers: z.array(AnswerSchema).min(1).max(3) })

// ─── Monde simulé ────────────────────────────────────────────────────────────────────────────────────

type Scenario = 'ask' | 'direct' | 'fail' | 'reject'

type Sim = {
  job: EditJob
  scenario: Scenario
  /** pre : avant la question ; post : après la réponse (ou directement). */
  phase: 'pre' | 'post'
  phaseAt: number
  applied: number
  /** Résumé et contrôles de la modification AVANT un ajustement (retour si l'ajustement échoue). */
  previous?: Pick<PendingChange, 'summary' | 'checks'>
}

export type EditorMockWorld = {
  seq: number
  sims: Map<string, Sim>
  threads: Map<string, ThreadEntry[]>
  changes: Map<string, PendingChange>
  pendingId: string | null
  /** Modifications validées, en attente de Publish (pour publish-ui : listValidatedDesignChanges). */
  validated: PendingDesignItem[]
}

/** Brouillons de contenu « déjà en attente » dans la démo : 2 + 1 modification validée → « (3 changes) » du Figma. */
export const MOCK_CONTENT_DRAFTS = 2
export const MOCK_QUESTION_TTL_MS = 15 * 60 * 1000
const THREAD_LIMIT = 50
const ACTIVE = new Set(['queued', 'running', 'waiting'])
const MODEL = { id: 'claude-opus-5-5', label: 'Opus 5.5' }

function emptyWorld(): EditorMockWorld {
  return { seq: 0, sims: new Map(), threads: new Map(), changes: new Map(), pendingId: null, validated: [] }
}

type ZoneLike = { label?: string; section?: string; files?: string[] }
const ZONES = (zonesFile as unknown as { zones: Record<string, ZoneLike> }).zones

function cssFileOf(zone: string): string {
  const files = ZONES[zone]?.files ?? []
  const css = files.find((f) => f.endsWith('.module.css')) ?? files[0]
  return css ? (css.split('/').pop() ?? css) : 'the section styles'
}

function shortLabel(label: string): string {
  const parts = label.split(' · ')
  return parts[parts.length - 1] || label
}

function pageIdOf(path: string): string {
  return adminConfig.pages.find((p) => p.path === path)?.id ?? 'home'
}

function previewFor(path: string): EditorState['preview'] {
  let origin = 'http://127.0.0.1:4040'
  try {
    origin = new URL(adminConfig.site.url).origin
  } catch {
    // URL du manifeste invalide : origine locale par défaut.
  }
  return { url: `${origin}/admin/editor/harness?page=${encodeURIComponent(pageIdOf(path))}`, origin }
}

function usageOf(kind: 'request' | 'adjustment' | 'partial' | 'rejected', durationMs: number): Usage {
  const table = {
    request: [20_900, 1_600, 0.09],
    adjustment: [12_400, 620, 0.05],
    partial: [8_200, 310, 0.03],
    rejected: [6_400, 210, 0.02],
  } as const
  const [input, output, cost] = table[kind]
  return {
    model: MODEL.id,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: Math.round(input * 0.6),
    cacheWriteTokens: Math.round(input * 0.2),
    costUsd: cost,
    costKind: kind === 'partial' ? 'estimated' : 'billed',
    access: 'api-key',
    durationMs: Math.max(0, durationMs),
    turns: kind === 'request' ? 9 : 5,
  }
}

function errorResponse(status: number, code: Parameters<typeof engineErrorBody>[0], message: string): MockEngineResponse {
  return { status, json: engineErrorBody(code, message) }
}

function wantsQuestion(req: EditRequest): boolean {
  return req.scope.includes('style') && /\b(big|bigger|larger|smaller|size|huge|tiny)\b/i.test(req.note)
}

function pickScenario(req: EditRequest, kind: EditJob['kind']): Scenario {
  if (/\bfail/i.test(req.note)) return 'fail'
  if (/\b(already|nothing)\b/i.test(req.note)) return 'reject'
  if (kind === 'request' && wantsQuestion(req)) return 'ask'
  return 'direct'
}

function sizeQuestion(req: EditRequest): Question {
  const first = req.note.split(/[.,;!?]| and /)[0]?.trim() || req.note.trim()
  const quoted = first.length > 60 ? `${first.slice(0, 57)}…` : first
  return {
    id: 'q1',
    topic: 'Size',
    question: `“${quoted}” — no token matches exactly. Closest: Heading XL (56 px).`,
    options: [
      { id: 'token', label: 'Use Heading XL (recommended)', tone: 'recommended' },
      { id: 'keep', label: 'Don’t change the size', tone: 'neutral' },
      {
        id: 'hardcode',
        label: 'Hard-code 60 px (not recommended)',
        tone: 'discouraged',
        hardcoded: { property: 'font-size', value: '60px' },
      },
    ],
  }
}

// ─── Moteur simulé ───────────────────────────────────────────────────────────────────────────────────

export type EditorMock = {
  handle: MockHandler
  /** Pour les tests : l'état brut (ne pas le muter hors de ce fichier). */
  readonly world: EditorMockWorld
  reset: () => void
}

export function createEditorMock(options: { now?: () => number } = {}): EditorMock {
  const now = options.now ?? (() => Date.now())
  let world = emptyWorld()
  const iso = (t: number) => new Date(t).toISOString()
  const nextId = (prefix: string) => `${prefix}-${now().toString(36)}-${++world.seq}`

  function threadOf(page: string): ThreadEntry[] {
    let thread = world.threads.get(page)
    if (!thread) {
      thread = []
      world.threads.set(page, thread)
    }
    return thread
  }

  function pushEntry(page: string, entry: ThreadEntry) {
    const thread = threadOf(page)
    thread.push(entry)
    if (thread.length > THREAD_LIMIT) thread.splice(0, thread.length - THREAD_LIMIT)
  }

  function pending(): PendingChange | null {
    return world.pendingId ? (world.changes.get(world.pendingId) ?? null) : null
  }

  function step(job: EditJob, at: number, kind: StepKind, label: string) {
    const s: Step = { at: iso(at), kind, label }
    job.steps.push(s)
  }

  function finish(sim: Sim, at: number, status: EditJob['status']) {
    const { job } = sim
    job.status = status
    job.finishedAt = iso(at)
    delete job.question
    const duration = at - Date.parse(job.startedAt ?? job.createdAt)
    const change = world.changes.get(job.changeId)
    if (status === 'done') {
      job.usage = usageOf(job.kind === 'adjustment' ? 'adjustment' : 'request', duration)
      if (change) {
        change.status = 'to-validate'
        change.summary = job.summary
        change.checks = job.checks
        if (job.kind === 'adjustment') change.adjustments += 1
        const usages = change.jobIds.map((id) => world.sims.get(id)?.job.usage).filter((u): u is Usage => !!u)
        change.usage = sumUsage(usages) ?? undefined
      }
      return
    }
    job.usage = usageOf(status === 'rejected' ? 'rejected' : 'partial', duration)
    if (!change) return
    if (job.kind === 'adjustment' && sim.previous) {
      // L'ajustement est retiré ; la modification d'avant reste à valider.
      change.status = 'to-validate'
      change.summary = sim.previous.summary
      change.checks = sim.previous.checks
    } else {
      change.status = 'discarded'
      if (world.pendingId === change.id) world.pendingId = null
    }
  }

  function computeResult(job: EditJob) {
    const req = job.request
    const title = shortLabel(req.targets[0].label)
    const summary: ChangeSummaryItem[] = []
    const texts: TextChange[] = []
    const pick = job.answers?.[0]
    if (req.scope.includes('style')) {
      if (job.kind === 'adjustment') {
        summary.push({ target: title, description: `${title}: Heading XL → Heading L`, kind: 'style', where: 'code' })
      } else if (pick?.optionId === 'hardcode') {
        summary.push({ target: title, description: `${title}: size → 60 px (hard-coded)`, kind: 'style', where: 'code' })
        job.hardcoded = [{ property: 'font-size', value: '60px' }]
      } else if (pick?.optionId !== 'keep') {
        summary.push({ target: title, description: `${title}: size → Heading XL (token)`, kind: 'style', where: 'code' })
      }
    }
    if (req.scope.includes('text') && job.kind === 'request') {
      summary.push({ target: title, description: '“solved” in bold', kind: 'text', where: 'sanity-draft' })
      texts.push({
        document: req.targets[0].doc ?? 'dockSchedulingPage',
        path: 'hero.title',
        before: 'Dock scheduling, solved.',
        after: 'Dock scheduling, *solved*.',
      })
    }
    job.summary = summary
    job.texts = texts
    job.checks = [
      { id: 'contrast', label: 'contrast', ok: true },
      { id: 'responsive', label: 'mobile', ok: true },
      { id: 'lines', label: 'tablet', ok: true },
    ] satisfies CheckResult[]
  }

  type Event = { at: number; run: (at: number) => void }

  function preEvents(sim: Sim): Event[] {
    const { job } = sim
    const req = job.request
    const start: Event[] = [
      {
        at: 500,
        run: (at) => {
          job.status = 'running'
          job.startedAt = iso(at)
          step(job, at, 'read', `Reading ${cssFileOf(req.targets[0].zone)}`)
        },
      },
      { at: 1400, run: (at) => step(job, at, 'read', 'Reading the design tokens and rules') },
    ]
    switch (sim.scenario) {
      case 'ask':
        return [
          ...start,
          {
            at: 2400,
            run: (at) => {
              job.status = 'waiting'
              job.question = { questions: [sizeQuestion(req)], askedAt: iso(at), expiresAt: iso(at + MOCK_QUESTION_TTL_MS) }
            },
          },
        ]
      case 'reject':
        return [
          ...start,
          {
            at: 2400,
            run: (at) => {
              job.message = 'Nothing to change: the element already looks like this.'
              finish(sim, at, 'rejected')
            },
          },
        ]
      case 'fail':
        return [
          ...start,
          { at: 2400, run: (at) => step(job, at, 'warn', 'Checks failed: the text overflows at 375 px') },
          {
            at: 3200,
            run: (at) => {
              job.attempts = 2
              step(job, at, 'retry', 'Second attempt with the checks’ feedback')
            },
          },
          {
            at: 4200,
            run: (at) => {
              step(job, at, 'error', 'Checks failed again: everything was rolled back')
              job.error = 'The checks failed twice, so nothing was changed.'
              finish(sim, at, 'failed')
            },
          },
        ]
      default:
        return [
          ...start,
          {
            at: 2400,
            run: (at) => {
              sim.phase = 'post'
              sim.phaseAt = at
              sim.applied = 0
            },
          },
        ]
    }
  }

  function postEvents(sim: Sim): Event[] {
    const { job } = sim
    const req = job.request
    return [
      {
        at: 0,
        run: (at) => {
          const title = shortLabel(req.targets[0].label)
          const pick = job.answers?.[0]
          if (req.scope.includes('style')) {
            const label =
              job.kind === 'adjustment'
                ? `${title}: Heading XL → Heading L`
                : pick?.optionId === 'hardcode'
                  ? `${title} → 60 px`
                  : pick?.optionId === 'keep'
                    ? `${title}: size kept`
                    : `${title} → Heading XL`
            step(job, at, 'edit', label)
          }
          if (req.scope.includes('text') && job.kind === 'request') step(job, at, 'text', '“solved” in bold (Sanity draft)')
        },
      },
      { at: 900, run: (at) => step(job, at, 'measure', 'Measuring at 375 · 768 · 1280 px') },
      { at: 1800, run: (at) => step(job, at, 'check', 'Running the checks') },
      {
        at: 2700,
        run: (at) => {
          computeResult(job)
          if (!job.summary.length) {
            job.message = 'Nothing was changed: you chose to keep it as it is.'
            finish(sim, at, 'rejected')
          } else finish(sim, at, 'done')
        },
      },
    ]
  }

  /** Applique les événements dus de la demande (lecture paresseuse, sans minuteur). */
  function advance(sim: Sim, t: number): void {
    const { job } = sim
    if (!ACTIVE.has(job.status)) return
    if (job.status === 'waiting') {
      if (job.question && t >= Date.parse(job.question.expiresAt)) {
        const at = Date.parse(job.question.expiresAt)
        step(job, at, 'info', 'No answer for 15 minutes: everything was rolled back')
        finish(sim, at, 'stopped')
      }
      return
    }
    const events = sim.phase === 'pre' ? preEvents(sim) : postEvents(sim)
    while (sim.applied < events.length) {
      const event = events[sim.applied]
      const at = sim.phaseAt + event.at
      if (at > t) return
      const phase = sim.phase
      sim.applied += 1
      event.run(at)
      // Changement de phase ou fin : on repart de la nouvelle liste (ou on s'arrête).
      if (sim.phase !== phase || !ACTIVE.has(job.status) || job.status === 'waiting') return advance(sim, t)
    }
  }

  function advanceAll() {
    const t = now()
    for (const sim of world.sims.values()) advance(sim, t)
  }

  function activeSim(): Sim | null {
    for (const sim of world.sims.values()) if (ACTIVE.has(sim.job.status)) return sim
    return null
  }

  const snapshot = <T>(value: T): T => structuredClone(value)

  // ─── Routes ────────────────────────────────────────────────────────────────────────────────────────

  function getState(req: MockEngineRequest): MockEngineResponse {
    const page = req.query.get('page') ?? ''
    if (!page.startsWith('/') || page.length > 200) return errorResponse(400, 'bad_request', 'A page path is required.')
    advanceAll()
    const thread = threadOf(page)
    const usages = thread.flatMap((e) => (e.type === 'job' && e.job.usage ? [e.job.usage] : []))
    const state: EditorState = {
      page,
      health: MOCK_HEALTH,
      preview: previewFor(page),
      active: activeSim()?.job ?? null,
      pending: pending(),
      thread,
      conversationUsage: sumUsage(usages),
      model: MODEL,
    }
    return { status: 200, json: snapshot(state) }
  }

  function postRequest(req: MockEngineRequest): MockEngineResponse {
    const parsed = EditRequestSchema.safeParse(req.body)
    if (!parsed.success) return errorResponse(400, 'bad_request', parsed.error.issues[0]?.message ?? 'Invalid request.')
    advanceAll()
    const request = parsed.data as EditRequest
    request.note = request.note.trim()
    if (activeSim()) return errorResponse(409, 'busy', 'Claude is already working on a request. Try again when it’s done.')
    const current = pending()
    if (request.changeId) {
      if (!current || current.id !== request.changeId || current.status !== 'to-validate') {
        return errorResponse(409, 'conflict', 'This change is no longer waiting for validation. Reload the editor.')
      }
    } else if (current) {
      return errorResponse(409, 'awaiting_validation', 'A change is waiting for validation. Validate or cancel it first.')
    }
    const t = now()
    const kind: EditJob['kind'] = request.changeId ? 'adjustment' : 'request'
    const changeId = request.changeId ?? nextId('chg')
    const job: EditJob = {
      id: nextId('job'),
      changeId,
      kind,
      request,
      requestedBy: req.user,
      createdAt: iso(t),
      status: 'queued',
      steps: [],
      summary: [],
      checks: [],
      texts: [],
      hardcoded: [],
      attempts: 1,
    }
    const sim: Sim = { job, scenario: pickScenario(request, kind), phase: 'pre', phaseAt: t, applied: 0 }
    if (current && kind === 'adjustment') {
      sim.previous = { summary: current.summary, checks: current.checks }
      current.status = 'working'
      current.jobIds.push(job.id)
    } else {
      world.changes.set(changeId, {
        id: changeId,
        page: request.page,
        targets: request.targets,
        status: 'working',
        jobIds: [job.id],
        adjustments: 0,
        summary: [],
        checks: [],
        createdAt: iso(t),
        createdBy: req.user,
      })
      world.pendingId = changeId
    }
    world.sims.set(job.id, sim)
    pushEntry(request.page, { type: 'job', job })
    return { status: 201, json: snapshot(job) }
  }

  function findSim(id: string | undefined): Sim | null {
    return (id && world.sims.get(id)) || null
  }

  function getJob(req: MockEngineRequest): MockEngineResponse {
    advanceAll()
    const sim = findSim(req.params.id)
    return sim ? { status: 200, json: snapshot(sim.job) } : errorResponse(404, 'not_found', 'This request no longer exists.')
  }

  function postAnswer(req: MockEngineRequest): MockEngineResponse {
    advanceAll()
    const sim = findSim(req.params.id)
    if (!sim) return errorResponse(404, 'not_found', 'This request no longer exists.')
    const { job } = sim
    if (job.status !== 'waiting' || !job.question) return errorResponse(409, 'conflict', 'Claude isn’t waiting for an answer anymore.')
    const parsed = AnswersSchema.safeParse(req.body)
    if (!parsed.success) return errorResponse(400, 'bad_request', parsed.error.issues[0]?.message ?? 'Invalid answer.')
    const answers = parsed.data.answers.map((a) => (a.other ? { ...a, other: a.other.trim() } : a)) as Answer[]
    const questions = job.question.questions
    if (answers.length !== questions.length || new Set(answers.map((a) => a.questionId)).size !== answers.length) {
      return errorResponse(400, 'bad_request', 'Answer every question once.')
    }
    for (const q of questions) {
      const a = answers.find((x) => x.questionId === q.id)
      if (!a) return errorResponse(400, 'bad_request', 'Answer every question once.')
      if (a.optionId && !q.options.some((o) => o.id === a.optionId)) return errorResponse(400, 'bad_request', 'Unknown option.')
    }
    const t = now()
    job.answers = answers
    const first = answers[0]
    const option = questions[0].options.find((o) => o.id === first.optionId)
    step(job, t, 'info', option ? `You chose: ${option.label}` : `Your answer: ${first.other}`)
    delete job.question
    job.status = 'running'
    sim.phase = 'post'
    sim.phaseAt = t
    sim.applied = 0
    return { status: 200, json: snapshot(job) }
  }

  function postStop(req: MockEngineRequest): MockEngineResponse {
    advanceAll()
    const sim = findSim(req.params.id)
    if (!sim) return errorResponse(404, 'not_found', 'This request no longer exists.')
    if (ACTIVE.has(sim.job.status)) {
      const t = now()
      step(sim.job, t, 'info', 'Stopped: everything was rolled back')
      finish(sim, t, 'stopped')
    }
    return { status: 200, json: snapshot(sim.job) }
  }

  function decide(req: MockEngineRequest, decision: 'validate' | 'cancel'): MockEngineResponse {
    advanceAll()
    const change = req.params.id ? world.changes.get(req.params.id) : undefined
    if (!change) return errorResponse(404, 'not_found', 'This change no longer exists.')
    if (change.status !== 'to-validate' || world.pendingId !== change.id) {
      return errorResponse(409, 'conflict', 'This change is no longer waiting for validation. Reload the editor.')
    }
    const t = now()
    world.pendingId = null
    if (decision === 'validate') {
      change.status = 'validated'
      change.validatedAt = iso(t)
      change.validatedBy = req.user
      change.commit = `${t.toString(16)}0000000`.slice(0, 7)
      world.validated.push({
        changeId: change.id,
        commit: change.commit,
        title: `${change.targets.map((x) => x.label).join(', ')} — ${change.summary.map((s) => s.description).join('; ')}`,
        validatedBy: req.user.name,
        validatedAt: change.validatedAt,
        files: [...new Set(change.targets.flatMap((x) => ZONES[x.zone]?.files ?? []))],
      })
      pushEntry(change.page, {
        type: 'validated',
        changeId: change.id,
        at: iso(t),
        pendingTotal: MOCK_CONTENT_DRAFTS + world.validated.length,
      })
    } else {
      change.status = 'cancelled'
      pushEntry(change.page, { type: 'cancelled', changeId: change.id, at: iso(t) })
    }
    return { status: 200, json: snapshot(change) }
  }

  const handle: MockHandler = (req) => {
    const [, area, , action] = req.segments
    if (req.method === 'GET' && area === 'state') return getState(req)
    if (req.method === 'POST' && area === 'requests') return postRequest(req)
    if (area === 'jobs') {
      if (req.method === 'GET' && req.segments.length === 3) return getJob(req)
      if (req.method === 'POST' && action === 'answer') return postAnswer(req)
      if (req.method === 'POST' && action === 'stop') return postStop(req)
      if (req.method === 'GET' && action === 'shots') return errorResponse(404, 'not_found', 'The mock engine takes no screenshots.')
    }
    if (area === 'changes' && req.method === 'POST' && (action === 'validate' || action === 'cancel')) return decide(req, action)
    return errorResponse(404, 'not_found', 'Not found')
  }

  return {
    handle,
    get world() {
      return world
    },
    reset() {
      world = emptyWorld()
    },
  }
}

// Instance du serveur de dev : gardée sur globalThis pour survivre au rechargement à chaud du module.
const GLOBAL_KEY = Symbol.for('kz.admin.mock.editor')
const holder = globalThis as unknown as Record<symbol, EditorMock | undefined>
const instance: EditorMock = holder[GLOBAL_KEY] ?? (holder[GLOBAL_KEY] = createEditorMock())

/** Signature gardée pour mock/index.ts (auth-core). */
export const handleEditor: MockHandler = (request) => instance.handle(request)

/** Modifications IA validées en attente de Publish (E1 « Design »), pour le mock de publication (publish-ui). Copies. */
export function listValidatedDesignChanges(): PendingDesignItem[] {
  return structuredClone(instance.world.validated)
}

/** Retire des modifications validées (publication ou abandon simulés par publish-ui) ; sans liste : toutes. */
export function clearValidatedDesignChanges(changeIds?: readonly string[]): void {
  const w = instance.world
  w.validated = changeIds ? w.validated.filter((v) => !changeIds.includes(v.changeId)) : []
}
