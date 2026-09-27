import {
  ACTIVE_JOB_STATUSES,
  formatDuration,
  type Answer,
  type ChangeSummaryItem,
  type CheckResult,
  type EditJob,
  type ElementTarget,
  type PendingChange,
  type Question,
  type Scope,
  type StepKind,
  type ThreadEntry,
} from '@/admin/core/contracts'

/**
 * Logique PURE de la sidebar Claude (G2) : états du Composer et de l'en-tête de Claude, conditions d'envoi,
 * validation des réponses aux questions, libellés du fil. Aucun React ici : tout est testé en Node.
 */

export const NOTE_MAX = 600
export const OTHER_ANSWER_MAX = 300
export const MAX_TARGETS = 8
/** Intervalle d'interrogation d'une demande active (contrat engine.ts). */
export const POLL_INTERVAL_MS = 900

/** Textes de l'interface (anglais, recopiés du Figma D1-D3 / G2). */
export const UI = {
  ready: 'Ready',
  working: 'Working…',
  asking: 'Needs your answer',
  stopped: 'Stopped',
  readyHelp: 'Select an element in the page, choose Style and/or Text, then describe the change.',
  placeholderEmpty: 'Select an element in the page (Shift + click for several)',
  placeholderReady: 'Describe the change…',
  placeholderWorking: 'Claude is working…',
  placeholderWaiting: 'Waiting for your answer above…',
  placeholderAdjust: 'Adjust this change…',
  placeholderOther: 'Other answer…',
  toApply: 'to apply',
  apply: 'Apply',
  stop: 'Stop',
  cancel: 'Cancel',
  validate: 'Validate',
  otherAnswer: 'Other answer…',
  stoppedStep: 'Stopped — nothing was changed.',
  failedStep: 'Couldn’t apply — nothing was changed.',
  cancelledStep: 'Cancelled — the change was undone.',
  busyElsewhere: 'Claude is working on another page. You can send a request when it’s done.',
  pendingElsewhere: 'A change on another page is waiting for validation.',
  otherSelection: 'Validate or cancel this change before asking for another one.',
} as const

export type ComposerState = 'empty' | 'ready' | 'multi' | 'working' | 'waiting' | 'adjust' | 'answer'

export type ClaudeHeaderState = 'ready' | 'working' | 'asking' | 'done' | 'stopped'

export function isActive(job: Pick<EditJob, 'status'> | null | undefined): boolean {
  return !!job && ACTIVE_JOB_STATUSES.includes(job.status)
}

/**
 * État du Composer (fiche Figma « Composer », 6 états + « answer » : « Other answer… » rouvre le champ).
 * Priorité : demande active (working / waiting / answer) > modification en attente (adjust) > sélection.
 */
export function composerState(input: {
  job: Pick<EditJob, 'status'> | null
  pending: Pick<PendingChange, 'status'> | null
  selectionCount: number
  answeringOther: boolean
}): ComposerState {
  const { job, pending, selectionCount, answeringOther } = input
  if (job && isActive(job)) {
    if (job.status === 'waiting') return answeringOther ? 'answer' : 'waiting'
    return 'working'
  }
  if (pending && pending.status === 'to-validate') return 'adjust'
  if (selectionCount <= 0) return 'empty'
  return selectionCount === 1 ? 'ready' : 'multi'
}

/** Nombre de caractères visibles (points de code), comme la validation serveur. */
export function visibleLength(text: string): number {
  return Array.from(text).length
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export function cleanNote(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim()
}

/** Texte de demande valable : 1 à `max` caractères visibles, sans caractère de contrôle. */
export function isValidNote(text: string, max = NOTE_MAX): boolean {
  const clean = cleanNote(text)
  const len = visibleLength(clean)
  return len > 0 && len <= max && !CONTROL.test(clean)
}

/** Apply actif ? (portée : au moins une, rien de coché par défaut ; 1 à 8 éléments ; texte 1-600). */
export function canApply(input: {
  state: ComposerState
  scope: readonly Scope[]
  targetCount: number
  note: string
}): boolean {
  const { state, scope, targetCount, note } = input
  switch (state) {
    case 'ready':
    case 'multi':
      return scope.length > 0 && targetCount > 0 && targetCount <= MAX_TARGETS && isValidNote(note)
    case 'adjust':
      return isValidNote(note)
    case 'answer':
      return isValidNote(note, OTHER_ANSWER_MAX)
    default:
      return false
  }
}

/** Portée normalisée : ordre stable style → text, sans doublon. */
export function normalizeScope(scope: readonly Scope[]): Scope[] {
  return (['style', 'text'] as const).filter((s) => scope.includes(s))
}

export function toggleScope(scope: readonly Scope[], value: Scope, on: boolean): Scope[] {
  const next = on ? [...scope, value] : scope.filter((s) => s !== value)
  return normalizeScope(next)
}

// ─── Réponses aux questions (🟢 ⚪ 🔴 ou « Other answer… ») ──────────────────────────────────────

export type AnswerPick = { optionId: string } | { other: string }

export type AnswerCheck = { ok: true; answers: Answer[] } | { ok: false; missing: string[]; error?: string }

/**
 * Construit les réponses à envoyer : une par question, option proposée existante ou texte libre (1-300).
 * `missing` : questions encore sans réponse (l'envoi attend qu'elles aient toutes une réponse).
 */
export function buildAnswers(questions: readonly Question[], picks: Readonly<Record<string, AnswerPick>>): AnswerCheck {
  const answers: Answer[] = []
  const missing: string[] = []
  for (const question of questions) {
    const pick = picks[question.id]
    if (!pick) {
      missing.push(question.id)
      continue
    }
    if ('optionId' in pick) {
      if (!question.options.some((o) => o.id === pick.optionId)) {
        return { ok: false, missing, error: 'This option no longer exists.' }
      }
      answers.push({ questionId: question.id, optionId: pick.optionId })
    } else {
      if (!isValidNote(pick.other, OTHER_ANSWER_MAX)) {
        return { ok: false, missing, error: `Your answer must be 1 to ${OTHER_ANSWER_MAX} characters.` }
      }
      answers.push({ questionId: question.id, other: cleanNote(pick.other) })
    }
  }
  return missing.length ? { ok: false, missing } : { ok: true, answers }
}

/** Libellé d'une option 🔴 : « prop: value » (contrat : valeur en dur proposée). */
export function hardcodedLabel(option: { hardcoded?: { property: string; value: string } }): string | null {
  return option.hardcoded ? `${option.hardcoded.property}: ${option.hardcoded.value}` : null
}

// ─── En-tête de Claude et fil ────────────────────────────────────────────────────────────────────

/** Durée d'une demande (début → fin, ou maintenant si elle travaille). */
export function jobDurationMs(job: Pick<EditJob, 'createdAt' | 'startedAt' | 'finishedAt' | 'usage'>, now = Date.now()): number {
  if (job.usage?.durationMs) return job.usage.durationMs
  const start = Date.parse(job.startedAt ?? job.createdAt)
  const end = job.finishedAt ? Date.parse(job.finishedAt) : now
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0
}

export type HeaderView = { state: ClaudeHeaderState; status: string }

/** « Working… », « Needs your answer », « Done · 24 s », « Adjusted · 12 s », « No change · 8 s »… */
export function headerView(job: EditJob): HeaderView {
  switch (job.status) {
    case 'queued':
    case 'running':
      return { state: 'working', status: UI.working }
    case 'waiting':
      return { state: 'asking', status: UI.asking }
    case 'done':
      return {
        state: 'done',
        status: `${job.kind === 'adjustment' ? 'Adjusted' : 'Done'} · ${formatDuration(jobDurationMs(job))}`,
      }
    case 'rejected':
      return { state: 'done', status: `No change · ${formatDuration(jobDurationMs(job))}` }
    default:
      return { state: 'stopped', status: UI.stopped }
  }
}

export type StepView = { kind: 'log' | 'change'; text: string }

const CHANGE_KINDS: ReadonlySet<StepKind> = new Set(['edit', 'text'])

/** Étape du journal → variante Figma « Step » (log gris, change plus clair). */
export function stepView(step: { kind: StepKind; label: string }): StepView {
  return { kind: CHANGE_KINDS.has(step.kind) ? 'change' : 'log', text: step.label }
}

/** Ligne du résumé : « Title: size → Heading XL (token) », « “solved” in bold (Sanity draft) ». */
export function summaryText(item: ChangeSummaryItem, prefixTarget: boolean): string {
  const base = prefixTarget && item.target ? `${item.target}: ${item.description}` : item.description
  return item.where === 'sanity-draft' && !/\(Sanity draft\)\s*$/.test(base) ? `${base} (Sanity draft)` : base
}

/** Préfixer la cible seulement quand le résumé touche plusieurs éléments. */
export function summaryNeedsTarget(items: readonly ChangeSummaryItem[]): boolean {
  return new Set(items.map((i) => i.target)).size > 1
}

/** « Checks: contrast ✓ · mobile ✓ · tablet ✓ » ; un contrôle en échec est signalé ✕, un avertissement « ! ». */
export function checksLine(checks: readonly CheckResult[]): string | null {
  if (!checks.length) return null
  return `Checks: ${checks.map((c) => `${c.label} ${c.ok ? (c.warning ? '!' : '✓') : '✕'}`).join(' · ')}`
}

/** Phrase lue par un lecteur d'écran (les ✓ / ✕ ne se lisent pas bien). */
export function checksSpoken(checks: readonly CheckResult[]): string {
  return `Checks: ${checks.map((c) => `${c.label} ${c.ok ? (c.warning ? 'passed with a warning' : 'passed') : 'failed'}`).join(', ')}`
}

/** « 1 change to validate », « 1 change · adjusted once / twice / 3 times ». */
export function reviewTitle(adjustments: number): string {
  if (adjustments <= 0) return '1 change to validate'
  const times = adjustments === 1 ? 'once' : adjustments === 2 ? 'twice' : `${adjustments} times`
  return `1 change · adjusted ${times}`
}

/** « Validated — added to Publish (3 changes) ». */
export function validatedText(pendingTotal: number): string {
  const n = Math.max(1, Math.round(pendingTotal))
  return `Validated — added to Publish (${n} ${n === 1 ? 'change' : 'changes'})`
}

/** Libellés des éléments « Hero · Title ». */
export function targetKey(target: ElementTarget): string {
  return `${target.zone}#${target.index}#${target.key ?? ''}#${target.doc ?? ''}`
}

/**
 * Découpe du fil pour l'affichage : la DERNIÈRE demande est détaillée (en-tête, étapes, résumé, contrôles,
 * question, carte de validation) ; les précédentes sont repliées (message + une ligne de fin avec durée,
 * tokens et coût — G2 : « chaque demande garde dans le fil sa durée, ses tokens et son coût »).
 */
export function latestJobIndex(thread: readonly ThreadEntry[]): number {
  // Après « Validated » ou « Cancelled », la conversation repart de zéro : tout le fil est replié (G2, état 8).
  const last = thread.length - 1
  return last >= 0 && thread[last].type === 'job' ? last : -1
}

/**
 * Remplace (ou ajoute) une demande dans le fil, sans changer l'ordre : le fil local suit le sondage
 * sans attendre un rechargement complet de l'état.
 */
export function upsertJob(thread: readonly ThreadEntry[], job: EditJob): ThreadEntry[] {
  const index = thread.findIndex((e) => e.type === 'job' && e.job.id === job.id)
  if (index === -1) return [...thread, { type: 'job', job }]
  const next = thread.slice()
  next[index] = { type: 'job', job }
  return next
}

/** Demande ramenée dans le champ après Stop / échec / refus : « la demande revient dans le champ pour réessayer ». */
export function shouldRestoreRequest(job: Pick<EditJob, 'status' | 'kind'>): boolean {
  return job.status === 'stopped' || job.status === 'failed' || job.status === 'rejected'
}

/** Portée d'un ajustement : celle de la demande d'origine de la modification (au moins une). */
export function adjustmentScope(thread: readonly ThreadEntry[], changeId: string): Scope[] {
  for (const entry of thread) {
    if (entry.type === 'job' && entry.job.changeId === changeId && entry.job.kind === 'request') {
      const scope = normalizeScope(entry.job.request.scope)
      if (scope.length) return scope
    }
  }
  return ['style', 'text']
}
