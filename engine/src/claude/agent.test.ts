import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'vitest'
import type { AgentSettings, ClaudeCredential } from './access'
import { agentEnv, createAgentClock, createAgentRunner, describeTool, fatalApiError, type AgentEvent, type AgentRun, type QueryFn } from './agent'
import { ALLOWED_TOOLS } from './names'

const configDir = mkdtempSync(path.join(tmpdir(), 'kz-claude-'))
const SETTINGS: AgentSettings = {
  model: 'claude-opus-5-5',
  effort: 'medium',
  maxTurns: 24,
  maxBudgetUsd: 1.5,
  timeoutMs: 300_000,
  questionTimeoutMs: 900_000,
  toolTimeoutMs: 960_000,
  configDir,
}
// Identifiants factices : aucun appel réel.
const API_KEY: ClaudeCredential = { kind: 'api-key', secret: 'sk-ant-api-fake' }
const OAUTH: ClaudeCredential = { kind: 'subscription', secret: 'sk-ant-oat-fake' }
const cwd = '/ws/repo'

const run = (over: Partial<AgentRun> = {}, events: AgentEvent[] = []): AgentRun => ({
  prompt: 'Change the hero title.',
  cwd,
  toolAccess: { files: ['src/components/sections/Hero/Hero.module.css'], textTool: true },
  systemAppend: 'SYSTEM APPEND',
  access: API_KEY,
  signal: new AbortController().signal,
  onEvent: (event) => events.push(event),
  ...over,
})

// ─── Faux messages du SDK ─────────────────────────────────────────────────────
const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 })
const assistant = (id: string, content: unknown[], error?: string) =>
  ({ type: 'assistant', message: { id, content, usage: usage(100, 20) }, session_id: 's1', ...(error ? { error } : {}) }) as unknown as SDKMessage
const success = (over: Record<string, unknown> = {}) =>
  ({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Done: the title is shorter.',
    total_cost_usd: 0.07,
    num_turns: 3,
    modelUsage: { 'claude-opus-5-5': { inputTokens: 300, outputTokens: 60, cacheReadInputTokens: 4000, cacheCreationInputTokens: 500 } },
    session_id: 's1',
    ...over,
  }) as unknown as SDKMessage
const retry = (error: string) =>
  ({ type: 'system', subtype: 'api_retry', error, attempt: 1, max_retries: 10, retry_delay_ms: 1, error_status: 500, session_id: 's1' }) as unknown as SDKMessage

/** Faux query() : rejoue une liste de messages et garde les options reçues. */
function scripted(messages: SDKMessage[], after?: (options: Options) => Promise<void>) {
  const calls: { prompt: string; options: Options }[] = []
  const query: QueryFn = (args) => {
    calls.push(args)
    return (async function* () {
      for (const message of messages) yield message
      if (after) await after(args.options)
    })()
  }
  return { query, calls }
}

describe('createAgentRunner — options de query() (validées au POC)', () => {
  it('passe exactement les options attendues', async () => {
    const { query, calls } = scripted([success()])
    await createAgentRunner(SETTINGS, { query })(run({ resume: 'prev-session' }))
    const options = calls[0].options
    assert.equal(calls[0].prompt, 'Change the hero title.')
    assert.equal(options.cwd, cwd)
    assert.equal(options.model, 'claude-opus-5-5')
    assert.equal(options.effort, 'medium')
    assert.equal(options.maxTurns, 24)
    assert.equal(options.maxBudgetUsd, 1.5)
    assert.deepEqual(options.tools, ['Read', 'Edit', 'Glob', 'Grep'])
    assert.deepEqual(options.allowedTools, [...ALLOWED_TOOLS])
    assert.equal(options.permissionMode, 'dontAsk')
    assert.deepEqual(options.settingSources, [])
    assert.equal(options.strictMcpConfig, true)
    assert.deepEqual(Object.keys(options.mcpServers ?? {}), ['kuartz'])
    assert.deepEqual(options.systemPrompt, { type: 'preset', preset: 'claude_code', append: 'SYSTEM APPEND', excludeDynamicSections: true })
    assert.equal(options.hooks?.PreToolUse?.length, 1)
    assert.equal(options.hooks?.PreToolUse?.[0].matcher, undefined, 'sans matcher : tous les outils')
    assert.equal(options.resume, 'prev-session')
    assert.ok(options.abortController instanceof AbortController)
    assert.equal(options.disallowedTools, undefined)
    // Aucune autre option (ni canUseTool, ni continue, ni plugins…).
    assert.deepEqual(Object.keys(options).sort(), [
      'abortController', 'allowedTools', 'cwd', 'effort', 'env', 'hooks', 'maxBudgetUsd', 'maxTurns', 'mcpServers', 'model',
      'permissionMode', 'resume', 'settingSources', 'strictMcpConfig', 'systemPrompt', 'tools',
    ])
  })

  it('serveur kuartz : outils toujours chargés, délai d’outil couvrant la question', async () => {
    const { query, calls } = scripted([success()])
    await createAgentRunner(SETTINGS, { query })(run())
    const server = calls[0].options.mcpServers?.kuartz as { type: string; name: string }
    assert.equal(server.type, 'sdk')
    assert.equal(server.name, 'kuartz')
  })

  it('environnement minimal : un seul identifiant, jamais process.env', () => {
    const base = { PATH: '/usr/bin', HOME: '/home/u', ANTHROPIC_API_KEY: 'leak', SANITY_API_WRITE_TOKEN: 'leak', ENGINE_SECRET: 'leak' }
    assert.deepEqual(agentEnv(SETTINGS, API_KEY, base), {
      PATH: '/usr/bin',
      HOME: '/home/u',
      ANTHROPIC_API_KEY: 'sk-ant-api-fake',
      CLAUDE_CONFIG_DIR: configDir,
      CLAUDE_AGENT_SDK_CLIENT_APP: 'kuartz-ai-editor/0.1',
      MCP_TOOL_TIMEOUT: '960000',
    })
    const sub = agentEnv(SETTINGS, OAUTH, base)
    assert.equal(sub.CLAUDE_CODE_OAUTH_TOKEN, 'sk-ant-oat-fake')
    assert.equal('ANTHROPIC_API_KEY' in sub, false)
  })

  it('le hook refuse un outil hors liste et le signale dans l’activité', async () => {
    const events: AgentEvent[] = []
    const { query, calls } = scripted([success()])
    await createAgentRunner(SETTINGS, { query })(run({}, events))
    const guard = calls[0].options.hooks!.PreToolUse![0].hooks[0]
    const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cat .env' } }
    const denied = (await guard(input as never, 'tool-1', { signal: new AbortController().signal })) as {
      hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason: string }
    }
    assert.equal(denied.hookSpecificOutput?.permissionDecision, 'deny')
    assert.match(denied.hookSpecificOutput?.permissionDecisionReason ?? '', /Bash/)
    assert.equal(events.at(-1)?.kind, 'warn')
    const allowed = await guard(
      { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: `${cwd}/src/components/sections/Hero/Hero.tsx` } } as never,
      'tool-2',
      { signal: new AbortController().signal },
    )
    assert.deepEqual(allowed, {})
  })

  it('refuse un dossier de travail vide ou relatif', async () => {
    const { query, calls } = scripted([success()])
    const result = await createAgentRunner(SETTINGS, { query })(run({ cwd: '' }))
    assert.equal(result.ok, false)
    assert.equal(result.fatal, true)
    assert.equal(calls.length, 0)
  })
})

describe('createAgentRunner — lecture du flux', () => {
  it('succès : message final, coût de session, jetons de modelUsage, journal', async () => {
    const events: AgentEvent[] = []
    const { query } = scripted([
      assistant('m1', [{ type: 'text', text: 'Let me look.' }, { type: 'tool_use', name: 'Read', input: { file_path: `${cwd}/src/components/sections/Hero/Hero.tsx` } }]),
      assistant('m2', [{ type: 'tool_use', name: 'mcp__kuartz__set_text', input: { field: 'dockSchedulingPage:hero.title', value: 'x' } }]),
      assistant('m3', [{ type: 'text', text: 'Done: the title is shorter.' }]),
      success(),
    ])
    const result = await createAgentRunner(SETTINGS, { query })(run({}, events))
    assert.deepEqual(result, {
      ok: true,
      message: 'Done: the title is shorter.',
      sessionId: 's1',
      costUsd: 0.07,
      tokens: { input: 300, output: 60, cacheRead: 4000, cacheWrite: 500 },
      turns: 3,
      apiTurns: 3,
      costKind: 'session',
      error: null,
    })
    assert.deepEqual(events, [
      { kind: 'info', label: 'Let me look.' },
      { kind: 'read', label: 'Reading Hero/Hero.tsx' },
      { kind: 'text', label: 'New text for dockSchedulingPage:hero.title' },
    ])
  })

  it('journal : les textes intermédiaires de Claude et les motifs de recherche passent par le filtre d’adresses (SEC-08)', async () => {
    const events: AgentEvent[] = []
    const { query } = scripted([
      assistant('m1', [
        { type: 'text', text: 'Please sign in again at conduit-billing.help/login first.' },
        { type: 'tool_use', name: 'Grep', input: { pattern: 'evil.help', path: `${cwd}/src/components` } },
      ]),
      assistant('m2', [{ type: 'text', text: 'Same as conduit.com. Done.' }]),
      success(),
    ])
    await createAgentRunner(SETTINGS, { query })(run({ allowedDomains: ['conduit.com'] }, events))
    assert.deepEqual(events, [
      { kind: 'info', label: 'Please sign in again at [link removed] first.' },
      { kind: 'read', label: 'Searching “[link removed]”' },
    ])
    assert.deepEqual(describeTool(cwd, 'Glob', { pattern: 'https://evil.help/*.css' }), { kind: 'read', label: 'Looking for files [link removed]' })
    // Un id de champ garde ses points ; un « champ » qui est une phrase est filtré.
    const field = 'features.items[_key=="a1"].title'
    assert.deepEqual(describeTool(cwd, 'mcp__kuartz__set_text', { field: `post-1:${field}` }), { kind: 'text', label: `New text for post-1:${field}` })
    assert.deepEqual(describeTool(cwd, 'mcp__kuartz__set_text', { field: 'Sign in at evil.help' }), { kind: 'text', label: 'New text for Sign in at [link removed]' })
  })

  it('erreur de résultat (budget, tours) : message clair, coût gardé', async () => {
    const { query } = scripted([success({ subtype: 'error_max_budget_usd', is_error: true, result: undefined, total_cost_usd: 1.52 })])
    const result = await createAgentRunner(SETTINGS, { query })(run())
    assert.equal(result.ok, false)
    assert.equal(result.error, 'The maximum budget per change was reached.')
    assert.equal(result.costUsd, 1.52)
    assert.equal(result.costKind, 'session')
  })

  it('erreur fatale (authentification) : arrêt immédiat, fatal, coût estimé de l’appel', async () => {
    const { query } = scripted([assistant('m1', [{ type: 'text', text: 'Reading…' }]), retry('authentication_failed'), success()])
    const result = await createAgentRunner(SETTINGS, { query })(run())
    assert.equal(result.ok, false)
    assert.equal(result.fatal, true)
    assert.match(result.error ?? '', /Access refused by Anthropic: check the API key/)
    assert.equal(result.costKind, 'call')
    assert.equal(result.tokens.input, 100)
    // 100 × 4 + 20 × 20 + 1000 × 0.2 (lecture de cache), par million.
    assert.equal(result.costUsd, (100 * 4 + 20 * 20 + 1000 * 0.2) / 1_000_000)
  })

  it('nouvel essai d’API non fatal : avertissement et on continue', async () => {
    const events: AgentEvent[] = []
    const { query } = scripted([retry('overloaded'), success()])
    const result = await createAgentRunner(SETTINGS, { query })(run({}, events))
    assert.equal(result.ok, true)
    assert.match(events[0].label, /retry 1\/10/)
  })

  it('rate_limit : fatal avec l’abonnement seulement', () => {
    assert.equal(fatalApiError('rate_limit', API_KEY), null)
    assert.match(String(fatalApiError('rate_limit', OAUTH)), /Usage limit/)
    assert.match(String(fatalApiError('authentication_failed', OAUTH)), /claude setup-token/)
    assert.equal(fatalApiError('overloaded', API_KEY), null)
  })

  it('connexion de la machine (abonnement sans secret) : marche à suivre /login, limite d’usage fatale', () => {
    const machine = { kind: 'subscription' as const, secret: null, machineLogin: { storageDir: '' } }
    assert.match(String(fatalApiError('authentication_failed', machine)), /run claude in a terminal, then \/login/)
    assert.match(String(fatalApiError('rate_limit', machine)), /Usage limit/)
  })

  it('env de la connexion de la machine : aucun identifiant, CLAUDE_CONFIG_DIR dédié gardé, trousseau par défaut', () => {
    const machine = { kind: 'subscription' as const, secret: null, machineLogin: { storageDir: '' } }
    const base = { PATH: '/usr/bin', HOME: '/home/u', USER: 'u', ANTHROPIC_API_KEY: 'leak', CLAUDE_CODE_OAUTH_TOKEN: 'leak', ENGINE_SECRET: 'leak' }
    assert.deepEqual(agentEnv(SETTINGS, machine, base), {
      PATH: '/usr/bin',
      HOME: '/home/u',
      USER: 'u',
      CLAUDE_SECURESTORAGE_CONFIG_DIR: '',
      CLAUDE_CONFIG_DIR: configDir,
      CLAUDE_AGENT_SDK_CLIENT_APP: 'kuartz-ai-editor/0.1',
      MCP_TOOL_TIMEOUT: '960000',
    })
  })

  it('appel interrompu (exception) : coût estimé, dédoublonné par message.id', async () => {
    const query: QueryFn = () =>
      (async function* () {
        yield assistant('m1', [{ type: 'text', text: 'Part 1' }])
        yield assistant('m1', [{ type: 'tool_use', name: 'Edit', input: { file_path: `${cwd}/x.css` } }])
        throw new Error('process crashed')
      })()
    const result = await createAgentRunner(SETTINGS, { query })(run())
    assert.equal(result.ok, false)
    assert.equal(result.costKind, 'call')
    assert.equal(result.apiTurns, 1)
    assert.match(result.error ?? '', /Claude could not run: process crashed/)
  })

  it('Stop demandé : arrêt propre, processus coupé', async () => {
    const stop = new AbortController()
    let aborted = false
    const query: QueryFn = ({ options }) =>
      (async function* () {
        yield assistant('m1', [{ type: 'text', text: 'Working…' }])
        stop.abort()
        await new Promise((resolve) => setTimeout(resolve, 5))
        aborted = options.abortController!.signal.aborted
        throw new Error('aborted')
      })()
    const result = await createAgentRunner(SETTINGS, { query })(run({ signal: stop.signal }))
    assert.equal(aborted, true)
    assert.equal(result.error, 'Change stopped on request.')
  })

  it('délai dépassé : arrêt avec le délai dans le message', async () => {
    const query: QueryFn = ({ options }) =>
      (async function* () {
        await new Promise((resolve) => options.abortController!.signal.addEventListener('abort', resolve))
        throw new Error('aborted')
      })() as AsyncIterable<SDKMessage>
    const result = await createAgentRunner({ ...SETTINGS, timeoutMs: 20 }, { query })(run())
    assert.match(result.error ?? '', /did not finish within 0 s/)
  })

  it('sans résultat du SDK : échec explicite', async () => {
    const { query } = scripted([assistant('m1', [{ type: 'text', text: 'Hmm' }])])
    const result = await createAgentRunner(SETTINGS, { query })(run())
    assert.equal(result.error, 'Claude stopped without a result.')
    assert.equal(result.message, 'Hmm')
  })
})

describe('describeTool', () => {
  it('libellés en anglais, mesure et question journalisées par le moteur', () => {
    assert.deepEqual(describeTool(cwd, 'Edit', { file_path: `${cwd}/src/a/Hero.module.css` }), { kind: 'edit', label: 'Editing a/Hero.module.css' })
    assert.deepEqual(describeTool(cwd, 'Grep', { pattern: 'data-edit' }), { kind: 'read', label: 'Searching “data-edit”' })
    assert.equal(describeTool(cwd, 'mcp__kuartz__measure', {}), null)
    assert.equal(describeTool(cwd, 'mcp__kuartz__ask_client', {}), null)
    assert.deepEqual(describeTool(cwd, 'Bash', {}), { kind: 'warn', label: 'Tool requested: Bash' })
  })
})

describe('createAgentClock — pauseClock pendant ask_client', () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  it('le temps d’attente du client ne compte pas ; après la réponse, au moins minResumeMs pour finir', async () => {
    let expired = false
    const clock = createAgentClock(40, () => (expired = true), 60)
    await clock.pauseClock(() => sleep(80))
    assert.equal(expired, false, 'la question a duré plus que le délai, sans l’épuiser')
    await sleep(30)
    assert.equal(expired, false, 'au moins 60 ms après la réponse')
    await sleep(50)
    assert.equal(expired, true)
    clock.stop()
  })

  it('sans pause, le délai coupe ; stop() l’annule pour de bon, même après une pause', async () => {
    let expired = 0
    const clock = createAgentClock(10, () => expired++, 10)
    await sleep(25)
    assert.equal(expired, 1)
    const stopped = createAgentClock(10, () => expired++, 10)
    stopped.stop()
    await stopped.pauseClock(async () => undefined)
    await sleep(25)
    assert.equal(expired, 1)
    clock.stop()
  })
})
