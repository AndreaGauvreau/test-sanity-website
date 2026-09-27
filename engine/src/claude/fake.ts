import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { checkToolUse } from '../guards/guards'
import { describeTool, RESULT_ERRORS, type AgentResult, type AgentRun, type RunAgent } from './agent'
import { addTokens, estimateCost, NO_TOKENS, type Tokens } from './cost'
import { ASK_TOOL, MEASURE_TOOL, TEXT_TOOL } from './names'
import type { QuestionDraft } from './questions'

/**
 * Faux Claude : implémentation SCRIPTABLE de `RunAgent` (même interface que `createAgentRunner`), pour les tests
 * d'engine-core et d'engine-publish. Aucun appel à Claude, aucun processus.
 *
 * Il se comporte comme le vrai là où cela compte pour le moteur :
 * - chaque outil passe d'abord par le VRAI hook (`checkToolUse` d'engine-guards) : un Edit hors périmètre ou un Read de
 *   `.env` est refusé (étape `warn`) et n'a pas lieu ;
 * - Edit écrit VRAIMENT le fichier dans `run.cwd` (le moteur voit le changement dans git) ; set_text appelle
 *   `run.textTool.onSet` ; ask_client appelle `run.askTool.ask` et attend la réponse ; measure appelle `run.measureTool` ;
 * - sessions : le 1er appel ouvre `fake-session-N` ; un appel avec `resume` égal à cette session la CONTINUE et rapporte le
 *   coût CUMULÉ (comme `total_cost_usd` du SDK) ; un appel interrompu (Stop, délai, plantage) rapporte `costKind: 'call'`
 *   avec son seul coût estimé ;
 * - Stop (`run.signal`) : vérifié entre chaque étape et pendant `wait` → « Change stopped on request. ».
 */

export type FakeStep =
  /** Lit un fichier (passe par le hook ; rien d'autre). */
  | { kind: 'read'; file: string }
  /** Remplace `find` par `replace` dans un fichier (chemin relatif au dépôt), ou écrit `content` en entier. */
  | { kind: 'edit'; file: string; find?: string; replace?: string; content?: string }
  /** Propose un texte Sanity (id de champ de la demande). */
  | { kind: 'set_text'; field: string; value: string }
  /** Pose des questions au client et attend la réponse. */
  | { kind: 'ask'; questions: QuestionDraft[] }
  /** Mesure l'élément (outil measure). */
  | { kind: 'measure' }
  /** Texte intermédiaire de Claude (journal). */
  | { kind: 'say'; text: string }
  /** Attente (pour tester Stop ou le délai). */
  | { kind: 'wait'; ms: number }
  /** Outil quelconque (Bash, Write…) : refusé par le hook, étape warn. */
  | { kind: 'tool'; name: string; input?: Record<string, unknown> }

export type FakeCall = {
  steps?: FakeStep[]
  /** Message final de Claude au client. */
  message?: string
  /**
   * ok : succès ; error : le SDK rapporte une erreur d'exécution ; max-budget / max-turns : plafonds du SDK (coût gardé) ;
   * fatal : erreur d'accès (authentification) sans résultat, `fatal: true` ; crash : le processus plante sans résultat.
   */
  outcome?: 'ok' | 'error' | 'max-budget' | 'max-turns' | 'fatal' | 'crash'
  /** Coût de CET appel en dollars (défaut 0.05) ; le résultat d'une session reprise rapporte le cumul. */
  costUsd?: number
  /** Jetons de CET appel (défaut : 1 000 en entrée, 200 en sortie, 8 000 lus en cache). */
  tokens?: Tokens
  turns?: number
  /** Texte d'erreur pour outcome 'error'. */
  error?: string
}

/** Un script : liste d'appels (le n-ième appel de runAgent joue le n-ième), ou fonction de l'appel et de son rang. */
export type FakeScript = FakeCall[] | ((run: AgentRun, index: number) => FakeCall)

export type FakeAgent = RunAgent & {
  /** Demandes reçues, dans l'ordre (prompt, resume, périmètre…). */
  readonly runs: AgentRun[]
  /** Résultats rendus, dans l'ordre. */
  readonly results: AgentResult[]
}

const DEFAULT_TOKENS: Tokens = Object.freeze({ input: 1000, output: 200, cacheRead: 8000, cacheWrite: 0 })
const MODEL = 'claude-opus-5-5'

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true })
  })

/** Faux Claude scriptable. `model` sert seulement à estimer le coût d'un appel interrompu. */
export function createFakeAgent(script: FakeScript, options: { model?: string } = {}): FakeAgent {
  const runs: AgentRun[] = []
  const results: AgentResult[] = []
  const sessions = new Map<string, { cost: number; tokens: Tokens }>()
  let opened = 0

  const agent = (async (run: AgentRun): Promise<AgentResult> => {
    const index = runs.length
    runs.push(run)
    const call = typeof script === 'function' ? script(run, index) : script[index]
    if (!call) throw new Error(`Fake Claude: no script for call #${index + 1}.`)
    const done = (result: AgentResult) => (results.push(result), result)

    // Session : reprise si `resume` désigne une session ouverte par ce faux Claude, sinon une nouvelle.
    const resumed = run.resume && sessions.has(run.resume) ? run.resume : null
    const sessionId = resumed ?? `fake-session-${++opened}`
    const previous = sessions.get(sessionId) ?? { cost: 0, tokens: NO_TOKENS }
    const callCost = call.costUsd ?? 0.05
    const callTokens = call.tokens ?? DEFAULT_TOKENS
    const turns = call.turns ?? Math.max(1, (call.steps ?? []).length)
    let pending = ''

    // Appel interrompu : seul son coût, estimé (costKind call), comme le vrai runner.
    const interrupted = (error: string, fatal = false): AgentResult =>
      done({
        ok: false,
        message: pending,
        sessionId,
        costUsd: estimateCost(options.model ?? MODEL, callTokens) ?? callCost,
        tokens: callTokens,
        turns,
        apiTurns: turns,
        costKind: 'call',
        error,
        ...(fatal ? { fatal: true } : {}),
      })
    const stopped = () => run.signal.aborted

    if (call.outcome === 'fatal') {
      return interrupted('Access refused by Anthropic: check the ANTHROPIC_API_KEY in engine/.env.local.', true)
    }

    for (const step of call.steps ?? []) {
      if (stopped()) return interrupted('Change stopped on request.')
      const allowed = (tool: string, input: Record<string, unknown>) => {
        const event = describeTool(run.cwd, tool, input)
        if (event) run.onEvent(event)
        const verdict = checkToolUse(run.cwd, run.toolAccess, tool, input)
        if (!verdict.allow) run.onEvent({ kind: 'warn', label: verdict.reason })
        return verdict.allow
      }
      switch (step.kind) {
        case 'say':
          if (pending) run.onEvent({ kind: 'info', label: pending })
          pending = step.text
          break
        case 'wait':
          await sleep(step.ms, run.signal)
          break
        case 'read': {
          const file = path.resolve(run.cwd, step.file)
          if (allowed('Read', { file_path: file })) await readFile(file, 'utf8').catch(() => '')
          break
        }
        case 'edit': {
          const file = path.resolve(run.cwd, step.file)
          if (!allowed('Edit', { file_path: file })) break
          const before = await readFile(file, 'utf8').catch(() => '')
          const after = step.content ?? before.replace(step.find ?? '', step.replace ?? '')
          await writeFile(file, after)
          break
        }
        case 'set_text': {
          if (!allowed(TEXT_TOOL, { field: step.field, value: step.value })) break
          const error = run.textTool ? await run.textTool.onSet(step.field, step.value) : 'Text not enabled.'
          if (error) run.onEvent({ kind: 'warn', label: error })
          break
        }
        case 'measure':
          if (allowed(MEASURE_TOOL, {}) && run.measureTool) await run.measureTool.measure()
          break
        case 'ask': {
          if (!allowed(ASK_TOOL, { questions: step.questions })) break
          if (!run.askTool) break
          try {
            const answer = await run.askTool.ask(step.questions)
            if ('error' in answer) run.onEvent({ kind: 'warn', label: answer.error })
          } catch (error) {
            // Stop ou délai de réponse dépassé : l'attente est rompue, comme le processus du vrai Claude.
            if (stopped()) return interrupted('Change stopped on request.')
            return interrupted(`Claude could not run: ${error instanceof Error ? error.message : String(error)}`)
          }
          break
        }
        case 'tool':
          allowed(step.name, step.input ?? {})
          break
      }
    }
    if (stopped()) return interrupted('Change stopped on request.')
    if (call.outcome === 'crash') return interrupted('Claude could not run: process crashed')

    // Résultat du SDK : total CUMULÉ de la session (une session reprise inclut les appels précédents).
    const total = { cost: previous.cost + callCost, tokens: addTokens(previous.tokens, callTokens) }
    sessions.set(sessionId, total)
    const spent = { sessionId, costUsd: total.cost, tokens: total.tokens, turns, apiTurns: turns, costKind: 'session' as const }
    const message = call.message ?? pending
    switch (call.outcome ?? 'ok') {
      case 'ok':
        return done({ ok: true, message, ...spent, error: null })
      case 'max-budget':
        return done({ ok: false, message: pending, ...spent, error: RESULT_ERRORS.error_max_budget_usd })
      case 'max-turns':
        return done({ ok: false, message: pending, ...spent, error: RESULT_ERRORS.error_max_turns })
      default:
        return done({ ok: false, message: pending, ...spent, error: call.error ?? RESULT_ERRORS.error_during_execution })
    }
  }) as FakeAgent
  Object.defineProperties(agent, { runs: { value: runs }, results: { value: results } })
  return agent
}

/** Scénarios prêts à l'emploi (un appel chacun, à combiner dans une liste). */
export const fakeScenarios = {
  /** Modifie un CSS (remplacement dans le fichier) puis conclut. */
  editCss: (file: string, find: string, replace: string, message = 'The title now uses the Title XL text style.'): FakeCall => ({
    steps: [{ kind: 'read', file }, { kind: 'edit', file, find, replace }, { kind: 'measure' }],
    message,
  }),
  /** Propose un texte Sanity. */
  setText: (field: string, value: string, message = 'The title is shorter: 1 line on mobile, as before.'): FakeCall => ({
    steps: [{ kind: 'set_text', field, value }, { kind: 'measure' }],
    message,
  }),
  /** Pose une question, puis enchaîne les étapes `then` (appliquer le choix du client). */
  ask: (questions: QuestionDraft[], then: FakeStep[] = [], message = 'Done as you chose.'): FakeCall => ({
    steps: [{ kind: 'ask', questions }, ...then],
    message,
  }),
  /** N'a rien modifié (déjà le cas, hors périmètre…). */
  nothingChanged: (message = 'The title already fits on one line on every screen: nothing was changed.'): FakeCall => ({ steps: [], message }),
  /** Le SDK rapporte une erreur d'exécution. */
  fails: (error = RESULT_ERRORS.error_during_execution): FakeCall => ({ outcome: 'error', error }),
  /** Plafond de budget du SDK atteint (coût de l'appel gardé). */
  overBudget: (costUsd = 1.52): FakeCall => ({ outcome: 'max-budget', costUsd }),
  /** Erreur d'accès fatale (ne pas tenter de 2e essai). */
  accessRefused: (): FakeCall => ({ outcome: 'fatal' }),
  /** Plante sans résultat (coût estimé de l'appel). */
  crash: (steps: FakeStep[] = []): FakeCall => ({ steps, outcome: 'crash' }),
  /**
   * Reprise au 2e essai : 1er appel = `first` (le moteur le refuse à ses contrôles), 2e appel (même session, `resume`) =
   * `second`, qui corrige. À passer tel quel comme script.
   */
  retryOnSecondAttempt: (first: FakeCall, second: FakeCall): FakeCall[] => [first, second],
}
