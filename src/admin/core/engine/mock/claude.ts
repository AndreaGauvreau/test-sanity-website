import {
  aiSettingsProblem,
  claudeApiKeyProblem,
  DEFAULT_AI_SETTINGS,
  claudeKeyHint,
  cleanClaudeApiKey,
  type AiSettings,
  type AiSettingsState,
  type ClaudeAccessState,
  type ClaudeAccessTest,
} from '../../contracts/engine'
import { engineErrorBody } from '../errors'
import type { MockEngineResponse, MockHandler } from './types'

/**
 * Connexion à Claude SIMULÉE (routes `/claude/access*`, ENGINE_MOCK=1, jamais en production) — propriétaire : code-usage
 * (carte « Claude connection » de B5). Mêmes règles que le vrai moteur (`engine/src/access`) : clé validée par
 * `claudeApiKeyProblem` du contrat, jamais renvoyée (seulement `keyHint`), abonnement refusé hors mode local.
 *
 * Scénario (`ENGINE_MOCK_CLAUDE`, lu à la première requête) : `local` (défaut : moteur local, machine connectée),
 * `logged-out` (moteur local, machine NON connectée à Claude), `hosted` (moteur hébergé : clé API seulement),
 * `env-key` (ANTHROPIC_API_KEY dans l'environnement du moteur, prioritaire).
 * Test simulé : une clé qui se termine par « FAIL0 » échoue (« invalid API key ») ; le reste réussit.
 * Aucun secret n'est gardé : seulement l'indice et un drapeau « échoue au test ».
 *
 * Réglages de l'IA (routes `/claude/settings`, carte « AI settings ») : mêmes règles que le moteur (validation STRICTE
 * `aiSettingsProblem` du contrat → 400), valeurs par défaut du contrat (Opus 5.5 / medium), Ask AI sur Haiku 4.5.
 * Un modèle « Fable 5.1 » + effort « max » enregistré avec `ENGINE_MOCK_CLAUDE_SETTINGS=fail` échoue (500 simulé)
 * pour voir l'erreur de l'écran.
 */

type Scenario = 'local' | 'logged-out' | 'hosted' | 'env-key'

type MockWorld = {
  scenario: Scenario
  saved: 'api-key' | 'subscription' | null
  hint: string | null
  failing: boolean
  lastTest?: ClaudeAccessTest
  /** Réglages de l'IA enregistrés (null = valeurs par défaut). */
  ai: { settings: AiSettings; updatedAt: string } | null
}

const KEY = Symbol.for('kuartz.mock.claude')
const holder = globalThis as unknown as Record<symbol, MockWorld | undefined>

function scenarioOf(value: string | undefined): Scenario {
  return value === 'logged-out' || value === 'hosted' || value === 'env-key' ? value : 'local'
}

function world(): MockWorld {
  return (holder[KEY] ??= { scenario: scenarioOf(process.env.ENGINE_MOCK_CLAUDE), saved: null, hint: null, failing: false, ai: null })
}

/** Remise à zéro (tests). */
export function resetClaudeMock(scenario?: Scenario): void {
  holder[KEY] = { scenario: scenario ?? scenarioOf(process.env.ENGINE_MOCK_CLAUDE), saved: null, hint: null, failing: false, ai: null }
}

export function mockClaudeState(): ClaudeAccessState {
  const w = world()
  const local = w.scenario !== 'hosted'
  const loggedIn = w.scenario !== 'logged-out'
  const base = {
    mode: local ? ('local' as const) : ('hosted' as const),
    subscriptionAllowed: local,
    saved: w.saved,
    envApiKey: w.scenario === 'env-key',
    ...(local ? { machine: { loggedIn } } : {}),
    ...(w.lastTest ? { lastTest: w.lastTest } : {}),
  }
  if (w.scenario === 'env-key') return { ...base, access: 'api-key', source: 'env', keyHint: 'sk-ant-…9Q2x' }
  if (w.saved === 'api-key' && w.hint) return { ...base, access: 'api-key', source: 'stored', keyHint: w.hint }
  if (w.saved === 'subscription' && local && loggedIn) return { ...base, access: 'subscription', source: 'machine' }
  const problem =
    w.saved === 'subscription' && local
      ? 'This computer isn’t signed in to Claude. Open a terminal, run `claude`, then type /login.'
      : 'No Claude access is configured yet.'
  return { ...base, access: 'none', source: 'none', problem }
}

export const MOCK_ASK_MODEL = 'claude-haiku-4-5'

export function mockAiSettingsState(): AiSettingsState {
  const { ai } = world()
  return {
    current: { ...(ai?.settings ?? DEFAULT_AI_SETTINGS) },
    defaults: { ...DEFAULT_AI_SETTINGS },
    source: ai ? 'saved' : 'default',
    ...(ai ? { updatedAt: ai.updatedAt } : {}),
    askModel: MOCK_ASK_MODEL,
  }
}

const ok = (): MockEngineResponse => ({ status: 200, json: mockClaudeState() })
const refuse = (status: number, code: 'bad_request' | 'forbidden', message: string): MockEngineResponse => ({
  status,
  json: engineErrorBody(code, message),
})

export const handleClaude: MockHandler = async (request) => {
  const w = world()
  const action = request.segments.slice(1).join('/')
  if (request.method === 'GET' && action === 'access') return ok()
  if (action === 'settings') {
    if (request.method === 'GET') return { status: 200, json: mockAiSettingsState() }
    const problem = aiSettingsProblem(request.body)
    if (problem) return refuse(400, 'bad_request', problem)
    const { model, effort } = request.body as AiSettings
    if (process.env.ENGINE_MOCK_CLAUDE_SETTINGS === 'fail' && model === 'claude-fable-5-1' && effort === 'max') {
      return { status: 500, json: engineErrorBody('internal', 'The AI engine couldn’t save the AI settings. Try again.') }
    }
    w.ai = { settings: { model, effort }, updatedAt: new Date().toISOString() }
    return { status: 200, json: mockAiSettingsState() }
  }
  if (request.method !== 'POST') return refuse(400, 'bad_request', 'Unknown route.')

  if (action === 'access') {
    const body = (request.body ?? {}) as { kind?: unknown; apiKey?: unknown }
    if (body.kind === 'subscription') {
      if (w.scenario === 'hosted') return refuse(403, 'forbidden', 'The Claude subscription only works with a local AI engine. Use an API key.')
      Object.assign(w, { saved: 'subscription', hint: null, failing: false, lastTest: undefined })
      return ok()
    }
    if (body.kind === 'api-key' && typeof body.apiKey === 'string') {
      const problem = claudeApiKeyProblem(body.apiKey)
      if (problem) return refuse(400, 'bad_request', problem)
      const key = cleanClaudeApiKey(body.apiKey)
      Object.assign(w, { saved: 'api-key', hint: claudeKeyHint(key), failing: key.endsWith('FAIL0'), lastTest: undefined })
      return ok()
    }
    return refuse(400, 'bad_request', 'Choose an API key or the Claude subscription.')
  }
  if (action === 'access/clear') {
    Object.assign(w, { saved: null, hint: null, failing: false, lastTest: undefined })
    return ok()
  }
  if (action === 'access/test') {
    await new Promise((resolve) => setTimeout(resolve, 600))
    const state = mockClaudeState()
    const at = new Date().toISOString()
    if (state.access === 'none') w.lastTest = { at, ok: false, message: state.problem ?? 'No Claude access is configured yet.' }
    else if (state.source === 'stored' && w.failing) w.lastTest = { at, ok: false, message: 'Invalid API key: Anthropic refused it. Check the key or create a new one.' }
    else w.lastTest = { at, ok: true, message: state.access === 'api-key' ? 'Connected — the API key was accepted by Anthropic.' : 'Connected — Claude answered with your subscription.' }
    return ok()
  }
  return refuse(400, 'bad_request', 'Unknown route.')
}
