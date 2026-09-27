import type {
  EditorState,
  EngineErrorCode,
  PendingContentItem,
  PendingDesignItem,
  Publication,
  PublishRun,
  PublishState,
  PublishStatus,
  PublishStep,
} from '../../contracts/engine'
import { ROLE_LABEL } from '../../contracts/roles'
import type { EngineUser } from '../../contracts/session'
import { engineErrorBody, ENGINE_MESSAGES } from '../errors'
import { clearValidatedDesignChanges, handleEditor, listValidatedDesignChanges } from './editor'
import type { MockEngineRequest, MockEngineResponse, MockHandler } from './types'

/**
 * Publication et versions SIMULÉES (ENGINE_MOCK=1) : routes /publish/* et /versions/* du contrat engine.ts.
 * Propriétaire : publish-ui (transféré par auth-core). Signature gardée : `handlePublish: MockHandler`.
 *
 * Fidèle au contrat : 409 conflict si `expected` ne correspond plus à la liste, 409 publishing pendant une
 * publication, 409 busy / awaiting_validation quand l'éditeur simulé travaille ou attend ✓ Validate (même verrou
 * que le vrai moteur, pour Publish, Retry et Discard), 400 s'il n'y a rien à publier, 404 pour un élément inconnu,
 * 501 not_implemented pour le retour arrière en mode local. La publication avance dans le temps (étapes 1 → 4,
 * contenu d'abord, build si du code a changé ET que le déploiement Vercel est branché), recalculée à chaque appel
 * d'après l'horloge : aucun minuteur.
 *
 * Mode de déploiement : `local` (comme le vrai moteur sans VERCEL_DEPLOY_HOOK_URL : étape 3 sautée, pas d'URL de
 * déploiement) sauf pour les scénarios qui simulent Vercel (`hosted`, `failed`, `pending-fails`).
 *
 * Design de E1 : les modifications de la démo du scénario + celles validées dans l'éditeur simulé
 * (`listValidatedDesignChanges()` de mock/editor.ts), retirées de l'éditeur une fois publiées ou abandonnées.
 * Dépublier / supprimer au prochain Publish : `POST /publish/stage` et `/publish/unstage` (PendingContentItem.action).
 *
 * Scénarios (un par état de la Top bar G3 + listes E1 / E2 réalistes pour Conduit), choisis en développement par
 * `POST /admin/publish/mock-scenario { scenario }` (route de publish-ui) ou au démarrage par
 * `ENGINE_MOCK_PUBLISH=<scénario>`. État en mémoire du processus, partagé par tous les utilisateurs (comme le vrai
 * moteur), rangé sur globalThis pour survivre au rechargement à chaud et aux instances de module de Next.
 */

// ─── Scénarios ──────────────────────────────────────────────────────────────

export const MOCK_PUBLISH_SCENARIOS = [
  { id: 'pending', label: 'Figma E1: 2 content drafts + 1 AI editor change; local mode, Publish runs steps 1, 2 and 4 (~4 s).' },
  { id: 'content-only', label: '1 content draft; Publish is live in seconds (no code, no build).' },
  { id: 'idle', label: 'Everything is published.' },
  { id: 'publishing', label: 'Frozen on “Publishing… step 2 / 4”.' },
  { id: 'published', label: 'Frozen on “Published at HH:MM”.' },
  { id: 'failed', label: 'Vercel mode: build failed at step 3, previous version still live; Retry succeeds.' },
  { id: 'pending-fails', label: 'Like pending in Vercel mode, but the build fails at step 3 (then Retry succeeds).' },
  { id: 'hosted', label: 'Like pending in Vercel mode (4 steps, ~9 s), with Instant Rollback available (E2).' },
  { id: 'empty', label: 'New site: nothing pending, no versions yet.' },
  { id: 'offline', label: 'Engine unreachable: every call fails with 502.' },
] as const

export type MockPublishScenario = (typeof MOCK_PUBLISH_SCENARIOS)[number]['id']

export function isMockPublishScenario(value: unknown): value is MockPublishScenario {
  return typeof value === 'string' && MOCK_PUBLISH_SCENARIOS.some((s) => s.id === value)
}

// ─── Données ────────────────────────────────────────────────────────────────

const SITE_DOMAIN = 'conduit.com'
const MIN = 60_000
const HOUR = 60 * MIN

/** Durées simulées des étapes (ms). */
export const MOCK_STEP_MS: Record<PublishStep, number> = { 1: 1500, 2: 1500, 3: 5000, 4: 1000 }

const STEP_LABELS: Record<PublishStep, string> = {
  1: 'Content goes live in Sanity',
  2: 'Only if code changed: draft → main',
  3: 'Vercel builds and deploys',
  4: `Live on ${SITE_DOMAIN}`,
}

export const MOCK_BUILD_ERROR = {
  message: 'Vercel build failed: type error in src/components/sections/Hero/Hero.tsx. The previous version is still live.',
  log: [
    '09:41:02.118  Running "npm run build"',
    '09:41:03.402  > next build',
    '09:41:21.771  ✓ Compiled successfully',
    '09:41:22.015  Linting and checking validity of types ...',
    '09:41:27.640  Failed to compile.',
    '09:41:27.641  ./src/components/sections/Hero/Hero.tsx:42:7',
    "09:41:27.641  Type error: Property 'eyebrow' does not exist on type 'HeroProps'.",
    '09:41:27.702  Error: Command "npm run build" exited with 1',
  ].join('\n'),
}

const DIFFS: Record<string, string> = {
  'chg-hero-title-size': [
    'diff --git a/src/components/sections/Hero/Hero.module.css b/src/components/sections/Hero/Hero.module.css',
    'index 4b1f0c2..9e7d3a8 100644',
    '--- a/src/components/sections/Hero/Hero.module.css',
    '+++ b/src/components/sections/Hero/Hero.module.css',
    '@@ -18,7 +18,7 @@',
    ' .title {',
    '   margin: 0;',
    '   color: var(--color-text-primary);',
    '-  font: var(--text-heading-l);',
    '+  font: var(--text-heading-xl);',
    '   letter-spacing: var(--tracking-tight);',
    '   text-wrap: balance;',
    ' }',
  ].join('\n'),
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

/** Heure locale donnée, `days` jours avant `now`. */
function atDaysAgo(now: number, days: number, hours: number, minutes: number): number {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  d.setHours(hours, minutes, 0, 0)
  return d.getTime()
}

/** 09:10 aujourd'hui si c'est au moins `minAge` avant maintenant, sinon la veille (l'ordre de la liste reste juste). */
function todayOrYesterdayAt(now: number, h: number, m: number, minAge: number): number {
  const today = atDaysAgo(now, 0, h, m)
  return today <= now - minAge ? today : atDaysAgo(now, 1, h, m)
}

/** Brouillons de contenu du Figma (E1). Ids réels du dataset development (page d'accueil, article de démo). */
function figmaContent(now: number): PendingContentItem[] {
  return [
    {
      id: 'dockSchedulingPage',
      type: 'dockSchedulingPage',
      path: 'Home › Hero · Title',
      summary: '“Dock scheduling, solved.”',
      author: 'Marie',
      updatedAt: iso(now - 12 * MIN),
      viewPath: '/',
    },
    {
      id: 'post-demo-carrier-portals-a-checklist',
      type: 'post',
      path: 'Blog › Carrier portals: a checklist',
      summary: 'Body and excerpt edited',
      author: 'Marie',
      updatedAt: iso(now - 5 * MIN),
      viewPath: '/blog/carrier-portals-a-checklist',
    },
  ]
}

function figmaDesign(now: number): PendingDesignItem[] {
  return [
    {
      changeId: 'chg-hero-title-size',
      commit: '3d9e41b7c2a04f1e8b6d5c3a2f1e0d9c8b7a6f5e',
      title: 'Hero · Title — size → Heading XL',
      validatedBy: 'Marie',
      validatedAt: iso(now - 5 * MIN),
      files: ['src/components/sections/Hero/Hero.module.css'],
    },
  ]
}

type PubRow = {
  n: number
  at: number
  by: string
  status: Publication['status']
  content: string[]
  design?: string[]
  note?: string
  commit: string
}

/** Historique de E2 (Figma) : la plus récente en haut, #13 en ligne, #11 en échec, #5 = première livraison. */
function figmaPublications(now: number): Publication[] {
  const rows: PubRow[] = [
    { n: 13, at: now - 2 * HOUR, by: 'Marie (Client admin)', status: 'live', content: ['Home › Customer story · Summary'], commit: 'a41c9e07d2b3f58e6c1a09b7d4e2f3a1c5b8d6e9' },
    { n: 12, at: todayOrYesterdayAt(now, 9, 10, 2 * HOUR + MIN), by: 'Andrea (Kuartz)', status: 'previous', content: ['FAQ › Does Conduit work with existing WMS and TMS systems?', 'FAQ › What is the implementation process like?'], commit: '7f3c2a1b9d8e4f60a2c5e7b1d3f9a8c6e4b2d0f1' },
    { n: 11, at: atDaysAgo(now, 3, 16, 42), by: 'Andrea (Kuartz)', status: 'failed', content: [], design: ['Features · Card title — weight → Semibold'], commit: 'c0e8d2f4a6b1c3e5f7a9b2d4c6e8f0a1b3c5d7e9' },
    { n: 10, at: atDaysAgo(now, 7, 11, 5), by: 'Andrea (Kuartz)', status: 'previous', content: ['Blog › Detention fees: what they really cost your warehouse'], commit: 'e9b7c5a3f1d2e4b6c8a0f2e4d6b8c0a2e4f6b8d0' },
    { n: 9, at: atDaysAgo(now, 9, 14, 20), by: 'Marie (Client admin)', status: 'previous', content: ['Testimonials › Northline Distribution'], commit: '5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c' },
    { n: 8, at: atDaysAgo(now, 15, 10, 0), by: 'Andrea (Kuartz)', status: 'previous', content: [], design: ['Performance · Title — size → Heading L'], commit: 'b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0' },
    { n: 7, at: atDaysAgo(now, 18, 9, 30), by: 'Paul (Editor)', status: 'previous', content: ['Blog › Peak season playbook for receiving teams'], commit: 'd6f8b0a2c4e6d8f0b2a4c6e8d0f2b4a6c8e0d2f4' },
    { n: 6, at: atDaysAgo(now, 22, 15, 45), by: 'Andrea (Kuartz)', status: 'previous', content: ['Settings › Scripts · Analytics'], commit: 'f0b2d4e6a8c0f2b4d6e8a0c2f4b6d8e0a2c4f6b8' },
    { n: 5, at: atDaysAgo(now, 25, 10, 0), by: 'Andrea (Kuartz)', status: 'previous', content: ['Home', 'Blog', 'FAQ'], note: 'first delivery', commit: '1c3e5a7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c' },
    { n: 4, at: atDaysAgo(now, 30, 17, 10), by: 'Andrea (Kuartz)', status: 'previous', content: ['Home › Hero'], commit: '3e5a7c9b1d3f5e7a9c1b3d5f7e9a1c3b5d7f9e1a' },
    { n: 3, at: atDaysAgo(now, 37, 12, 0), by: 'Andrea (Kuartz)', status: 'previous', content: ['Home › Features'], commit: '5a7c9e1d3f5b7a9c1e3d5f7b9a1c3e5d7f9b1a3c' },
    { n: 2, at: atDaysAgo(now, 44, 18, 25), by: 'Andrea (Kuartz)', status: 'previous', content: ['Home'], commit: '7c9e1a3f5b7d9c1e3a5f7b9d1c3e5a7f9b1d3c5e' },
  ]
  return rows.map((r) => ({
    number: r.n,
    at: iso(r.at),
    by: r.by,
    content: r.content.map((path, i) => ({ id: `mock-${r.n}-${i}`, path })),
    design: (r.design ?? []).map((title, i) => ({ changeId: `chg-${r.n}-${i}`, title, commit: r.commit })),
    commit: r.commit,
    tag: `publication-${r.n}`,
    ...(r.status !== 'failed' ? { deployUrl: deployUrl(r.commit) } : {}),
    status: r.status,
    ...(r.note ? { note: r.note } : {}),
  }))
}

function deployUrl(commit: string): string {
  return `https://conduit-${commit.slice(0, 7)}-kuartz.vercel.app`
}

// ─── Monde simulé ───────────────────────────────────────────────────────────

type StepPlan = { step: PublishStep; skip?: string; fail?: boolean }

type RunState = {
  run: PublishRun
  plan: StepPlan[]
  /** Horloge de départ de l'étape `fromStep` (départ ou reprise). */
  resumedAt: number
  fromStep: PublishStep
  content: PendingContentItem[]
  design: PendingDesignItem[]
  /** Publication figée sur une étape (scénario « publishing »). */
  frozenAt?: PublishStep
  /** Reprise d'une publication en échec : elle complète la publication en échec au lieu d'en créer une autre. */
  retry: boolean
  finalized: boolean
}

/**
 * Forme du monde : à incrémenter quand `World` change. Le monde vit sur globalThis et survit au rechargement à chaud ;
 * un monde d'une forme plus ancienne est reconstruit (même scénario) au lieu d'être lu avec des champs manquants.
 */
const WORLD_VERSION = 2

type World = {
  version: typeof WORLD_VERSION
  scenario: MockPublishScenario
  /** local : pas de hook Vercel (étape 3 sautée) ; vercel-hook : build et déploiement simulés. */
  deployMode: PublishStatus['deploy']['mode']
  content: PendingContentItem[]
  /**
   * Dépublier / supprimer programmés (POST /publish/stage), par id : la ligne de contenu d'avant (brouillon déjà en
   * attente), rendue par /publish/unstage ; null si le document n'avait pas de brouillon (la ligne disparaît).
   */
  staged: Map<string, PendingContentItem | null>
  design: PendingDesignItem[]
  lastValidatedAt?: string
  state: PublishState
  current?: RunState
  lastPublishedAt?: string
  /** Scénario « published » : la confirmation reste affichée (fin toujours « il y a 1 s »). */
  stickyPublished: boolean
  publications: Publication[]
  rollbackAvailable: boolean
  /** Prochaine publication : le build échoue à l'étape 3. */
  failNextBuild: boolean
  offline: boolean
  runCounter: number
}

/** Scénarios qui simulent le déploiement Vercel (hook branché) ; les autres suivent le mode local du vrai moteur. */
const VERCEL_SCENARIOS: ReadonlySet<MockPublishScenario> = new Set(['hosted', 'failed', 'pending-fails'])

/** Textes du vrai moteur en mode local (engine/src/publish/service.ts). */
export const MOCK_LOCAL_NOTE = 'Local mode: code changes stay in the engine’s clone (branch main, tag publication-N). No push, no deployment.'
export const MOCK_LOCAL_STEP3 = 'Local mode: no deployment (VERCEL_DEPLOY_HOOK_URL is not set).'

function buildWorld(scenario: MockPublishScenario, now: number): World {
  const world: World = {
    version: WORLD_VERSION,
    scenario,
    deployMode: VERCEL_SCENARIOS.has(scenario) ? 'vercel-hook' : 'local',
    content: [],
    staged: new Map(),
    design: [],
    state: 'idle',
    publications: figmaPublications(now),
    lastPublishedAt: iso(now - 2 * HOUR),
    stickyPublished: false,
    rollbackAvailable: false,
    failNextBuild: false,
    offline: false,
    runCounter: 0,
  }
  const figmaPending = () => {
    world.content = figmaContent(now)
    world.design = figmaDesign(now)
    world.lastValidatedAt = world.design[0]?.validatedAt
    world.state = 'pending'
  }
  switch (scenario) {
    case 'pending':
      figmaPending()
      break
    case 'content-only':
      world.content = figmaContent(now).slice(0, 1)
      world.state = 'pending'
      break
    case 'idle':
      break
    case 'publishing':
      figmaPending()
      startRun(world, 'Marie (Client admin)', now - MOCK_STEP_MS[1] - 400)
      world.current!.frozenAt = 2
      break
    case 'published':
      world.stickyPublished = true
      world.state = 'published'
      break
    case 'failed':
      figmaPending()
      world.failNextBuild = true
      startRun(world, 'Marie (Client admin)', now - (MOCK_STEP_MS[1] + MOCK_STEP_MS[2] + MOCK_STEP_MS[3] + 20_000))
      advance(world, now)
      break
    case 'pending-fails':
      figmaPending()
      world.failNextBuild = true
      break
    case 'hosted':
      figmaPending()
      world.rollbackAvailable = true
      break
    case 'empty':
      world.publications = []
      world.lastPublishedAt = undefined
      break
    case 'offline':
      world.offline = true
      break
  }
  return world
}

// ─── Déroulé d'une publication ──────────────────────────────────────────────

function startRun(world: World, by: string, at: number): void {
  const hasDesign = world.design.length > 0
  const plan: StepPlan[] = [
    { step: 1, ...(world.content.length === 0 ? { skip: 'No content changed.' } : {}) },
    { step: 2, ...(hasDesign ? {} : { skip: 'No code changed.' }) },
    {
      step: 3,
      ...(!hasDesign
        ? { skip: 'Content only: no build.' }
        : world.deployMode === 'local'
          ? { skip: MOCK_LOCAL_STEP3 }
          : world.failNextBuild
            ? { fail: true }
            : {}),
    },
    { step: 4 },
  ]
  world.failNextBuild = false
  world.stickyPublished = false
  world.runCounter += 1
  world.current = {
    run: {
      id: `run-${world.runCounter}`,
      startedAt: iso(at),
      startedBy: by,
      step: 1,
      steps: plan.map((p) => ({ step: p.step, label: STEP_LABELS[p.step], status: 'waiting' as const })),
    },
    plan,
    resumedAt: at,
    fromStep: 1,
    content: [...world.content],
    design: [...world.design],
    retry: false,
    finalized: false,
  }
  world.state = 'publishing'
}

/** Fait avancer la publication en cours jusqu'à `now` (étapes, contenu en ligne, échec, fin). */
function advance(world: World, now: number, editor: EditorPort | null = null): void {
  const cur = world.current
  if (!cur || cur.finalized || world.state !== 'publishing') return
  let clock = cur.resumedAt
  for (const plan of cur.plan) {
    if (plan.step < cur.fromStep) continue
    const entry = cur.run.steps.find((s) => s.step === plan.step)!
    if (plan.skip) {
      entry.status = 'skipped'
      entry.detail = plan.skip
      continue
    }
    if (cur.frozenAt === plan.step) {
      entry.status = 'running'
      cur.run.step = plan.step
      return
    }
    const end = clock + MOCK_STEP_MS[plan.step]
    if (now < end) {
      entry.status = 'running'
      cur.run.step = plan.step
      return
    }
    clock = end
    if (plan.fail) {
      entry.status = 'failed'
      entry.detail = 'Build failed.'
      cur.run.step = plan.step
      cur.run.error = { ...MOCK_BUILD_ERROR }
      cur.run.finishedAt = iso(end)
      world.state = 'failed'
      recordPublication(world, cur, end, 'failed')
      return
    }
    entry.status = 'done'
    if (plan.step === 1) {
      // Le contenu part d'abord : il est en ligne (ou dépublié / supprimé) même si la suite échoue.
      const ids = new Set(cur.content.map((c) => c.id))
      world.content = world.content.filter((c) => !ids.has(c.id))
      for (const id of ids) world.staged.delete(id)
    }
  }
  finalize(world, cur, clock, editor)
}

function nextNumber(world: World): number {
  return world.publications.reduce((max, p) => Math.max(max, p.number), 1) + 1
}

/** Faux commit stable (40 caractères hexadécimaux). */
function fakeCommit(seed: number): string {
  const hex = ((seed * 2654435761) >>> 0).toString(16).padStart(8, '0')
  return `${hex}c0ffee42d15ea5e1a7e5b0a7d0c0de`.slice(0, 40)
}

function recordPublication(world: World, cur: RunState, at: number, status: Publication['status']): void {
  const n = nextNumber(world)
  const commit = cur.design.length > 0 ? fakeCommit(n) : world.publications.find((p) => p.commit)?.commit
  if (status === 'live') for (const p of world.publications) if (p.status === 'live') p.status = 'previous'
  const local = world.deployMode === 'local'
  world.publications.unshift({
    number: n,
    at: iso(at),
    by: cur.run.startedBy,
    content: cur.content.map((c) => ({ id: c.id, path: c.path })),
    design: cur.design.map((d) => ({ changeId: d.changeId, title: d.title, commit: d.commit })),
    ...(commit ? { commit } : {}),
    tag: `publication-${n}`,
    // Mode local : rien n'est déployé (comme le vrai moteur : pas d'URL, note « Local mode: not deployed. »).
    ...(status === 'live' && commit && !local ? { deployUrl: deployUrl(commit) } : {}),
    ...(local && cur.design.length > 0 ? { note: 'Local mode: not deployed.' } : {}),
    status,
  })
}

function finalize(world: World, cur: RunState, at: number, editor: EditorPort | null): void {
  cur.finalized = true
  cur.run.step = 4
  cur.run.finishedAt = iso(at)
  const designIds = new Set(cur.design.map((d) => d.changeId))
  world.design = world.design.filter((d) => !designIds.has(d.changeId))
  // Publiées : elles quittent aussi la liste de l'éditeur simulé (sinon la synchronisation les ramènerait).
  if (designIds.size > 0) editor?.clear([...designIds])
  world.lastValidatedAt = world.design.at(-1)?.validatedAt
  world.lastPublishedAt = iso(at)
  world.state = 'published'
  const failed = cur.retry ? world.publications.find((p) => p.status === 'failed' && p.by === cur.run.startedBy) : undefined
  if (failed) {
    for (const p of world.publications) if (p.status === 'live') p.status = 'previous'
    failed.status = 'live'
    failed.at = iso(at)
    if (failed.commit) failed.deployUrl = deployUrl(failed.commit)
    return
  }
  recordPublication(world, cur, at, 'live')
}

function deployOf(world: World): PublishStatus['deploy'] {
  return world.deployMode === 'local' ? { mode: 'local', note: MOCK_LOCAL_NOTE } : { mode: 'vercel-hook' }
}

function statusOf(world: World, now: number, editor: EditorPort | null): PublishStatus {
  advance(world, now, editor)
  const total = world.content.length + world.design.length
  const pending: PublishStatus['pending'] = {
    content: structuredClone(world.content),
    design: structuredClone(world.design),
    total,
    ...(world.lastValidatedAt && world.design.length > 0 ? { lastValidatedAt: world.lastValidatedAt } : {}),
  }
  if (world.stickyPublished && world.state === 'published') {
    const finishedAt = iso(now - 1000)
    return {
      state: 'published',
      pending,
      run: {
        id: 'run-published',
        startedAt: iso(now - 10_000),
        startedBy: 'Marie (Client admin)',
        step: 4,
        steps: ([1, 2, 3, 4] as const).map((step) => ({ step, label: STEP_LABELS[step], status: 'done' as const })),
        finishedAt,
      },
      lastPublishedAt: finishedAt,
      deploy: deployOf(world),
    }
  }
  let state = world.state
  // Au repos, l'état suit la liste (un brouillon arrivé après une publication repasse en « pending »).
  if (state === 'idle' || state === 'pending') state = total > 0 ? 'pending' : 'idle'
  return {
    state,
    pending,
    ...(world.current ? { run: structuredClone(world.current.run) } : {}),
    ...(world.lastPublishedAt ? { lastPublishedAt: world.lastPublishedAt } : {}),
    deploy: deployOf(world),
  }
}

// ─── Éditeur simulé (même rôle que EditorGate du vrai moteur, engine/src/jobs/lock.ts) ───────────────────

/**
 * Ce que la publication simulée lit de l'éditeur simulé : ses modifications validées (Design de E1), leur retrait
 * une fois publiées ou abandonnées, et le verrou croisé (demande active → busy ; modification à valider →
 * awaiting_validation). Injecté pour les tests ; l'instance du processus branche mock/editor.ts.
 */
export type EditorPort = {
  validated(): PendingDesignItem[]
  clear(changeIds: readonly string[]): void
  blocker(): 'busy' | 'awaiting_validation' | null
}

/** Messages du vrai moteur (engine/src/server/errors.ts). */
export const MOCK_BUSY_MESSAGE = 'Claude is already working on a change. Wait for it to finish.'
export const MOCK_AWAITING_MESSAGE = 'Validate or cancel the current change first.'

const PORT_USER: EngineUser = { id: 'publish-mock', name: 'Publish', email: 'publish-mock@kuartz.invalid', role: 'kuartz' }

/** Branche mock/editor.ts : liste et retrait exportés par editor-sidebar ; verrou lu par sa route GET /editor/state. */
export const MOCK_EDITOR_PORT: EditorPort = {
  validated: () => listValidatedDesignChanges(),
  clear: (ids) => clearValidatedDesignChanges(ids),
  blocker() {
    const res = handleEditor({
      method: 'GET',
      segments: ['editor', 'state'],
      params: {},
      query: new URLSearchParams({ page: '/' }),
      body: null,
      user: PORT_USER,
    })
    // L'éditeur simulé répond de façon synchrone ; une réponse différée ou en erreur ne bloque rien.
    if (res instanceof Promise || !('json' in res) || res.status !== 200) return null
    const state = res.json as Pick<EditorState, 'active' | 'pending'>
    if (state.active) return 'busy'
    if (state.pending?.status === 'to-validate' || state.pending?.status === 'working') return 'awaiting_validation'
    return null
  },
}

/** Ajoute à la liste de E1 les modifications validées dans l'éditeur simulé qu'elle n'a pas encore. */
function syncEditor(world: World, editor: EditorPort | null): void {
  if (!editor) return
  const known = new Set(world.design.map((d) => d.changeId))
  const fresh = editor.validated().filter((d) => !known.has(d.changeId))
  if (fresh.length === 0) return
  world.design = [...world.design, ...fresh]
  world.lastValidatedAt = fresh.at(-1)?.validatedAt ?? world.lastValidatedAt
  listChanged(world)
}

/** La liste a changé hors publication : la confirmation « Published » cède la place à « Unpublished changes ». */
function listChanged(world: World): void {
  world.stickyPublished = false
  if (world.state === 'published') world.state = 'pending'
}

function editorBlocked(editor: EditorPort | null): MockEngineResponse | null {
  const blocker = editor?.blocker() ?? null
  if (blocker === 'busy') return error(409, 'busy', MOCK_BUSY_MESSAGE)
  if (blocker === 'awaiting_validation') return error(409, 'awaiting_validation', MOCK_AWAITING_MESSAGE)
  return null
}

// ─── Dépublier / supprimer au prochain Publish ──────────────────────────────

const STAGE_ID = /^[A-Za-z0-9_][\w.-]{0,199}$/

const STAGE_SUMMARY: Record<'unpublish' | 'delete', string> = {
  unpublish: 'Taken off the site; the draft is kept',
  delete: 'Deleted from the site and the CMS',
}

/**
 * Programme l'action sur un document : la ligne existante (brouillon en attente) change d'action, sinon une ligne
 * est créée. Le simulé ne connaît pas le document : sans brouillon, le chemin affiché est son id.
 */
function stageItem(world: World, kind: 'unpublish' | 'delete', id: string, by: string, at: number): void {
  const existing = world.content.find((c) => c.id === id)
  if (!world.staged.has(id)) world.staged.set(id, existing ? structuredClone(existing) : null)
  const base: PendingContentItem = existing ?? { id, type: 'document', path: id, summary: '', updatedAt: iso(at) }
  const next: PendingContentItem = { ...base, action: kind, summary: STAGE_SUMMARY[kind], author: by, updatedAt: iso(at) }
  world.content = existing ? world.content.map((c) => (c.id === id ? next : c)) : [...world.content, next]
}

function unstageItem(world: World, id: string): void {
  const previous = world.staged.get(id)
  world.staged.delete(id)
  world.content = previous ? world.content.map((c) => (c.id === id ? previous : c)) : world.content.filter((c) => c.id !== id)
}

// ─── Routes ─────────────────────────────────────────────────────────────────

function error(status: number, code: EngineErrorCode, message: string): MockEngineResponse {
  return { status, json: engineErrorBody(code, message) }
}

function ok(json: unknown): MockEngineResponse {
  return { status: 200, json }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

function publicationBy(user: EngineUser): string {
  return `${user.name} (${ROLE_LABEL[user.role]})`
}

/** Route du contrat reconnue d'après la méthode et les segments (déjà filtrés par la liste blanche). */
function routeOf(req: MockEngineRequest): string {
  const s = req.segments
  if (s[0] === 'publish') {
    if (s.length === 1) return `${req.method} publish`
    if (s.length === 2) return `${req.method} publish/${s[1]}`
    if (s.length === 3 && s[1] === 'diff') return `${req.method} publish/diff/:id`
  }
  if (s[0] === 'versions') {
    if (s.length === 1) return `${req.method} versions`
    if (s.length === 3 && s[2] === 'rollback') return `${req.method} versions/:number/rollback`
  }
  return 'unknown'
}

export type PublishMock = {
  handle: (request: MockEngineRequest) => MockEngineResponse
  setScenario: (scenario: MockPublishScenario) => void
  scenario: () => MockPublishScenario
}

/** Fabrique (horloge et éditeur injectables, pour les tests ; sans `editor`, aucun lien avec l'éditeur simulé). */
export function createPublishMock(
  options: { now?: () => number; scenario?: MockPublishScenario; holder?: { world?: World }; editor?: EditorPort } = {},
): PublishMock {
  const now = options.now ?? (() => Date.now())
  const editor = options.editor ?? null
  // Le monde vit dans `holder` : l'instance du processus le range sur globalThis (le code, lui, suit le rechargement).
  const holder = options.holder ?? {}
  if (!holder.world) holder.world = buildWorld(options.scenario ?? 'pending', now())
  else if (holder.world.version !== WORLD_VERSION) holder.world = buildWorld(holder.world.scenario ?? options.scenario ?? 'pending', now())

  function handle(req: MockEngineRequest): MockEngineResponse {
    const t = now()
    const world = holder.world!
    if (world.offline) return error(502, 'unavailable', ENGINE_MESSAGES.unavailable)
    advance(world, t, editor)
    syncEditor(world, editor)
    switch (routeOf(req)) {
      case 'GET publish/status':
        return ok(statusOf(world, t, editor))

      case 'POST publish': {
        const blocked = editorBlocked(editor)
        if (blocked) return blocked
        if (world.state === 'publishing') return error(409, 'publishing', 'A publish is already running. Wait for it to finish.')
        const expected = (req.body as { expected?: unknown } | null)?.expected
        if (!Array.isArray(expected) || !expected.every((v) => typeof v === 'string')) {
          return error(400, 'bad_request', 'Invalid request.')
        }
        const current = [...world.content.map((c) => c.id), ...world.design.map((d) => d.changeId)]
        if (current.length === 0) return error(400, 'bad_request', 'Nothing to publish.')
        if (!sameIds(expected, current)) {
          return error(409, 'conflict', 'The list of changes to publish has changed. Reload it and try again.')
        }
        startRun(world, publicationBy(req.user), t)
        return ok(statusOf(world, t, editor))
      }

      case 'POST publish/retry': {
        const blocked = editorBlocked(editor)
        if (blocked) return blocked
        const cur = world.current
        if (world.state !== 'failed' || !cur) return error(409, 'conflict', 'There is no failed publish to retry.')
        const from = (cur.run.steps.find((s) => s.status === 'failed')?.step ?? 1) as PublishStep
        for (const p of cur.plan) if (p.step >= from) delete p.fail
        for (const s of cur.run.steps) {
          if (s.step < from) continue
          s.status = 'waiting'
          delete s.detail
        }
        delete cur.run.error
        delete cur.run.finishedAt
        cur.fromStep = from
        cur.resumedAt = t
        cur.retry = true
        world.state = 'publishing'
        return ok(statusOf(world, t, editor))
      }

      case 'POST publish/discard': {
        const blocked = editorBlocked(editor)
        if (blocked) return blocked
        if (world.state === 'publishing') return error(409, 'publishing', 'A publish is running. Try again when it’s done.')
        const body = req.body as { kind?: unknown; id?: unknown; changeId?: unknown } | null
        if (body?.kind === 'content' && typeof body.id === 'string') {
          if (!world.content.some((c) => c.id === body.id)) return error(404, 'not_found', 'This draft no longer exists.')
          // Abandon complet : le brouillon ET l'éventuel dépublier / supprimer programmé.
          world.content = world.content.filter((c) => c.id !== body.id)
          world.staged.delete(body.id)
        } else if (body?.kind === 'design' && typeof body.changeId === 'string') {
          if (!world.design.some((d) => d.changeId === body.changeId)) return error(404, 'not_found', 'This change no longer exists.')
          world.design = world.design.filter((d) => d.changeId !== body.changeId)
          world.lastValidatedAt = world.design.at(-1)?.validatedAt
          editor?.clear([body.changeId])
        } else {
          return error(400, 'bad_request', 'Invalid request.')
        }
        world.stickyPublished = false
        return ok(statusOf(world, t, editor))
      }

      case 'POST publish/stage': {
        if (world.state === 'publishing') return error(409, 'publishing', 'A publish is running. Try again when it’s done.')
        const body = req.body as { kind?: unknown; id?: unknown } | null
        const kind = body?.kind
        const id = body?.id
        if ((kind !== 'unpublish' && kind !== 'delete') || typeof id !== 'string' || !STAGE_ID.test(id) || id.startsWith('drafts.')) {
          return error(400, 'bad_request', 'Expected { kind: "unpublish" | "delete", id } with the published id.')
        }
        stageItem(world, kind, id, req.user.name, t)
        listChanged(world)
        return ok(statusOf(world, t, editor))
      }

      case 'POST publish/unstage': {
        if (world.state === 'publishing') return error(409, 'publishing', 'A publish is running. Try again when it’s done.')
        const id = (req.body as { id?: unknown } | null)?.id
        if (typeof id !== 'string' || !STAGE_ID.test(id)) return error(400, 'bad_request', 'Expected { id }.')
        if (!world.staged.has(id)) return error(404, 'not_found', 'Nothing is scheduled for this item anymore.')
        unstageItem(world, id)
        return ok(statusOf(world, t, editor))
      }

      case 'GET publish/diff/:id': {
        const id = req.params.id ?? req.segments[2]
        const known = world.design.some((d) => d.changeId === id) || id in DIFFS
        if (!known) return error(404, 'not_found', 'This change no longer exists.')
        return ok({ diff: DIFFS[id] ?? `diff --git a/src/app/page.module.css b/src/app/page.module.css\n(no diff recorded for ${id})` })
      }

      case 'GET versions':
        return ok({
          publications: structuredClone(world.publications),
          rollback: world.rollbackAvailable
            ? { available: true }
            : { available: false, reason: 'Roll back uses Vercel Instant Rollback, which isn’t available while the engine runs in local mode.' },
        })

      case 'POST versions/:number/rollback': {
        const number = Number(req.params.number ?? req.segments[1])
        const target = world.publications.find((p) => p.number === number)
        if (!target) return error(404, 'not_found', 'This version doesn’t exist.')
        if (!world.rollbackAvailable) {
          return error(501, 'not_implemented', 'Roll back isn’t available in local mode: there is no Vercel deployment to return to.')
        }
        if (world.state === 'publishing') return error(409, 'publishing', 'A publish is running. Try again when it’s done.')
        if (target.status === 'failed') return error(409, 'conflict', 'This version failed to build: it can’t go live.')
        if (target.status === 'live') return error(409, 'conflict', 'This version is already live.')
        for (const p of world.publications) if (p.status === 'live') p.status = 'rolled-back'
        target.status = 'live'
        return ok(structuredClone(target))
      }

      default:
        return error(404, 'not_found', ENGINE_MESSAGES.notFound)
    }
  }

  return {
    handle,
    setScenario(scenario) {
      holder.world = buildWorld(scenario, now())
    },
    scenario: () => holder.world!.scenario,
  }
}

// ─── Instance du processus ──────────────────────────────────────────────────

const GLOBAL_KEY = Symbol.for('kz.admin.mock.publish')

let instance: PublishMock | null = null

/**
 * Instance du processus. L'ÉTAT est rangé sur globalThis (un seul monde, même si Next charge le module plusieurs
 * fois ou le recharge à chaud) ; le code est celui du module courant.
 */
export function publishMock(): PublishMock {
  if (instance) return instance
  const g = globalThis as unknown as Record<symbol, { world?: World } | undefined>
  const holder = (g[GLOBAL_KEY] ??= {})
  const fromEnv = process.env.ENGINE_MOCK_PUBLISH
  instance = createPublishMock({ holder, scenario: isMockPublishScenario(fromEnv) ? fromEnv : 'pending', editor: MOCK_EDITOR_PORT })
  return instance
}

export const handlePublish: MockHandler = (request) => publishMock().handle(request)
