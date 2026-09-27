import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type {
  EngineUser,
  PendingDesignItem,
  Publication,
  PublishRun,
  PublishState,
  PublishStatus,
  PublishStep,
} from '../../../src/admin/core/contracts'
import { can } from '../../../src/admin/core/contracts'
import { discardDraft, draftIdOf, type SanityPort } from '../content/sanity'
import type { WorkRepo } from '../git/git'
import type { EngineLock } from '../jobs/lock'
import { ID_PATTERN } from '../jobs/request'
import { badRequest, conflict, forbidden, notFound, publishing, unavailable } from '../server/errors'
import type { EngineStore } from '../store/store'
import type { Catalog } from './catalog'
import { computePending, expectedMismatch, isPublishableId, pendingContent, pendingDesign, snapshotContent, type Pending } from './pending'
import { freshSteps, readExtra, readMarks, writeExtra, writeMarks, type ContentMarks, type RunInternal } from './state'
import {
  branches,
  checkDraftAhead,
  cleanLog,
  draftCommits,
  errorText,
  fastForwardMain,
  nextPublicationNumber,
  prepareClone,
  publishContent,
  pushPublication,
  revalidateSite,
  StepFailure,
  tagName,
  tagPublication,
  triggerDeployHook,
} from './steps'

/**
 * Publication (E1, G3) : état PARTAGÉ entre utilisateurs (magasin du moteur), liste de ce qui attend, et la mise en
 * ligne en 4 étapes, dans l'ordre :
 *   1. si du code attend : typecheck du clone D'ABORD (un code qui ne compile pas ne publie rien) ; puis contenu →
 *      Sanity en UNE requête de l'API Actions (brouillons publiés avec `ifDraftRevisionId`, dépublications et
 *      suppressions programmées depuis le CMS par POST /publish/stage) ;
 *   2. si du code a changé : main ← draft en avance rapide (update-ref, sans checkout ; typecheck refait seulement si
 *      draft a bougé depuis l'étape 1), tag publication-N, push si ENGINE_GIT_PUSH=1 ;
 *   3. hook de déploiement Vercel si configuré, sinon « local mode » explicite ;
 *   4. revalidation du cache du site (POST SITE_REVALIDATE_URL, en-tête x-kz-revalidate).
 *
 * NON ATOMIQUE entre Sanity et git : le contenu part d'abord. Chaque étape est persistée AVANT d'agir ; un échec laisse
 * l'état `failed` (message + journal) et `retry` reprend à l'étape en échec (les étapes faites ne sont pas refaites).
 * POST /publish rend la main tout de suite (la suite tourne en arrière-plan, l'admin interroge GET /publish/status) :
 * le relais de l'admin coupe à 30 s et le typecheck peut durer plusieurs minutes.
 *
 * Verrou partagé avec l'éditeur (engine-core) : jamais de publication pendant une demande IA ou tant qu'une
 * modification attend ✓ Validate ; jamais de demande pendant une publication.
 */

export type PublishDeps = {
  repo: WorkRepo
  store: EngineStore
  lock: EngineLock
  /** Modifications IA validées avec commit (service de l'éditeur). */
  validatedDesign: () => Promise<PendingDesignItem[]>
  /** Port Sanity du robot ; null sans jeton d'écriture (le contenu ne peut être ni listé ni publié). */
  sanity: SanityPort | null
  catalog: Catalog
  mode: 'local' | 'hosted'
  git: { push: boolean; sourceBranch: () => Promise<string | null> }
  deployHookUrl: string | null
  revalidate: { url: string | null; secret: string | null }
  /** Compilation du clone (`typecheck` de jobs/site.ts) : null si tout compile, sinon la sortie. */
  typecheck: (repoDir: string) => Promise<string | null>
  fetch?: typeof fetch
  now?: () => Date
  log?: (line: string) => void
  /** Durée de l'état « published » (« Published at 14:32 ») avant le retour à « idle ». */
  publishedWindowMs?: number
}

export type PublishService = {
  status(): Promise<PublishStatus>
  publish(user: EngineUser, body: unknown): Promise<PublishStatus>
  retry(user: EngineUser): Promise<PublishStatus>
  discard(user: EngineUser, body: unknown): Promise<PublishStatus>
  /** Dépublier / supprimer un élément de collection au prochain Publish (CMS C3/C4). */
  stage(user: EngineUser, body: unknown): Promise<PublishStatus>
  /** Annule une action programmée, ou libère un brouillon retenu après une dépublication. */
  unstage(user: EngineUser, body: unknown): Promise<PublishStatus>
  diff(user: EngineUser, changeId: string): Promise<{ diff: string }>
  /** N de « Validated — added to Publish (N changes) » (port de l'éditeur). */
  pendingTotal(): Promise<number>
  /** Au démarrage : publication interrompue → failed (reprise par retry) ; statuts réconciliés avec main. */
  recover(): Promise<void>
  /** Fin de la publication en arrière-plan (tests, arrêt). */
  idle(): Promise<void>
}

export const PUBLISHED_WINDOW_MS = 5 * 60_000
export const DIFF_MAX_CHARS = 400_000
export const INTERRUPTED_PUBLISH = 'Interrupted: the AI engine restarted during the publication. Retry to finish it.'

const EXPECTED = z.object({ expected: z.array(z.string().min(1).max(300)).max(1000) }).strict()
const DISCARD = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('content'), id: z.string().min(1).max(128) }).strict(),
  z.object({ kind: z.literal('design'), changeId: z.string().regex(ID_PATTERN) }).strict(),
])

const STAGE = z.object({ kind: z.enum(['unpublish', 'delete']), id: z.string().min(1).max(128) }).strict()
const UNSTAGE = z.object({ id: z.string().min(1).max(128) }).strict()

const newRunId = () => `pub_${Date.now().toString(36)}${randomBytes(5).toString('hex')}`

export function localModeNote(push: boolean): string {
  return push
    ? 'Local mode: code changes go to main in the engine’s clone and are pushed to the source repository. No deployment is started (VERCEL_DEPLOY_HOOK_URL is not set).'
    : 'Local mode: code changes stay in the engine’s clone (branch main, tag publication-N). No push, no deployment.'
}

export const NO_SANITY_NOTE = 'Content drafts are unavailable: the AI engine has no Sanity write token (SANITY_API_WRITE_TOKEN).'

export function createPublishService(deps: PublishDeps): PublishService {
  const { repo, store, lock } = deps
  const log = deps.log ?? ((line: string) => console.error(line))
  const now = () => deps.now?.() ?? new Date()
  const fetchImpl = deps.fetch ?? fetch
  const window = deps.publishedWindowMs ?? PUBLISHED_WINDOW_MS
  let running: Promise<void> = Promise.resolve()
  let inflight: Promise<Pending> | null = null

  const marks = (): ContentMarks => readMarks(store.publications.get())
  const pendingDeps = () => ({ sanity: deps.sanity, catalog: deps.catalog, repo, editorStore: store.editor, validatedDesign: deps.validatedDesign, marks })
  const updateMarks = (change: (marks: ContentMarks) => void) =>
    store.publications.update((data) => {
      const current = readMarks(data)
      change(current)
      writeMarks(data, current)
    })

  /** Liste fraîche (POST) ; `shared` réunit les lectures simultanées (plusieurs Top bars qui interrogent). */
  async function readPending(shared = false): Promise<Pending> {
    const compute = () =>
      computePending(pendingDeps()).catch((error: unknown) => {
        log(`[publish] pending list unavailable: ${errorText(error)}`)
        throw unavailable('Sanity can’t be reached right now: the list of changes is unavailable. Try again in a moment.')
      })
    if (!shared) return compute()
    inflight ??= compute().finally(() => void (inflight = null))
    return inflight
  }

  const internalRun = (): RunInternal | null => readExtra(store.publications.get()).run
  const saveInternal = (run: RunInternal | null) => store.publications.update((data) => writeExtra(data, { run }))

  function stateOf(run: PublishRun | null, total: number): PublishState {
    if (run && !run.finishedAt && !run.error) return 'publishing'
    if (run?.error) return 'failed'
    if (total > 0) return 'pending'
    if (run?.finishedAt && now().getTime() - Date.parse(run.finishedAt) < window) return 'published'
    return 'idle'
  }

  function deployInfo(): PublishStatus['deploy'] {
    const notes: string[] = []
    if (!deps.deployHookUrl) notes.push(localModeNote(deps.git.push))
    if (!deps.sanity) notes.push(NO_SANITY_NOTE)
    return { mode: deps.deployHookUrl ? 'vercel-hook' : 'local', ...(notes.length ? { note: notes.join(' ') } : {}) }
  }

  async function status(pending?: Pending): Promise<PublishStatus> {
    const list = pending ?? (await readPending(true))
    const data = store.publications.get()
    return {
      state: stateOf(data.run, list.total),
      pending: {
        content: list.content.map(({ rev: _rev, ...item }) => item),
        design: list.design,
        total: list.total,
        ...(list.lastValidatedAt ? { lastValidatedAt: list.lastValidatedAt } : {}),
      },
      ...(data.run ? { run: structuredClone(data.run) } : {}),
      ...(data.lastPublishedAt ? { lastPublishedAt: data.lastPublishedAt } : {}),
      deploy: deployInfo(),
    }
  }

  // ─── Statuts des modifications IA ─────────────────────────────────────────

  /** Documents Sanity écrits par une modification (ses demandes réussies). */
  function documentsOf(changeId: string): string[] {
    const stored = store.editor.change(changeId)
    if (!stored) return []
    const docs = new Set<string>()
    for (const jobId of stored.change.jobIds) for (const text of store.editor.job(jobId)?.job.texts ?? []) docs.add(text.document)
    return [...docs]
  }

  /**
   * Modifications IA validées SANS commit (textes seulement) : publiées (ou abandonnées) quand plus aucun de leurs
   * documents n'a de brouillon. Sans cela elles resteraient « validated » pour toujours (et bloqueraient `sync`).
   */
  async function settleTextChanges(ids: readonly string[], to: 'published' | 'discarded') {
    if (!deps.sanity) return
    for (const id of ids) {
      const stored = store.editor.change(id)
      if (!stored || stored.change.status !== 'validated' || stored.change.commit) continue
      const docs = documentsOf(id).filter(isPublishableId)
      const drafts = docs.length ? await deps.sanity.getDocuments(docs.map(draftIdOf)) : []
      if (drafts.some((doc) => doc !== null)) continue
      await store.editor.updateChange(id, (entry) => void (entry.change.status = to))
    }
  }

  const textOnlyValidated = () =>
    store.editor
      .validatedChanges()
      .filter((stored) => !stored.change.commit)
      .map((stored) => stored.change.id)

  /** Modifications validées dont le commit est désormais dans main → published. */
  async function settleDesignChanges(ids?: readonly string[]) {
    for (const stored of store.editor.validatedChanges()) {
      if (!stored.change.commit || (ids && !ids.includes(stored.change.id))) continue
      if (await repo.isAncestor(stored.change.commit, 'refs/heads/main')) {
        await store.editor.updateChange(stored.change.id, (entry) => void (entry.change.status = 'published'))
      }
    }
  }

  // ─── Déroulé ───────────────────────────────────────────────────────────────

  async function setStep(step: PublishStep, status: PublishRun['steps'][number]['status'], detail?: string) {
    await store.publications.update((data) => {
      if (!data.run) return
      data.run.step = step
      const entry = data.run.steps.find((item) => item.step === step)
      if (entry) {
        entry.status = status
        if (detail) entry.detail = detail
        else delete entry.detail
      }
    })
  }

  type Outcome = { status: 'done' | 'skipped'; detail?: string }

  /**
   * Typecheck du clone AVANT de publier quoi que ce soit (du code attend) : un code qui ne compile pas laisse tout en
   * l'état, contenu compris. Le sha compilé est noté : l'étape 2 ne recompile pas un draft inchangé.
   */
  async function compileFirst(run: RunInternal) {
    if (!run.codeChanged) return
    const state = await branches(repo)
    if (state.main === state.draft || run.compiled === state.draft) return
    await setStep(1, 'running', 'Checking that the new code compiles…')
    await checkDraftAhead(repo, state, new Set(run.design.map((item) => item.commit)))
    await prepareClone(repo, state)
    const compileError = await deps.typecheck(repo.dir)
    if (compileError) {
      throw new StepFailure('The draft code doesn’t compile, so nothing was published. The previous version is still live.', cleanLog(compileError))
    }
    run.compiled = state.draft
    await saveInternal(run)
  }

  /** Après l'étape 1 : actions programmées faites (ou devenues sans objet) retirées ; dépubliés retenus. */
  async function settleMarks(run: RunInternal, result: { published: string[]; unpublished: string[]; deleted: string[]; skipped: string[] }) {
    const heldRevs = new Map<string, string>()
    if (result.unpublished.length && deps.sanity) {
      const drafts = await deps.sanity.getDocuments(result.unpublished.map(draftIdOf)).catch(() => [])
      result.unpublished.forEach((id, index) => {
        const rev = drafts[index]?._rev
        if (typeof rev === 'string') heldRevs.set(id, rev)
      })
    }
    const staged = new Set(run.content.filter((item) => item.action).map((item) => item.id))
    await updateMarks((current) => {
      for (const id of staged) delete current.staged[id]
      for (const id of [...result.published, ...result.deleted]) delete current.held[id]
      for (const [id, rev] of heldRevs) current.held[id] = rev
    })
  }

  async function stepContent(run: RunInternal): Promise<Outcome> {
    await compileFirst(run)
    if (!run.content.length) {
      await settleTextChanges(run.textChanges, 'published').catch((error) => log(`[publish] ${errorText(error)}`))
      return { status: 'skipped', detail: 'No content change.' }
    }
    if (!deps.sanity) throw new StepFailure('The AI engine has no Sanity write token: the content can’t be published.')
    const result = await publishContent(deps.sanity, run.content)
    await settleMarks(run, result).catch((error) => log(`[publish] scheduled actions not settled: ${errorText(error)}`))
    await settleTextChanges(run.textChanges, 'published').catch((error) => log(`[publish] text changes not settled: ${errorText(error)}`))
    const parts = [
      `${result.published.length} document${result.published.length === 1 ? '' : 's'} published`,
      ...(result.unpublished.length ? [`${result.unpublished.length} unpublished`] : []),
      ...(result.deleted.length ? [`${result.deleted.length} deleted`] : []),
    ]
    const detail = parts.join(', ')
    return { status: 'done', detail: result.skipped.length ? `${detail} (${result.skipped.length} no longer needed)` : detail }
  }

  async function stepCode(run: RunInternal): Promise<Outcome> {
    if (!run.codeChanged) return { status: 'skipped', detail: 'No code change.' }
    if (!run.merged) {
      const state = await branches(repo)
      if (state.main === state.draft) return { status: 'skipped', detail: 'No code change left to publish.' }
      await checkDraftAhead(repo, state, new Set(run.design.map((item) => item.commit)))
      await prepareClone(repo, state)
      // Déjà compilé à l'étape 1 (même sha) : pas de second typecheck.
      if (run.compiled !== state.draft) {
        const compileError = await deps.typecheck(repo.dir)
        if (compileError) {
          throw new StepFailure('The draft code doesn’t compile, so it wasn’t published. The previous code version is still live.', cleanLog(compileError))
        }
        run.compiled = state.draft
      }
      await fastForwardMain(repo, state, `${tagName(run.number)}: main <- draft`)
      run.merged = { from: state.main, to: state.draft }
      await saveInternal(run)
    }
    const tag = await tagPublication(repo, run.number, run.merged.to)
    if (deps.git.push && !run.pushed) {
      const branch = await deps.git.sourceBranch()
      if (!branch) throw new StepFailure('The source branch to push to is unknown (data/workspace.json): ask Kuartz to run the engine setup again.')
      await pushPublication(repo, branch, tag)
      run.pushed = true
      await saveInternal(run)
    }
    await settleDesignChanges(run.design.map((item) => item.changeId))
    return { status: 'done', detail: `main → ${run.merged.to.slice(0, 7)} · ${tag}${deps.git.push ? ' · pushed' : ' · not pushed'}` }
  }

  async function stepDeploy(run: RunInternal): Promise<Outcome> {
    if (!run.merged) return { status: 'skipped', detail: 'No code change: nothing to build.' }
    if (!deps.deployHookUrl) return { status: 'skipped', detail: 'Local mode: no deployment (VERCEL_DEPLOY_HOOK_URL is not set).' }
    if (!run.deployTriggered) {
      const job = await triggerDeployHook(fetchImpl, deps.deployHookUrl)
      run.deployTriggered = true
      if (job) run.deployNote = `Vercel deployment job ${job}`
      await saveInternal(run)
    }
    return { status: 'done', detail: 'Deployment started on Vercel (about 1 minute).' }
  }

  async function stepLive(): Promise<Outcome> {
    const { url, secret } = deps.revalidate
    if (!url || !secret) return { status: 'skipped', detail: 'Site cache not refreshed: SITE_REVALIDATE_URL or REVALIDATE_SECRET is not set.' }
    await revalidateSite(fetchImpl, url, secret)
    return { status: 'done', detail: 'Site cache refreshed.' }
  }

  function publicationOf(run: RunInternal, status: Publication['status'], at: string, extra: Partial<Publication>): Publication {
    return {
      number: run.number,
      at,
      by: run.by.name,
      content: run.content.map((item) => ({ id: item.id, path: item.path })),
      design: run.design.map((item) => ({ changeId: item.changeId, title: item.title, commit: item.commit })),
      status,
      ...extra,
    }
  }

  async function succeed(run: RunInternal) {
    const at = now().toISOString()
    const main = await branches(repo).then((state) => state.main).catch(() => undefined)
    const notes = [run.deployNote, !deps.deployHookUrl && run.merged ? 'Local mode: not deployed.' : undefined].filter(Boolean)
    const publication = publicationOf(run, 'live', at, {
      ...(main ? { commit: main } : {}),
      ...(run.merged ? { tag: tagName(run.number) } : {}),
      ...(notes.length ? { note: notes.join(' ') } : {}),
    })
    await store.publications.update((data) => {
      for (const item of data.publications) if (item.status === 'live') item.status = 'previous'
      data.publications = [...data.publications.filter((item) => item.number !== run.number), publication]
      data.lastPublishedAt = at
      if (data.run) {
        data.run.finishedAt = at
        delete data.run.error
      }
      writeExtra(data, { run: null })
    })
    log(`[publish] publication ${run.number} is live`)
  }

  async function fail(run: RunInternal, step: PublishStep, error: unknown) {
    const failure = error instanceof StepFailure ? error : new StepFailure('Internal error of the AI engine. The previous version is still live.', cleanLog(errorText(error)))
    const data = store.publications.get()
    const contentLive = step > 1 && run.content.length > 0 && data.run?.steps.find((item) => item.step === 1)?.status === 'done'
    const message = contentLive ? `${failure.message} The content changes are already live.` : failure.message
    const at = now().toISOString()
    log(`[publish] publication ${run.number} failed at step ${step}: ${failure.message}`)
    await store.publications.update((draft) => {
      if (draft.run) {
        draft.run.step = step
        const entry = draft.run.steps.find((item) => item.step === step)
        if (entry) {
          entry.status = 'failed'
          entry.detail = failure.message
        }
        draft.run.finishedAt = at
        draft.run.error = { message, ...(failure.log ? { log: failure.log } : {}) }
      }
      const existing = draft.publications.find((item) => item.number === run.number)
      const publication = publicationOf(run, 'failed', existing?.at ?? at, { note: message, ...(run.merged ? { tag: tagName(run.number), commit: run.merged.to } : {}) })
      draft.publications = [...draft.publications.filter((item) => item.number !== run.number), publication]
      writeExtra(draft, { run })
    })
  }

  async function execute(release: () => void) {
    const run = internalRun()
    let step = (store.publications.get().run?.step ?? 1) as PublishStep
    try {
      if (!run) throw new Error('publication state missing')
      const steps: Record<PublishStep, () => Promise<Outcome>> = {
        1: () => stepContent(run),
        2: () => stepCode(run),
        3: () => stepDeploy(run),
        4: () => stepLive(),
      }
      for (; step <= 4; step = (step + 1) as PublishStep) {
        await setStep(step, 'running')
        const outcome = await steps[step]()
        await setStep(step, outcome.status, outcome.detail)
      }
      step = 4
      await succeed(run)
    } catch (error) {
      if (run) await fail(run, step, error).catch((inner) => log(`[publish] failure not recorded: ${errorText(inner)}`))
      else log(`[publish] ${errorText(error)}`)
    } finally {
      release()
    }
  }

  function launch(release: () => void) {
    running = execute(release)
  }

  // ─── Abandon ───────────────────────────────────────────────────────────────

  async function discardContent(id: string) {
    // Ligne d'une action programmée (« Will be unpublished ») : Discard l'annule, le document n'est pas touché.
    if (Object.hasOwn(marks().staged, id)) return void (await updateMarks((current) => void delete current.staged[id]))
    if (!deps.sanity) throw unavailable(NO_SANITY_NOTE)
    if (!isPublishableId(id)) throw notFound('This draft no longer exists.')
    const items = await pendingContent(pendingDeps()).catch(() => {
      throw unavailable('Sanity can’t be reached right now. Try again in a moment.')
    })
    if (!items.some((item) => item.id === id)) throw notFound('This draft no longer exists.')
    const touching = textOnlyValidated().filter((changeId) => documentsOf(changeId).includes(id))
    try {
      await discardDraft(deps.sanity, id)
    } catch (error) {
      log(`[publish] discard ${id}: ${errorText(error)}`)
      throw unavailable('Sanity refused to discard this draft. Try again in a moment.')
    }
    await settleTextChanges(touching, 'discarded').catch((error) => log(`[publish] ${errorText(error)}`))
  }

  const cannotAlone = () =>
    conflict('This change can’t be removed on its own: a later change builds on it. Discard the later changes first (newest first).')

  /**
   * Retire le commit d'une modification validée de draft : dernier commit → reset ; sinon rebase des commits suivants
   * (`rebase --onto <parent> <commit>`), refusé proprement en cas de conflit (rebase annulé, draft inchangée). Les
   * commits réécrits des modifications suivantes sont reportés dans le magasin.
   */
  async function discardDesign(changeId: string) {
    const stored = store.editor.change(changeId)
    if (!stored || stored.change.status !== 'validated' || !stored.change.commit) throw notFound('This change is no longer waiting to be published.')
    const commit = stored.change.commit
    if (await repo.isAncestor(commit, 'refs/heads/main')) throw conflict('This change is already live.')
    const state = await branches(repo)
    if (!(await repo.isAncestor(state.main, state.draft))) throw conflict('The live code (main) has diverged from the draft: a developer must reconcile them.')
    const commits = await draftCommits(repo, state)
    const index = commits.indexOf(commit)
    if (index === -1) throw conflict('This change is no longer on the draft: ask Kuartz to look at it.')
    const owners = new Map<string, string>()
    for (const entry of store.editor.validatedChanges()) if (entry.change.commit) owners.set(entry.change.commit, entry.change.id)
    if (commits.some((sha) => !owners.has(sha))) throw conflict('The draft has code changes that are not validated AI changes: ask Kuartz to look at it.')
    try {
      await prepareClone(repo, state)
    } catch (error) {
      throw conflict(error instanceof Error ? error.message : 'The engine’s clone is not ready.')
    }
    const parent = index > 0 ? commits[index - 1] : state.main
    const later = commits.slice(index + 1)
    const mapping = new Map<string, string>()
    if (!later.length) {
      await repo.resetHard(parent)
    } else {
      try {
        await repo.run(['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', 'rebase', '--quiet', '--onto', parent, commit])
      } catch {
        await repo.run(['rebase', '--abort']).catch(() => {})
        if ((await repo.head().catch(() => '')) !== state.draft) await repo.resetHard(state.draft).catch(() => {})
        throw cannotAlone()
      }
      const rewritten = await draftCommits(repo, await branches(repo))
      if (rewritten.length !== later.length) {
        // Un commit suivant est devenu vide (il ne faisait que reprendre celui-ci) : on remet draft comme avant.
        await repo.resetHard(state.draft)
        throw cannotAlone()
      }
      later.forEach((old, i) => mapping.set(old, rewritten[i]))
      for (const [old, next] of mapping) {
        const owner = owners.get(old)!
        await store.editor.updateChange(owner, (entry) => {
          entry.change.commit = next
          entry.internal.commits = [next]
        })
      }
    }
    await store.editor.updateChange(changeId, (entry) => {
      entry.change.status = 'discarded'
      entry.internal.commits = []
    })
    // Une publication en échec (reprise possible) garde la liste à jour : commit retiré, commits réécrits.
    const run = internalRun()
    if (run && !run.merged) {
      run.design = run.design.filter((item) => item.changeId !== changeId).map((item) => ({ ...item, commit: mapping.get(item.commit) ?? item.commit }))
      await saveInternal(run)
    }
  }

  // ─── API ───────────────────────────────────────────────────────────────────

  const service: PublishService = {
    status: () => status(),

    async publish(user, body) {
      const parsed = EXPECTED.safeParse(body)
      if (!parsed.success) throw badRequest('Expected { expected: string[] }: the list of changes you reviewed.')
      // Vérification + prise du verrou SYNCHRONES (409 busy / awaiting_validation / publishing).
      const release = lock.acquirePublish()
      let launched = false
      try {
        const pending = await readPending()
        const mismatch = expectedMismatch(parsed.data.expected, pending)
        if (mismatch) throw conflict(mismatch)
        if (pending.total === 0) throw badRequest('Everything is already published.')
        const state = await branches(repo)
        const codeChanged = state.main !== state.draft
        if (codeChanged) {
          // Précontrôle : un draft impossible à publier est refusé AVANT que le contenu parte.
          try {
            await checkDraftAhead(repo, state, new Set(pending.design.map((item) => item.commit)))
          } catch (error) {
            throw conflict(error instanceof Error ? error.message : 'The draft can’t be published.')
          }
        }
        const number = await nextPublicationNumber(repo, store.publications.nextNumber())
        const run: PublishRun = { id: newRunId(), startedAt: now().toISOString(), startedBy: user.name, step: 1, steps: freshSteps(deps.catalog.domain) }
        const internal: RunInternal = {
          number,
          by: { id: user.id, name: user.name, role: user.role },
          content: snapshotContent(pending.content),
          design: pending.design.map((item) => ({ changeId: item.changeId, commit: item.commit, title: item.title })),
          textChanges: textOnlyValidated(),
          codeChanged,
        }
        await store.publications.update((data) => {
          data.run = run
          writeExtra(data, { run: internal })
        })
        log(`[publish] publication ${number} started by ${user.name} (${pending.content.length} content, ${pending.design.length} design)`)
        launch(release)
        launched = true
      } finally {
        if (!launched) release()
      }
      return status()
    },

    async retry() {
      const release = lock.acquirePublish()
      let launched = false
      try {
        const data = store.publications.get()
        const internal = readExtra(data).run
        if (!data.run?.error || !internal) throw conflict('There is no failed publication to retry.')
        await store.publications.update((draft) => {
          if (!draft.run) return
          delete draft.run.error
          delete draft.run.finishedAt
          const entry = draft.run.steps.find((item) => item.step === draft.run!.step)
          if (entry) {
            entry.status = 'waiting'
            delete entry.detail
          }
        })
        log(`[publish] retry of publication ${internal.number} from step ${data.run.step}`)
        launch(release)
        launched = true
      } finally {
        if (!launched) release()
      }
      return status()
    },

    async discard(_user, body) {
      const parsed = DISCARD.safeParse(body)
      if (!parsed.success) throw badRequest('Expected { kind: "content", id } or { kind: "design", changeId }.')
      const item = parsed.data
      await lock.runPublish(() => (item.kind === 'content' ? discardContent(item.id) : discardDesign(item.changeId)))
      return status()
    },

    async stage(user, body) {
      const parsed = STAGE.safeParse(body)
      if (!parsed.success) throw badRequest('Expected { kind: "unpublish" | "delete", id }.')
      const { kind, id } = parsed.data
      if (lock.isPublishing()) throw publishing()
      if (!deps.sanity) throw unavailable(NO_SANITY_NOTE)
      if (!isPublishableId(id)) throw notFound('This item no longer exists.')
      const [draft, published] = await deps.sanity.getDocuments([draftIdOf(id), id]).catch((error: unknown) => {
        log(`[publish] stage ${id}: ${errorText(error)}`)
        throw unavailable('Sanity can’t be reached right now. Try again in a moment.')
      })
      const doc = published ?? draft
      if (!doc) throw notFound('This item no longer exists.')
      const entry = deps.catalog.types.has(doc._type) ? deps.catalog.resolve(doc._type, id) : null
      if (entry?.kind !== 'collection') throw badRequest('Only collection items can be unpublished or deleted.')
      if (kind === 'unpublish' && !published) throw conflict('This item isn’t published.')
      // Pas d'await entre ce contrôle et l'écriture : une publication lancée entre-temps garde sa liste.
      if (lock.isPublishing()) throw publishing()
      await updateMarks((current) => {
        current.staged[id] = { action: kind, type: doc._type, by: user.name, at: now().toISOString() }
        delete current.held[id]
      })
      log(`[publish] ${kind} of ${id} scheduled by ${user.name}`)
      return status()
    },

    async unstage(_user, body) {
      const parsed = UNSTAGE.safeParse(body)
      if (!parsed.success) throw badRequest('Expected { id }.')
      const { id } = parsed.data
      if (lock.isPublishing()) throw publishing()
      const current = marks()
      if (!Object.hasOwn(current.staged, id) && !Object.hasOwn(current.held, id)) throw notFound('Nothing is scheduled for this item.')
      await updateMarks((draft) => {
        delete draft.staged[id]
        delete draft.held[id]
      })
      return status()
    },

    async diff(user, changeId) {
      if (!can(user.role, 'publish.diff')) throw forbidden()
      const stored = ID_PATTERN.test(changeId) ? store.editor.change(changeId) : null
      if (!stored?.change.commit) throw notFound('This change has no code to show.')
      const diff = await repo.showCommitDiff(stored.change.commit).catch(() => {
        throw notFound('The code of this change is no longer available.')
      })
      return { diff: diff.length > DIFF_MAX_CHARS ? `${diff.slice(0, DIFF_MAX_CHARS)}\n… (diff truncated)` : diff }
    },

    async pendingTotal() {
      try {
        return (await readPending(true)).total
      } catch {
        return (await pendingDesign(pendingDeps()).catch(() => [])).length
      }
    },

    async recover() {
      const data = store.publications.get()
      const run = internalRun()
      if (data.run && !data.run.finishedAt && !data.run.error) {
        if (run) await fail(run, data.run.step, new StepFailure(INTERRUPTED_PUBLISH))
        else {
          await store.publications.update((draft) => {
            if (draft.run) {
              draft.run.finishedAt = now().toISOString()
              draft.run.error = { message: INTERRUPTED_PUBLISH }
            }
          })
        }
      }
      await settleDesignChanges().catch((error) => log(`[publish] ${errorText(error)}`))
      // Textes seuls publiés (ou abandonnés) hors du moteur, par ex. dans le Studio : plus rien n'attend. En arrière-plan :
      // le démarrage n'attend jamais Sanity.
      const textOnly = textOnlyValidated()
      if (textOnly.length) void settleTextChanges(textOnly, 'published').catch((error) => log(`[publish] ${errorText(error)}`))
    },

    idle: () => running,
  }
  return service
}

