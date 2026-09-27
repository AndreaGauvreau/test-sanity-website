import Anthropic from '@anthropic-ai/sdk'
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'vitest'
import type { QueryFn } from './agent'
import { complete, CompleteError, completeOptions, createComplete, transcriptPrompt, type CompleteDeps, type MessagesClient } from './complete'

// Identifiants factices : aucun appel réel à Claude.
const configDir = mkdtempSync(path.join(tmpdir(), 'kz-ask-'))
const API: CompleteDeps['access'] = { kind: 'api-key', secret: 'sk-ant-api-fake' }
const OAUTH: CompleteDeps['access'] = { kind: 'subscription', secret: 'sk-ant-oat-fake' }
const INPUT = {
  model: 'claude-haiku-4-5-20251001',
  system: 'You answer questions about the Conduit admin.',
  messages: [
    { role: 'user' as const, content: 'Where are my images?' },
    { role: 'assistant' as const, content: 'In Media.' },
    { role: 'user' as const, content: 'And the blog?' },
  ],
  maxTokens: 800,
}

/** Faux client de l'API Messages : garde les requêtes, renvoie une réponse ou lève une erreur. */
function fakeClient(reply: Partial<Anthropic.Message> | Error) {
  const bodies: Anthropic.MessageCreateParamsNonStreaming[] = []
  const keys: string[] = []
  const factory = (apiKey: string): MessagesClient => {
    keys.push(apiKey)
    return {
      messages: {
        create: async (body) => {
          bodies.push(body)
          if (reply instanceof Error) throw reply
          return {
            content: [{ type: 'text', text: ' In CMS › Blog. ', citations: null }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 2000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
            ...reply,
          } as Anthropic.Message
        },
      },
    }
  }
  return { factory, bodies, keys }
}

describe('complete — clé API : API Messages', () => {
  it('système mis en cache, historique en messages, texte et Usage du contrat chiffré aux tarifs', async () => {
    const { factory, bodies, keys } = fakeClient({})
    let clock = 1000
    const result = await complete(INPUT, { access: API, configDir, anthropic: factory, now: () => (clock += 400) })
    assert.deepEqual(keys, ['sk-ant-api-fake'])
    assert.deepEqual(bodies[0], {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: [{ type: 'text', text: INPUT.system, cache_control: { type: 'ephemeral' } }],
      messages: INPUT.messages,
    })
    assert.equal(result.text, 'In CMS › Blog.')
    assert.equal(result.stopReason, 'end_turn')
    assert.deepEqual(result.usage, {
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 2000,
      outputTokens: 1000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0.007,
      costKind: 'billed',
      access: 'api-key',
      durationMs: 400,
      turns: 1,
    })
  })

  it('jetons de cache comptés dans l’entrée (contrat) et au bon tarif', async () => {
    const { factory } = fakeClient({
      usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 4000, cache_creation_input_tokens: 1000 } as Anthropic.Usage,
    })
    const result = await complete(INPUT, { access: API, configDir, anthropic: factory })
    assert.equal(result.usage.inputTokens, 5100)
    // 100 × 1 + 4000 × 0.1 + 1000 × 1.25, par million (Haiku 4.5).
    assert.equal(result.usage.costUsd, Math.round(((100 + 400 + 1250) / 1_000_000) * 10_000) / 10_000)
  })

  it('erreurs typées du SDK → message clair, fatal pour l’accès, jamais le secret', async () => {
    const auth = new Anthropic.AuthenticationError(401, { type: 'error' }, 'invalid x-api-key', new Headers())
    const error = await complete(INPUT, { access: API, configDir, anthropic: fakeClient(auth).factory }).catch((e: unknown) => e)
    assert.ok(error instanceof CompleteError)
    assert.equal(error.fatal, true)
    assert.match(error.message, /check the ANTHROPIC_API_KEY/)
    assert.ok(!error.message.includes('sk-ant-api-fake'))
    const busy = new Anthropic.RateLimitError(429, { type: 'error' }, 'rate', new Headers())
    const limited = await complete(INPUT, { access: API, configDir, anthropic: fakeClient(busy).factory }).catch((e: unknown) => e as CompleteError)
    assert.ok(limited instanceof CompleteError)
    assert.equal(limited.fatal, false)
    assert.match(limited.message, /rate limit/)
  })

  it('refuse une conversation qui ne finit pas par l’utilisateur, ou un plafond invalide', async () => {
    const { factory, bodies } = fakeClient({})
    const run = createComplete({ access: API, configDir, anthropic: factory })
    await assert.rejects(run({ ...INPUT, messages: INPUT.messages.slice(0, 2) }), /last message must be the user/)
    await assert.rejects(run({ ...INPUT, messages: [] }), /last message must be the user/)
    await assert.rejects(run({ ...INPUT, maxTokens: 0 }), /maxTokens/)
    assert.equal(bodies.length, 0)
  })
})

describe('complete — abonnement : Agent SDK sans aucun outil', () => {
  const success = (over: Record<string, unknown> = {}) =>
    ({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'In CMS › Blog.',
      total_cost_usd: 0.004,
      num_turns: 1,
      modelUsage: { 'claude-haiku-4-5-20251001': { inputTokens: 1500, outputTokens: 300, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
      session_id: 's',
      ...over,
    }) as unknown as SDKMessage

  function scripted(messages: SDKMessage[]) {
    const calls: { prompt: string; options: Options }[] = []
    const query: QueryFn = (args) => {
      calls.push(args)
      return (async function* () {
        for (const message of messages) yield message
      })()
    }
    return { query, calls }
  }

  it('options exactes : aucun outil, aucune configuration de la machine, 1 tour, env minimal', () => {
    const options = completeOptions(INPUT, { access: OAUTH, configDir, base: { PATH: '/usr/bin', HOME: '/h', SECRET: 'x' } }, new AbortController())
    assert.deepEqual(options.tools, [])
    assert.deepEqual(options.allowedTools, [])
    assert.deepEqual(options.settingSources, [])
    assert.deepEqual(options.mcpServers, {})
    assert.equal(options.strictMcpConfig, true)
    assert.equal(options.maxTurns, 1)
    assert.equal(options.permissionMode, 'dontAsk')
    assert.equal(options.persistSession, false)
    assert.equal(options.systemPrompt, INPUT.system, 'prompt personnalisé, pas le preset Claude Code')
    assert.equal(options.hooks?.PreToolUse?.[0].matcher, undefined)
    assert.deepEqual(options.env, {
      PATH: '/usr/bin',
      HOME: '/h',
      CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-fake',
      CLAUDE_CONFIG_DIR: configDir,
      CLAUDE_AGENT_SDK_CLIENT_APP: 'kuartz-ask-ai/0.1',
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: '800',
    })
  })

  it('le hook refuse tout outil', async () => {
    const options = completeOptions(INPUT, { access: OAUTH, configDir }, new AbortController())
    const hook = options.hooks!.PreToolUse![0].hooks[0]
    const output = (await hook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {} } as never, 't', {
      signal: new AbortController().signal,
    })) as { hookSpecificOutput: { permissionDecision: string } }
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny')
  })

  it('historique en transcription, texte du résultat, Usage de la session (abonnement)', async () => {
    const { query, calls } = scripted([success()])
    const result = await complete(INPUT, { access: OAUTH, configDir, query, now: () => 0 })
    assert.equal(calls[0].prompt, transcriptPrompt(INPUT.messages))
    assert.match(calls[0].prompt, /User: Where are my images\?\n\nAssistant: In Media\.\n\nAnswer this last message from the user:\nAnd the blog\?$/)
    assert.equal(result.text, 'In CMS › Blog.')
    assert.equal(result.usage.access, 'subscription')
    assert.equal(result.usage.costUsd, 0.004)
    assert.equal(result.usage.inputTokens, 1500)
    assert.equal(transcriptPrompt([INPUT.messages[0]]), 'Where are my images?')
  })

  it('erreur d’accès (flux) → CompleteError fatale ; résultat en erreur → message clair', async () => {
    const auth = { type: 'system', subtype: 'api_retry', error: 'authentication_failed', attempt: 1, max_retries: 10 } as unknown as SDKMessage
    const fatal = await complete(INPUT, { access: OAUTH, configDir, query: scripted([auth, success()]).query }).catch((e: unknown) => e as CompleteError)
    assert.ok(fatal instanceof CompleteError)
    assert.equal(fatal.fatal, true)
    assert.match(fatal.message, /claude setup-token/)
    const turns = success({ subtype: 'error_max_turns', is_error: true })
    await assert.rejects(complete(INPUT, { access: OAUTH, configDir, query: scripted([turns]).query }), /maximum number of steps/)
    await assert.rejects(complete(INPUT, { access: OAUTH, configDir, query: scripted([]).query }), /without an answer/)
  })

  it('refuse un CLAUDE_CONFIG_DIR relatif', async () => {
    await assert.rejects(complete(INPUT, { access: OAUTH, configDir: 'claude', query: scripted([success()]).query }), /absolute/)
  })
})
