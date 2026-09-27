import path from 'node:path'
import type { EditJob, JobStatus, StepKind, TextChange } from '../../../src/admin/core/contracts'
import { modelLabel } from '../../../src/admin/core/contracts'
import {
  accessKind,
  acceptsLongerText,
  addCall,
  buildPrompt,
  buildRetryPrompt,
  clientMessage,
  createAskTool,
  createTextTool,
  EMPTY_COST,
  editableFields,
  hardcodedOf,
  MEASURED_TEXTS,
  resolveTextFields,
  scopeOf,
  systemAppend,
  toolAccessFor,
  totalCost,
  toUsage,
  type AskedQuestions,
  type CostState,
  type Hardcoded,
  type PromptTexts,
  type ResolvedAnswer,
  type TextField,
} from '../claude'
import { TextStoreError } from '../content/texts'
import { gitAuthor } from '../git/git'
import {
  CHECK_LABELS,
  contractCheckId,
  describeMeasures,
  lineSummary,
  lintChanges,
  lintContextFor,
  loadDesignSystem as loadDs,
  outOfScope,
  publicChecks,
  retryProblems,
  runRenderChecks,
  runStaticChecks,
  type CoverWarning,
  type DesignSystem,
  type RawCheck,
  type ToolAccess,
  type VisualSession,
} from '../guards'
import type { StoredJob, TextSnapshot, WrittenText } from '../store/store'
import { zoneLabel } from './request'
import { listPages as listSitePages, typecheck as siteTypecheck } from './site'
import { describeChanges } from './summary'
import { FAILED_MESSAGE, STOPPED_MESSAGE, type EditorDeps } from './types'

/**
 * Cycle d'une demande (porté de `job.ts > runEdit` du POC, câblé sur engine-guards et engine-claude) :
 *  1. design system relu dans le clone ; copie de travail nettoyée ; tête de draft notée ;
 *  2. textes Sanity de la demande résolus, lus, et textsBefore ENREGISTRÉ avant toute écriture (piège 7) ;
 *  3. captures d'avant (aperçu), outils de Claude (set_text, measure, ask_client) ; périmètre des outils AVEC le contexte
 *     du lint (`toolAccess.lint`, SEC-07 : chaque Edit jugé avant l'écriture) ; domaines du site en liste blanche des
 *     textes du client (SEC-08) ;
 *  4. au plus 2 essais (le 2e reprend la session avec les refus des contrôles) : contrôles statiques, puis du rendu
 *     seulement s'ils passent, une fois l'aperçu à jour ;
 *  5. tout passe → commit sur draft au nom du client, captures, statut `done` ; sinon retour arrière COMPLET (fichiers
 *     et textes) et `failed` / `stopped` / `rejected`.
 * Coût : cumul de la demande par `addCall` (jamais deux résultats d'une même session additionnés), plafond du cumul
 * vérifié avant le 2e essai et passé au SDK comme budget restant.
 */

export const MAX_ATTEMPTS = 2

/** Réponse de measure à Claude quand la copie de travail ne passe pas le contrôle statique (SEC-07). */
export const MEASURE_BLOCKED = 'Measure refused: fix the reported violations first.'

export type RunContext = {
  deps: EditorDeps
  jobId: string
  signal: AbortSignal
  /** Raison d'un arrêt (Stop, question sans réponse, arrêt du moteur). */
  stopReason: () => 'stop' | 'timeout' | 'shutdown' | null
  /** Montre les questions au client (statut waiting) et attend la réponse ; rejette sur Stop ou délai. */
  waitForAnswers: (asked: AskedQuestions) => Promise<ResolvedAnswer[]>
}

const clip = (text: string, max = 300) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const timeoutMessage = (ms: number) => `No answer for ${Math.max(1, Math.round(ms / 60_000))} minutes — stopped, nothing was changed.`

/** Message final au client suivi de l'avertissement du texte recouvert, sur un paragraphe à part. */
const withWarning = (message: string, warning: CoverWarning | null) =>
  warning?.client ? [message, warning.client].filter(Boolean).join('\n\n') : message

function commitMessage(ds: DesignSystem, job: EditJob): string {
  const targets = [...new Set(job.request.targets.map((target) => zoneLabel(ds, target.zone)))].join(', ')
  const note = job.request.note.replace(/\s+/g, ' ').slice(0, 100)
  return `[ai-editor] ${targets}: ${note}\n\nRequest ${job.id} · change ${job.changeId} · ${job.kind}`
}

/** Libellé anglais d'un contrôle interne (les libellés du POC sont en français : ils ne vont pas au client). */
const checkLabel = (check: RawCheck) => {
  const id = contractCheckId(check.id)
  return id ? CHECK_LABELS[id] : 'Automatic check'
}

export async function runEditJob(ctx: RunContext): Promise<void> {
  const { deps, jobId, signal } = ctx
  const { store, repo, texts: textStore } = deps
  const log = deps.log ?? ((line: string) => console.error(line))
  const now = () => (deps.now?.() ?? new Date()).toISOString()
  const started = Date.now()
  const patch = (change: (stored: StoredJob) => void) => store.updateJob(jobId, change)
  const step = (kind: StepKind, label: string, detail?: string) => {
    patch((stored) => {
      stored.job.steps.push({ at: now(), kind, label: clip(label), ...(detail ? { detail: clip(detail, 600) } : {}) })
    }).catch((error) => log(`[engine] step not saved: ${errorText(error)}`))
  }

  const job = store.job(jobId)!.job
  const request = job.request
  const scope = scopeOf(request.scope)
  const settings = deps.settings
  let cost: CostState = EMPTY_COST
  let session: VisualSession | null = null
  let snapshot: TextSnapshot = {}
  let dirty = false
  const written: Record<string, WrittenText> = {}
  const hardcoded: Hardcoded[] = []
  const resolved: ResolvedAnswer[] = []
  // SEC-08 : seules adresses gardées dans ce que lit le client (questions, message final, journal de Claude).
  const allowedDomains = [...(deps.siteDomains ?? [])]
  const toClient = (text: string) => clientMessage(text, allowedDomains)

  const finish = async (status: JobStatus, data: Partial<EditJob> = {}) => {
    const usage =
      cost.turns > 0 || cost.banked.cost > 0 || cost.session.cost > 0
        ? toUsage(cost, { model: settings.model, access: accessKind(deps.access.ok ? deps.access.access : null), durationMs: Date.now() - started })
        : undefined
    await patch((stored) => {
      Object.assign(stored.job, data)
      stored.job.status = status
      stored.job.finishedAt = now()
      delete stored.job.question
      if (usage) stored.job.usage = usage
      stored.internal.textsDirty = dirty
      stored.internal.written = { ...written }
      stored.internal.sessionId = cost.sessionId
    })
  }

  // Retour arrière complet : fichiers du clone ET textes Sanity écrits par CETTE demande, remis comme avant.
  const rollback = async () => {
    await repo.discardWorkingChanges()
    if (!dirty) return
    const only: Record<string, string[]> = {}
    for (const entry of Object.values(written)) (only[entry.document] ??= []).push(entry.path)
    // Écriture entamée mais pas confirmée : on restaure tous les champs de l'instantané.
    const paths = Object.keys(only).length ? only : undefined
    try {
      await textStore.restore(snapshot, paths)
      dirty = false
      for (const key of Object.keys(written)) delete written[key]
    } catch (error) {
      step('error', 'The draft texts could not be restored: they will be restored at the next engine start.', errorText(error))
      await patch((stored) => void (stored.internal.restoreFailed = true))
      throw error
    }
  }

  try {
    await patch((stored) => {
      stored.job.status = 'running'
      stored.job.startedAt = now()
    })
    if (!deps.access.ok) {
      step('error', 'No Claude access is configured on the engine.', deps.access.error)
      return await finish('failed', { error: FAILED_MESSAGE })
    }
    const access = deps.access.access
    if (deps.fakeClaude) step('warn', `FAKE Claude (${deps.fakeClaude}): scripted local test, no real call.`)
    else step('info', `Claude ${modelLabel(settings.model)} takes the request${access.kind === 'subscription' ? ' (local test, subscription)' : ''}.`)

    let ds: DesignSystem
    try {
      ds = await (deps.loadDesignSystem ?? loadDs)(repo.dir)
      for (const target of request.targets) if (!Object.hasOwn(ds.zones, target.zone)) throw new Error(`Unknown zone: ${target.zone}`)
    } catch (error) {
      step('error', 'The editor configuration of this site is invalid.', errorText(error))
      return await finish('failed', { error: FAILED_MESSAGE })
    }

    if (!(await repo.isClean())) {
      step('warn', 'The draft had unsaved changes: they were removed.')
      await repo.discardWorkingChanges()
    }
    const headBefore = await repo.head()
    await patch((stored) => void (stored.internal.headBefore = headBefore))

    // ─── Textes Sanity : champs, instantané AVANT toute écriture ─────────────
    const fields: TextField[] = []
    const closed: string[] = []
    const textZones = new Map<string, string>()
    for (const target of request.targets) {
      const binding = ds.zones[target.zone].text
      if (binding?.source !== 'sanity') continue
      const resolvedFields = resolveTextFields(binding, { doc: target.doc, key: target.key })
      if (!resolvedFields.ok) {
        if (!scope.text) continue
        step('error', resolvedFields.error)
        return await finish('failed', { error: FAILED_MESSAGE })
      }
      closed.push(...resolvedFields.target.closed.filter((id) => !closed.includes(id)))
      for (const field of editableFields(resolvedFields.target, scope)) {
        if (fields.some((known) => known.id === field.id)) continue
        fields.push(field)
        textZones.set(field.id, target.zone)
      }
    }
    let promptTexts: PromptTexts | null = null
    let before: Record<string, string> = {}
    if (fields.length) {
      if (!textStore.available) {
        step('error', 'Text changes need the Sanity write token on the engine.')
        return await finish('failed', { error: FAILED_MESSAGE })
      }
      const byDocument = new Map<string, { document: string; type: string; paths: string[] }>()
      for (const field of fields) {
        const entry = byDocument.get(field.document) ?? { document: field.document, type: field.type, paths: [] }
        entry.paths.push(field.path)
        byDocument.set(field.document, entry)
      }
      try {
        const read = await textStore.snapshot([...byDocument.values()])
        snapshot = read.snapshot
        before = read.current
        promptTexts = { fields, current: before, others: read.others, closed }
      } catch (error) {
        step('error', error instanceof TextStoreError ? error.message : 'The texts of this element could not be read from Sanity.', errorText(error))
        return await finish('failed', { error: FAILED_MESSAGE })
      }
      // textsBefore enregistré AVANT la première écriture (reprise après un crash : piège 7 du POC).
      await patch((stored) => void (stored.internal.texts = snapshot))
    }
    const zones = request.targets.map((target) => target.zone)
    /**
     * SEC-07 : le hook juge le fichier FUTUR de chaque Edit avec ce contexte, AVANT l'écriture (rien d'interdit n'atteint
     * le disque, donc ni next dev ni la mesure). Même contexte que `runStaticChecks` et `violationsNow` ; `hardcoded` est
     * le tableau VIVANT de la demande (les valeurs accordées par le client pendant l'essai y entrent aussitôt).
     */
    const lint = lintContextFor({ ds, scope, zones, hardcoded })
    const toolAccess: ToolAccess = { ...toolAccessFor(ds.zones, { scope, targets: request.targets }, fields.length), lint }

    const textTool = fields.length
      ? createTextTool({
          target: { fields, closed },
          fields,
          scope,
          before,
          write: async ({ field, value }) => {
            if (!dirty) {
              dirty = true
              await patch((stored) => void (stored.internal.textsDirty = true))
            }
            await textStore.write({ document: field.document, type: field.type, path: field.path, value })
            written[field.id] = { document: field.document, path: field.path, value }
            await patch((stored) => void (stored.internal.written = { ...written }))
          },
          onEvent: (event) => step(event.kind, event.text),
        })
      : undefined

    const askTool = createAskTool({
      allowedDomains,
      waitForAnswers: async (asked) => {
        const answers = await ctx.waitForAnswers(asked)
        resolved.push(...answers)
        hardcoded.push(...hardcodedOf(answers))
        return answers
      },
      onEvent: (event) => step(event.kind, event.text),
      ...(deps.now ? { now: deps.now } : {}),
    })

    // Stop reçu avant le lancement de Claude : rien n'a été écrit.
    if (signal.aborted) return await finish('stopped', { error: STOPPED_MESSAGE })

    // ─── Captures d'avant ─────────────────────────────────────────────────────
    const first = request.targets[0]
    step('info', `Capturing the page ${request.page} before the change (375, 768 and 1280 px)…`)
    try {
      session = await deps.preview.open(request.page, first.zone, first.index)
    } catch (error) {
      step('error', 'The draft preview could not be captured.', errorText(error))
      return await finish('failed', { error: FAILED_MESSAGE })
    }
    const visual = session
    const writtenValues = () => Object.values(written).map((entry) => entry.value)
    /**
     * SEC-07 : l'aperçu ne rend un fichier modifié qu'après un contrôle statique vert. Avant de faire rafraîchir
     * l'aperçu (measure, attente du signal), la copie de travail repasse le périmètre et le lint CSS/TSX : une
     * violation → rien n'est demandé à next dev, Claude reçoit la liste (anglais).
     */
    const violationsNow = async (): Promise<string[]> => {
      const changes = await repo.changes()
      if (!changes.length) return []
      const outside = outOfScope(changes.map((change) => change.file), toolAccess.files).map((file) => `${file}: outside the files you may edit.`)
      const { violations } = lintChanges(changes, lint)
      return [...outside, ...violations.map((violation) => `${violation.file}: ${violation.message}`)]
    }
    /** Attend l'aperçu à jour, seulement si la copie de travail passe le contrôle statique (sinon : `blocked`). */
    const waitFreshChecked = async (texts: readonly string[]): Promise<{ blocked: string[] } | { fresh: boolean }> => {
      const blocked = await violationsNow()
      if (blocked.length) return { blocked }
      return { fresh: await deps.signal.waitFresh(request.page, texts) }
    }
    const measureTool = {
      measure: async () => {
        const wait = await waitFreshChecked(writtenValues())
        if ('blocked' in wait) {
          step('warn', 'Measure refused: the changed files do not pass the automatic checks yet.')
          return `${MEASURE_BLOCKED} The draft preview was not refreshed.\n${wait.blocked.slice(0, 8).map((line) => `- ${line}`).join('\n')}`
        }
        if (!wait.fresh) step('warn', 'The draft preview is slow to update: the measure may be outdated.')
        const measures = await visual.measure()
        step('measure', `Measure: ${lineSummary(measures)}`)
        return `Rendering measured in the draft preview. ${MEASURED_TEXTS}\n${describeMeasures(measures)}`
      },
    }
    if (signal.aborted) return await finish('stopped', { error: STOPPED_MESSAGE })
    // Pages publiques citables : un échec de lecture est journalisé (mineur #76 du POC), la demande continue sans liste.
    const pages = await (deps.listPages ?? listSitePages)(repo.dir).catch((error: unknown) => {
      log(`[engine] request ${jobId}: site pages not listed: ${errorText(error)}`)
      step('warn', 'The list of the site pages could not be read: Claude works without it.', errorText(error))
      return [] as string[]
    })
    const system = systemAppend(ds)
    const firstZone = ds.zones[first.zone]
    const otherZones = [...new Set(request.targets.map((target) => target.zone))].filter((zone) => zone !== first.zone)

    // ─── Essais ───────────────────────────────────────────────────────────────
    let problems: string[] = []
    let sessionId: string | null = null
    let message = ''
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await patch((stored) => void (stored.job.attempts = attempt))
      if (attempt > 1) step('retry', 'Second attempt with the feedback of the automatic checks.')
      const resumed = sessionId
      const remaining = deps.maxRequestUsd - totalCost(cost)
      const result = await deps.runAgent(
        {
          prompt:
            attempt === 1
              ? buildPrompt(ds, request, promptTexts, { before: visual.before, pages, pageTexts: visual.pageTexts })
              : buildRetryPrompt(problems),
          cwd: repo.dir,
          toolAccess,
          textTool,
          measureTool,
          askTool,
          systemAppend: system,
          access,
          allowedDomains,
          ...(resumed ? { resume: resumed } : {}),
          signal,
          onEvent: (event) => step(event.kind, event.label, event.detail),
        },
        { maxBudgetUsd: Math.max(0.01, Math.min(settings.maxBudgetUsd, remaining)) },
      )
      // Même session reprise : son total inclut déjà l'essai précédent (addCall ne l'additionne pas deux fois).
      cost = addCall(cost, result, resumed)
      sessionId = result.sessionId ?? sessionId
      await patch((stored) => void (stored.internal.sessionId = sessionId))
      if (result.message) message = result.message

      if (signal.aborted) {
        await rollback()
        const reason = ctx.stopReason()
        const text = reason === 'timeout' ? timeoutMessage(settings.questionTimeoutMs) : STOPPED_MESSAGE
        step('warn', text)
        return await finish('stopped', { error: text, ...(message ? { message: toClient(message) } : {}) })
      }
      if (!result.ok) {
        await rollback()
        step('error', result.error ?? 'Claude could not finish.')
        return await finish('failed', { error: FAILED_MESSAGE, ...(message ? { message: toClient(message) } : {}) })
      }

      const files = await repo.changedFiles()
      const proposed = textTool?.proposed ?? {}
      const changedTexts: TextChange[] = fields
        .filter((field) => Object.hasOwn(proposed, field.id) && proposed[field.id] !== before[field.id])
        .map((field) => ({ document: field.document, path: field.path, before: before[field.id] ?? '', after: proposed[field.id] }))

      if (!files.length && !changedTexts.length) {
        // Un texte réécrit à l'identique a pu créer un brouillon : on remet tout comme avant.
        await rollback()
        step('info', 'Claude changed nothing.')
        return await finish('rejected', { message: toClient(message) })
      }

      const total = files.length + changedTexts.length
      step('check', `Automatic checks on ${total} change${total > 1 ? 's' : ''}…`)
      const changes = await repo.changes()
      const statics = await runStaticChecks({
        ds,
        scope: request.scope,
        zones,
        access: toolAccess,
        changes,
        hardcoded,
        texts: changedTexts.length,
        typecheck: () => (deps.typecheck ?? siteTypecheck)(repo.dir),
      })
      let render: Awaited<ReturnType<typeof runRenderChecks>> | null = null
      if (statics.ok) {
        // Aperçu à jour (CSS recompilé, brouillon Sanity visible) AVANT de relever le rendu : jamais un délai fixe.
        // Contrôle statique revérifié juste avant (SEC-07) : rien ne doit avoir bougé depuis runStaticChecks.
        const wait = await waitFreshChecked(changedTexts.map((text) => text.after))
        if ('blocked' in wait) {
          await rollback()
          step('error', 'The changed files no longer pass the automatic checks.', wait.blocked.join(' | '))
          return await finish('failed', { error: FAILED_MESSAGE })
        }
        if (!wait.fresh) {
          await rollback()
          step('error', 'The draft preview did not show the change in time.')
          return await finish('failed', { error: FAILED_MESSAGE })
        }
        render = await runRenderChecks({
          session: visual,
          logotype: !!firstZone.logotype,
          acceptsLongerText: acceptsLongerText(resolved),
          alsoChanged: otherZones,
        })
      }
      const raw = [...statics.checks, ...(render?.checks ?? [])]
      const warning = render?.warning ?? null

      if (statics.ok && render?.ok) {
        if (warning?.step) step('warn', warning.step)
        let commit: string | undefined
        if (files.length) {
          commit = await repo.commitAll(commitMessage(ds, store.job(jobId)!.job), gitAuthor(job.requestedBy))
          await patch((stored) => void (stored.internal.commit = commit))
        }
        await visual.saveShots(path.join(deps.shotsDir, jobId)).catch((error) => step('warn', 'The before/after screenshots could not be saved.', errorText(error)))
        const summary = describeChanges({ ds, zones: request.targets.map((target) => target.zone), files: changes, texts: changedTexts, textZones })
        step('check', `Checks: ${publicChecks(raw, warning).map((check) => `${check.label} ${check.ok ? '✓' : '✕'}`).join(' · ')}`)
        return await finish('done', {
          message: withWarning(toClient(message), warning),
          summary,
          checks: publicChecks(raw, warning),
          texts: changedTexts,
          // Valeurs en dur réellement écrites (accordées par le client) : signalées à Kuartz.
          hardcoded: statics.granted,
        })
      }

      for (const check of raw.filter((candidate) => !candidate.ok)) step('warn', `${checkLabel(check)}: not passed.`)
      problems = retryProblems(raw)
      const overBudget = totalCost(cost) >= deps.maxRequestUsd
      if (attempt >= MAX_ATTEMPTS || result.fatal || overBudget) {
        await rollback()
        if (overBudget && attempt < MAX_ATTEMPTS) step('warn', 'The budget of this change is used up: no second attempt.')
        step('error', 'Change removed: the automatic checks still fail.')
        return await finish('failed', { error: FAILED_MESSAGE, checks: publicChecks(raw, warning), ...(message ? { message: toClient(message) } : {}) })
      }
    }
  } catch (error) {
    log(`[engine] request ${jobId} failed: ${errorText(error)}`)
    await rollback().catch(() => {})
    step('error', 'Internal error of the AI engine.', errorText(error))
    await finish('failed', { error: FAILED_MESSAGE }).catch((finishError) => log(`[engine] could not save request ${jobId}: ${errorText(finishError)}`))
  } finally {
    await session?.close().catch(() => {})
  }
}
