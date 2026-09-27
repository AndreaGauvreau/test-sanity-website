import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  EditJob,
  EditorState,
  EngineUser,
  PendingChange,
  PendingDesignItem,
  Usage,
} from '../../../src/admin/core/contracts'
import { modelLabel, sumUsage } from '../../../src/admin/core/contracts'
import { parseAnswers, type AskedQuestions, type ResolvedAnswer } from '../claude'
import { gitAuthor } from '../git/git'
import { loadDesignSystem as loadDs } from '../guards'
import { awaitingValidation, badRequest, busy, conflict, EngineError, notFound, publishing, unavailable } from '../server/errors'
import type { StoredChange, StoredJob, TextSnapshot, WrittenText } from '../store/store'
import type { EditorGate } from './lock'
import { checkRequestAgainst, ID_PATTERN, isPagePath, parseRequestShape, zoneLabel } from './request'
import { runEditJob, timeoutMessage } from './run'
import { mergeSummary } from './summary'
import { INTERRUPTED_MESSAGE, STOPPED_MESSAGE, type EditorDeps } from './types'

/**
 * Service de l'éditeur IA : la file (UNE demande à la fois, toutes personnes confondues), la modification en attente
 * (une demande + ses ajustements), les réponses aux questions, Stop, ✓ Validate (un seul commit), Cancel (retour
 * arrière de la demande ET de ses ajustements), l'état de l'éditeur, et la reprise après un redémarrage.
 *
 * Toute opération qui démarre ou clôt une modification passe par `serial` (une à la fois) ; les refus 409 sont décidés
 * de façon synchrone juste avant d'inscrire la demande (pas d'`await` entre la vérification et l'inscription).
 */

export type EditorService = EditorGate & {
  /** État de l'éditeur pour `user` (l'URL de l'aperçu porte un jeton court émis pour lui). */
  state(page: string, user: EngineUser): Promise<EditorState>
  request(user: EngineUser, body: unknown): Promise<EditJob>
  job(id: string): EditJob
  answer(user: EngineUser, id: string, body: unknown): Promise<EditJob>
  stop(user: EngineUser, id: string): Promise<EditJob>
  validate(user: EngineUser, changeId: string): Promise<PendingChange>
  cancel(user: EngineUser, changeId: string): Promise<PendingChange>
  /** Capture PNG d'une demande (nom `^\d{3,4}-(before|after)\.png$`). */
  shot(jobId: string, file: string): Promise<Buffer>
  /** Au démarrage : demandes interrompues → failed, fichiers ET textes restaurés. */
  recover(): Promise<void>
  /** Arrêt du moteur : demande en cours arrêtée et remise en état. */
  shutdown(timeoutMs?: number): Promise<void>
  /** Modifications validées à publier (engine-publish, E1 « design »). */
  validatedDesign(): Promise<PendingDesignItem[]>
  /** Fin d'une demande (tests : attendre que la file se vide). */
  idle(): Promise<void>
}

export const SHOT_NAME = /^\d{3,4}-(before|after)\.png$/
/** Attente de la remise en état après Stop avant de répondre : sous le délai de 15 s du relais de l'admin. */
const STOP_WAIT_MS = 10_000

class QuestionTimeout extends Error {}

type Live = {
  abort: AbortController
  reason: 'stop' | 'timeout' | 'shutdown' | null
  done: Promise<void>
  pending?: { asked: AskedQuestions; resolve: (answers: ResolvedAnswer[]) => void }
}

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${randomBytes(5).toString('hex')}`

export function createEditorService(deps: EditorDeps): EditorService {
  const { store, repo } = deps
  const log = deps.log ?? ((line: string) => console.error(line))
  const now = () => (deps.now?.() ?? new Date()).toISOString()
  const live = new Map<string, Live>()
  const queue: string[] = []
  let running: string | null = null
  let idleWaiters: (() => void)[] = []
  let chain: Promise<unknown> = Promise.resolve()
  /** Écritures du journal de consommation en cours (tâches de fond suivies : `idle` et `shutdown` les attendent). */
  const journal = new Set<Promise<void>>()

  /** Opérations qui démarrent ou clôtent une modification : une à la fois. */
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = chain.then(task, task)
    chain = next.catch(() => {})
    return next
  }

  const blocker: EditorGate['blocker'] = () => {
    if (running || queue.length || store.activeJobs().length) return 'busy'
    if (store.openChange()) return 'awaiting_validation'
    return null
  }

  /** Refus d'une nouvelle demande (ou d'un ajustement de `changeId`), synchrones. Renvoie la modification ajustée. */
  function assertCanStart(changeId?: string): StoredChange | null {
    if (deps.lock.isPublishing()) throw publishing()
    if (running || queue.length || store.activeJobs().length) throw busy()
    const open = store.openChange()
    if (!changeId) {
      if (open) throw awaitingValidation()
      return null
    }
    if (!open || open.change.id !== changeId) {
      if (store.change(changeId)) throw conflict('This change can no longer be adjusted.')
      throw notFound('This change no longer exists.')
    }
    if (open.change.status !== 'to-validate') throw busy()
    return open
  }

  /**
   * La demande en cours a déjà son statut final (done, failed…) mais sa fin n'est pas encore inscrite (modification
   * passée en to-validate, `running` libéré) : on attend cette fin, brève (le journal de consommation n'en fait plus
   * partie), plutôt que de répondre 409 busy à un Validate / Cancel / ajustement envoyé dès que l'admin voit `done`.
   */
  async function settleFinished() {
    if (!running) return
    const stored = store.job(running)
    if (stored && ['queued', 'running', 'waiting'].includes(stored.job.status)) return
    await live.get(running)?.done
  }

  const jobOf = (id: string): StoredJob => {
    const stored = ID_PATTERN.test(id) ? store.job(id) : null
    if (!stored) throw notFound('This request no longer exists.')
    return stored
  }

  // ─── File ──────────────────────────────────────────────────────────────────

  function pump() {
    if (running) return
    const id = queue.shift()
    if (!id) {
      const waiters = idleWaiters
      idleWaiters = []
      for (const resolve of waiters) resolve()
      return
    }
    running = id
    const entry: Live = { abort: new AbortController(), reason: null, done: Promise.resolve() }
    live.set(id, entry)
    entry.done = (async () => {
      try {
        await runEditJob({
          deps,
          jobId: id,
          signal: entry.abort.signal,
          stopReason: () => entry.reason,
          waitForAnswers: (asked) => waitForAnswers(id, entry, asked),
        })
        await afterJob(id)
      } catch (error) {
        log(`[engine] request ${id} crashed: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        live.delete(id)
        running = null
        setImmediate(pump)
      }
    })()
  }

  function waitForAnswers(id: string, entry: Live, asked: AskedQuestions): Promise<ResolvedAnswer[]> {
    const timeoutMs = deps.settings.questionTimeoutMs
    return new Promise((resolve, reject) => {
      if (entry.abort.signal.aborted) return reject(new Error('Stopped.'))
      const cleanup = () => {
        clearTimeout(timer)
        entry.abort.signal.removeEventListener('abort', onAbort)
        entry.pending = undefined
      }
      const onAbort = () => {
        cleanup()
        reject(new Error('Stopped while waiting for the client’s answer.'))
      }
      const timer = setTimeout(() => {
        cleanup()
        entry.reason = 'timeout'
        reject(new QuestionTimeout('No answer in time.'))
        entry.abort.abort()
      }, timeoutMs)
      timer.unref?.()
      entry.abort.signal.addEventListener('abort', onAbort, { once: true })
      entry.pending = {
        asked,
        resolve: (answers) => {
          cleanup()
          resolve(answers)
        },
      }
      const expiresAt = new Date(Date.parse(asked.askedAt) + timeoutMs).toISOString()
      store
        .updateJob(id, (stored) => {
          stored.job.status = 'waiting'
          stored.job.question = { questions: asked.questions, askedAt: asked.askedAt, expiresAt }
          stored.internal.asked = asked
        })
        .catch((error) => log(`[engine] question not saved: ${error instanceof Error ? error.message : String(error)}`))
    })
  }

  // ─── Fin d'une demande : la modification en attente suit ──────────────────

  const usageOf = (jobIds: readonly string[]): Usage | undefined =>
    sumUsage(jobIds.map((id) => store.job(id)?.job.usage).filter((usage): usage is Usage => !!usage)) ?? undefined

  async function afterJob(id: string) {
    const stored = store.job(id)
    if (!stored) return
    const { job, internal } = stored
    const change = store.change(job.changeId)
    if (change) {
      await store.updateChange(job.changeId, (entry) => {
        if (job.status === 'done') {
          entry.change.status = 'to-validate'
          if (internal.commit) entry.internal.commits.push(internal.commit)
          // État FINAL : la ligne d'un ajustement remplace celle de la même propriété du même élément.
          entry.change.summary = mergeSummary(entry.change.summary, job.summary)
          entry.change.checks = job.checks
        } else if (job.kind === 'request') {
          // La demande n'a rien appliqué : il n'y a pas de modification à valider.
          entry.change.status = 'cancelled'
        } else {
          // Ajustement sans effet : la modification reste comme avant lui.
          entry.change.status = 'to-validate'
        }
        const usage = usageOf(entry.change.jobIds)
        if (usage) entry.change.usage = usage
      })
    }
    // Toute demande terminée passe au journal (sans `usage` : Claude n'a pas été appelé). En tâche de fond SUIVIE : la
    // demande est libérée sans attendre l'écriture dans Sanity (sinon ~1 s de 409 busy après done) ; une erreur est
    // journalisée (le journal de secours du module usage garde l'entrée, rien n'est perdu).
    recordUsage(id, job.changeId)
  }

  function recordUsage(id: string, changeId: string) {
    const recorder = deps.usage
    if (!recorder) return
    // Faux Claude (ENGINE_FAKE_CLAUDE, mode local) : aucun appel, rien de consommé → AUCUN document aiUsage. Son coût
    // simulé reste dans la demande (fil de l'éditeur, marqué « Fake Claude ») mais ne fausse jamais B5, B1 ni Ask AI.
    if (deps.fakeClaude) {
      if (store.job(id)?.job.usage) log(`[engine] usage not recorded for ${id}: fake Claude (${deps.fakeClaude}), no real call`)
      return
    }
    // Copie figée : la modification peut être validée pendant l'écriture.
    const input = structuredClone({ job: store.job(id)!.job, change: store.change(changeId)?.change ?? null })
    const task: Promise<void> = Promise.resolve()
      .then(() => recorder.record(input))
      .catch((error) => log(`[engine] usage not recorded for ${id}: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => void journal.delete(task))
    journal.add(task)
  }

  const journalDone = async () => {
    while (journal.size) await Promise.all([...journal])
  }

  // ─── Textes d'une modification (Cancel) ───────────────────────────────────

  /** Instantané le plus ancien par champ écrit, et dernière valeur écrite, sur les demandes réussies d'une modification. */
  function changeTexts(change: StoredChange) {
    const snapshot: TextSnapshot = {}
    const last: Record<string, WrittenText> = {}
    for (const jobId of change.change.jobIds) {
      const stored = store.job(jobId)
      if (!stored || stored.job.status !== 'done' || !stored.internal.texts) continue
      for (const [key, entry] of Object.entries(stored.internal.written ?? {})) {
        const doc = stored.internal.texts[entry.document]
        if (!doc) continue
        const target = (snapshot[entry.document] ??= { id: doc.id, type: doc.type, draftExisted: doc.draftExisted, fields: {} })
        if (!Object.hasOwn(target.fields, entry.path) && Object.hasOwn(doc.fields, entry.path)) target.fields[entry.path] = doc.fields[entry.path]
        last[key] = entry
      }
    }
    const only: Record<string, string[]> = {}
    for (const [docId, doc] of Object.entries(snapshot)) only[docId] = Object.keys(doc.fields)
    return { snapshot, last, only }
  }

  /**
   * Remet les textes Sanity d'après l'instantané de chaque demande (champs écrits, sinon tous). Échec → `restoreFailed`
   * gardé : retenté avant toute nouvelle demande (qui est refusée tant qu'il reste un texte à remettre) et au démarrage.
   */
  async function restoreTexts(jobs: StoredJob[]): Promise<boolean> {
    let ok = true
    for (const stored of jobs) {
      const id = stored.job.id
      if (!stored.internal.texts) {
        await store.updateJob(id, (job) => void (job.internal.restoreFailed = false))
        continue
      }
      const only: Record<string, string[]> = {}
      for (const entry of Object.values(stored.internal.written ?? {})) (only[entry.document] ??= []).push(entry.path)
      try {
        if (!deps.texts.available) throw new Error('no Sanity write token')
        await deps.texts.restore(stored.internal.texts, Object.keys(only).length ? only : undefined)
        await store.updateJob(id, (job) => {
          job.internal.textsDirty = false
          job.internal.restoreFailed = false
        })
      } catch (error) {
        ok = false
        log(`[engine] texts of request ${id} could not be restored: ${error instanceof Error ? error.message : String(error)}`)
        await store.updateJob(id, (job) => void (job.internal.restoreFailed = true))
      }
    }
    return ok
  }

  // ─── API ───────────────────────────────────────────────────────────────────

  const service: EditorService = {
    blocker,

    async state(page, user) {
      if (!isPagePath(page)) throw badRequest('Invalid page.')
      const thread = store.thread(page)
      const usages = thread.flatMap((entry) => (entry.type === 'job' && entry.job.usage ? [entry.job.usage] : []))
      return {
        page,
        health: await deps.health(),
        preview: await deps.previewUrl(page, user),
        active: store.activeJobs()[0]?.job ?? null,
        pending: store.openChange()?.change ?? null,
        thread,
        conversationUsage: sumUsage(usages),
        model: deps.fakeClaude
          ? { id: deps.settings.model, label: `Fake Claude (${deps.fakeClaude}) — no real call` }
          : { id: deps.settings.model, label: modelLabel(deps.settings.model) },
      }
    },

    request: (user, body) =>
      serial(async () => {
        const shape = parseRequestShape(body)
        await settleFinished()
        assertCanStart(shape.changeId)
        // Un texte d'une demande précédente n'a pas pu être remis : on retente ; tant qu'il reste, rien ne démarre (une
        // nouvelle demande prendrait la valeur fausse pour « valeur d'avant »).
        const pendingRestores = Object.values(store.data().jobs).filter((stored) => stored.internal.restoreFailed)
        if (pendingRestores.length && !(await restoreTexts(pendingRestores))) {
          throw unavailable('A previous change could not be fully undone in Sanity yet. Try again in a moment, or ask Kuartz.')
        }
        if (!deps.access.ok) throw unavailable('The AI editor is unavailable: Claude access is not configured on the engine.')
        if (deps.previewReady && !deps.previewReady()) throw unavailable('The draft preview is not ready yet. Try again in a moment.')
        let request
        try {
          const ds = await (deps.loadDesignSystem ?? loadDs)(repo.dir)
          request = checkRequestAgainst(ds, shape)
          const sanityText =
            request.scope.includes('text') && request.targets.some((target) => ds.zones[target.zone].text?.source === 'sanity')
          if (sanityText && !deps.texts.available) {
            throw unavailable('Text changes are unavailable: the engine has no Sanity write token. Use “Style” only, or ask Kuartz.')
          }
        } catch (error) {
          if (error instanceof EngineError) throw error
          log(`[engine] design system: ${error instanceof Error ? error.message : String(error)}`)
          throw new EngineError(500, 'internal', 'The editor configuration of this site is invalid. Ask Kuartz.')
        }
        // Revérifié après l'attente (lecture du design system) : rien n'a pu s'intercaler.
        const adjusted = assertCanStart(shape.changeId)
        if (adjusted && adjusted.change.page !== request.page) throw badRequest('This change was made on another page: open that page to adjust it.')

        const at = now()
        const jobId = newId('job')
        const changeId = adjusted?.change.id ?? newId('chg')
        const job: EditJob = {
          id: jobId,
          changeId,
          kind: adjusted ? 'adjustment' : 'request',
          request: { ...request, ...(adjusted ? { changeId } : {}) },
          requestedBy: user,
          createdAt: at,
          status: 'queued',
          steps: [],
          summary: [],
          checks: [],
          texts: [],
          hardcoded: [],
          attempts: 0,
        }
        const headBefore = await repo.head().catch(() => null)
        // Revérifié une dernière fois, puis inscription SYNCHRONE en mémoire (le magasin applique tout de suite).
        assertCanStart(shape.changeId)
        const write = store.transact((data) => {
          data.jobs[jobId] = { job, internal: { headBefore } }
          if (adjusted) {
            const entry = data.changes[changeId]
            entry.change.status = 'working'
            entry.change.jobIds.push(jobId)
            entry.change.adjustments += 1
          } else {
            data.changes[changeId] = {
              change: {
                id: changeId,
                page: request.page,
                targets: request.targets,
                status: 'working',
                jobIds: [jobId],
                adjustments: 0,
                summary: [],
                checks: [],
                createdAt: at,
                createdBy: user,
              },
              internal: { baseCommit: headBefore ?? '', commits: [] },
            }
          }
        })
        queue.push(jobId)
        await write
        await store.appendThread(request.page, { type: 'job', jobId })
        setImmediate(pump)
        return store.job(jobId)!.job
      }),

    job: (id) => jobOf(id).job,

    async answer(_user, id, body) {
      const stored = jobOf(id)
      const entry = live.get(id)
      if (stored.job.status !== 'waiting' || !entry?.pending) throw conflict('This question is no longer waiting for an answer.')
      const parsed = parseAnswers(entry.pending.asked, body)
      if (!parsed.ok) throw badRequest(parsed.error)
      const pending = entry.pending
      await store.updateJob(id, (job) => {
        job.job.answers = [...(job.job.answers ?? []), ...parsed.answers]
        job.internal.resolved = [...(job.internal.resolved ?? []), ...parsed.resolved]
        delete job.job.question
        delete job.internal.asked
        job.job.status = 'running'
      })
      pending.resolve(parsed.resolved)
      return store.job(id)!.job
    },

    async stop(_user, id) {
      const stored = jobOf(id)
      if (stored.job.status === 'queued' && queue.includes(id)) {
        queue.splice(queue.indexOf(id), 1)
        await store.updateJob(id, (job) => {
          job.job.status = 'stopped'
          job.job.error = STOPPED_MESSAGE
          job.job.finishedAt = now()
        })
        await afterJob(id)
        setImmediate(pump)
        return store.job(id)!.job
      }
      const entry = live.get(id)
      if (entry && (stored.job.status === 'running' || stored.job.status === 'waiting' || stored.job.status === 'queued')) {
        entry.reason ??= 'stop'
        entry.abort.abort()
        // On attend la remise en état (quelques secondes au plus) pour renvoyer le statut final.
        await Promise.race([entry.done, new Promise((resolve) => setTimeout(resolve, STOP_WAIT_MS).unref?.())])
      }
      return store.job(id)!.job
    },

    validate: (user, changeId) =>
      serial(async () => {
        await settleFinished()
        const stored = ID_PATTERN.test(changeId) ? store.change(changeId) : null
        if (!stored) throw notFound('This change no longer exists.')
        if (stored.change.status === 'validated') return stored.change
        if (stored.change.status === 'working') throw busy()
        if (stored.change.status !== 'to-validate') throw conflict('This change can no longer be validated.')
        if (running || queue.length) throw busy()
        if (deps.lock.isPublishing()) throw publishing()
        let commit: string | undefined
        const { baseCommit, commits } = stored.internal
        if (commits.length) {
          if ((await repo.head()) !== commits.at(-1)) throw conflict('The draft has moved since this change: ask Kuartz to look at it.')
          if (!(await repo.isClean())) await repo.discardWorkingChanges()
          const targets = [...new Set(stored.change.targets.map((target) => target.label))].join(', ')
          const first = store.job(stored.change.jobIds[0])?.job.request.note.replace(/\s+/g, ' ').slice(0, 100) ?? ''
          const message =
            `[ai-editor] ${targets}: ${first}\n\n` +
            `Validated by ${user.name} (${user.role}). Change ${stored.change.id}: ${stored.change.adjustments + 1} request(s).`
          commit = (await repo.squashSince(baseCommit, message, gitAuthor(stored.change.createdBy))) ?? undefined
        }
        const at = now()
        await store.updateChange(changeId, (entry) => {
          entry.change.status = 'validated'
          entry.change.validatedAt = at
          entry.change.validatedBy = user
          if (commit) {
            entry.change.commit = commit
            entry.internal.commits = [commit]
          }
        })
        const pendingTotal = deps.pendingTotal ? await deps.pendingTotal().catch(() => store.validatedChanges().length) : store.validatedChanges().length
        await store.appendThread(stored.change.page, { type: 'validated', changeId, at, pendingTotal })
        return store.change(changeId)!.change
      }),

    cancel: (_user, changeId) =>
      serial(async () => {
        await settleFinished()
        const stored = ID_PATTERN.test(changeId) ? store.change(changeId) : null
        if (!stored) throw notFound('This change no longer exists.')
        if (stored.change.status === 'cancelled') return stored.change
        if (stored.change.status === 'working') throw new EngineError(409, 'busy', 'Claude is still working on this change: stop it first.')
        if (stored.change.status !== 'to-validate') throw conflict('This change can no longer be cancelled.')
        if (running || queue.length) throw busy()
        if (deps.lock.isPublishing()) throw publishing()

        const texts = changeTexts(stored)
        if (Object.keys(texts.last).length) {
          if (!deps.texts.available) throw unavailable('The texts of this change cannot be restored: the engine has no Sanity write token.')
          // Un texte retouché ailleurs depuis (formulaire de l'admin) : on ne l'écrase pas.
          // Valeur déjà remise (Cancel précédent interrompu) : acceptée.
          for (const entry of Object.values(texts.last)) {
            const current = (await deps.texts.read(entry.document, [entry.path]))[entry.path]
            const before = texts.snapshot[entry.document]?.fields[entry.path] ?? null
            if (current !== entry.value && current !== before) {
              throw conflict('A text of this change was edited elsewhere since: change it back there, or validate this change.')
            }
          }
        }
        const { baseCommit, commits } = stored.internal
        if (commits.length && (await repo.head()) !== commits.at(-1)) {
          throw conflict('The draft has moved since this change: ask Kuartz to look at it.')
        }
        // Textes d'abord (réseau, peut échouer : rien d'autre n'a bougé, Cancel se retente), puis les fichiers (local).
        if (Object.keys(texts.last).length) {
          try {
            await deps.texts.restore(texts.snapshot, texts.only)
          } catch (error) {
            log(`[engine] cancel ${changeId}: texts not restored: ${error instanceof Error ? error.message : String(error)}`)
            throw unavailable('The texts of this change could not be restored right now. Try Cancel again in a moment.')
          }
        }
        if (commits.length) {
          await repo.discardWorkingChanges()
          await repo.resetHard(baseCommit)
        }
        const at = now()
        await store.updateChange(changeId, (entry) => {
          entry.change.status = 'cancelled'
          entry.internal.commits = []
        })
        await store.appendThread(stored.change.page, { type: 'cancelled', changeId, at })
        return store.change(changeId)!.change
      }),

    async shot(jobId, file) {
      jobOf(jobId)
      if (!SHOT_NAME.test(file)) throw badRequest('Unknown screenshot.')
      try {
        return await readFile(path.join(deps.shotsDir, jobId, file))
      } catch {
        throw notFound('Screenshot not found.')
      }
    },

    async recover() {
      const data = store.data()
      const interrupted = Object.values(data.jobs).filter((stored) => ['queued', 'running', 'waiting'].includes(stored.job.status))
      await restoreTexts(interrupted.filter((stored) => stored.internal.textsDirty))
      await restoreTexts(Object.values(store.data().jobs).filter((stored) => stored.internal.restoreFailed))
      if (interrupted.length) {
        // Fichiers : un commit d'une demande inachevée est retiré, puis la copie de travail remise sur la tête.
        const oldest = interrupted.find((stored) => stored.internal.headBefore)?.internal.headBefore
        const head = await repo.head()
        if (oldest && head !== oldest && (await repo.isAncestor(oldest, head))) await repo.resetHard(oldest)
        await repo.discardWorkingChanges()
      }
      for (const stored of interrupted) {
        await store.updateJob(stored.job.id, (job) => {
          job.job.status = 'failed'
          job.job.error = INTERRUPTED_MESSAGE
          job.job.finishedAt = now()
          delete job.job.question
          job.job.steps.push({ at: now(), kind: 'error', label: INTERRUPTED_MESSAGE })
        })
        await afterJob(stored.job.id)
      }
      // Modification restée « working » sans demande active (arrêt entre la fin d'une demande et sa mise à jour).
      for (const entry of Object.values(store.data().changes)) {
        if (entry.change.status !== 'working') continue
        const anyDone = entry.change.jobIds.some((id) => store.job(id)?.job.status === 'done')
        await store.updateChange(entry.change.id, (change) => void (change.change.status = anyDone ? 'to-validate' : 'cancelled'))
      }
    },

    async shutdown(timeoutMs = 30_000) {
      for (const id of queue.splice(0)) {
        await store.updateJob(id, (job) => {
          job.job.status = 'stopped'
          job.job.error = STOPPED_MESSAGE
          job.job.finishedAt = now()
        })
        await afterJob(id)
      }
      if (running) {
        const entry = live.get(running)
        if (entry) {
          entry.reason = 'shutdown'
          entry.abort.abort()
          await Promise.race([entry.done, new Promise((resolve) => setTimeout(resolve, timeoutMs).unref?.())])
        }
      }
      await Promise.race([journalDone(), new Promise((resolve) => setTimeout(resolve, timeoutMs).unref?.())])
      await store.flush()
    },

    async validatedDesign() {
      const items: PendingDesignItem[] = []
      for (const stored of store.validatedChanges()) {
        if (!stored.change.commit) continue
        const change = stored.change
        // État FINAL après ajustements (un résumé ancien enregistré bout à bout est replié de la même façon).
        const final = mergeSummary([], change.summary)
        const targets = [...new Set(change.targets.map((target) => target.label))].join(', ')
        const described = final.length ? `${final[0].description}${final.length > 1 ? ` (+${final.length - 1} more)` : ''}` : ''
        items.push({
          changeId: change.id,
          commit: change.commit!,
          title: described ? `${targets} — ${described}` : targets,
          validatedBy: change.validatedBy?.name ?? '',
          validatedAt: change.validatedAt ?? '',
          files: await repo.commitFiles(change.commit!).catch(() => []),
        })
      }
      return items
    },

    async idle() {
      if (running || queue.length) await new Promise<void>((resolve) => idleWaiters.push(resolve))
      await journalDone()
    },
  }
  return service
}

export { timeoutMessage, zoneLabel }
