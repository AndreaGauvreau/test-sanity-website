import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { accessKind, readAgentSettings, resolveClaudeAccess, type AccessEnv, type AccessOptions } from './access'

// Valeurs factices : aucun vrai identifiant dans les tests.
const OAT = `sk-ant-oat01-${'x'.repeat(95)}`

describe('resolveClaudeAccess', () => {
  it('préfère la clé API au jeton d’abonnement', () => {
    const result = resolveClaudeAccess({ ANTHROPIC_API_KEY: 'sk-ant-api-test', CLAUDE_CODE_OAUTH_TOKEN: OAT }, { localMode: true })
    assert.deepEqual(result, { ok: true, access: { kind: 'api-key', secret: 'sk-ant-api-test' } })
  })

  it('accepte le jeton d’abonnement en mode local explicite (ENGINE_MODE=local), sans NODE_ENV', () => {
    const result = resolveClaudeAccess({ CLAUDE_CODE_OAUTH_TOKEN: `  ${OAT}  `, ENGINE_MODE: 'local' }, { localMode: true })
    assert.deepEqual(result, { ok: true, access: { kind: 'subscription', secret: OAT } })
    assert.equal(resolveClaudeAccess({ CLAUDE_CODE_OAUTH_TOKEN: OAT }, { localMode: true }).ok, true)
  })

  it('refuse le jeton d’abonnement hors mode local explicite, QUEL QUE SOIT NODE_ENV (AI-02)', () => {
    // process.env porte aussi NODE_ENV : il doit être sans effet.
    const cases: [AccessEnv & { NODE_ENV?: string }, AccessOptions][] = [
      // Régression AI-02 : hébergé + NODE_ENV=development (hérité du shell ou d'engine/.env.local) → refusé.
      [{ CLAUDE_CODE_OAUTH_TOKEN: OAT, NODE_ENV: 'development', ENGINE_MODE: 'hosted' }, { localMode: false }],
      [{ CLAUDE_CODE_OAUTH_TOKEN: OAT, NODE_ENV: 'development' }, { localMode: false }],
      [{ CLAUDE_CODE_OAUTH_TOKEN: OAT, NODE_ENV: 'development' }, {}],
      // Même si l'appelant se trompait de drapeau, ENGINE_MODE=hosted l'emporte.
      [{ CLAUDE_CODE_OAUTH_TOKEN: OAT, ENGINE_MODE: 'hosted' }, { localMode: true }],
      [{ CLAUDE_CODE_OAUTH_TOKEN: OAT, NODE_ENV: 'production' }, {}],
      [{ CLAUDE_CODE_OAUTH_TOKEN: OAT }, {}],
      [{ CLAUDE_CODE_OAUTH_TOKEN: OAT }, { localMode: false }],
    ]
    for (const [env, options] of cases) {
      const result = resolveClaudeAccess(env, options)
      assert.equal(result.ok, false, JSON.stringify({ ...env, CLAUDE_CODE_OAUTH_TOKEN: '…', ...options }))
      assert.match((result as { error: string }).error, /only accepted by a local engine/)
      assert.ok(!(result as { error: string }).error.includes(OAT))
    }
  })

  it('refuse un jeton d’abonnement collé à la place de la clé API', () => {
    const result = resolveClaudeAccess({ ANTHROPIC_API_KEY: OAT, CLAUDE_CODE_OAUTH_TOKEN: OAT }, { localMode: true })
    assert.equal(result.ok, false)
    assert.match((result as { error: string }).error, /move it to CLAUDE_CODE_OAUTH_TOKEN/)
  })

  it('recolle un jeton collé sur deux lignes, et signale un jeton coupé', () => {
    const half = Math.floor(OAT.length / 2)
    const twoLines = resolveClaudeAccess({ CLAUDE_CODE_OAUTH_TOKEN: `${OAT.slice(0, half)}\n${OAT.slice(half)}` }, { localMode: true })
    assert.deepEqual(twoLines, { ok: true, access: { kind: 'subscription', secret: OAT } })
    const cut = resolveClaudeAccess({ CLAUDE_CODE_OAUTH_TOKEN: OAT.slice(0, 60) }, { localMode: true })
    assert.equal(cut.ok, true)
    assert.match((cut as { warning?: string }).warning ?? '', /two lines/)
  })

  it('explique les deux options quand rien n’est configuré, sans jamais citer une valeur', () => {
    const result = resolveClaudeAccess({ ANTHROPIC_API_KEY: '  ', CLAUDE_CODE_OAUTH_TOKEN: '' })
    assert.equal(result.ok, false)
    const error = (result as { error: string }).error
    assert.match(error, /claude setup-token/)
    assert.match(error, /ANTHROPIC_API_KEY/)
    assert.equal(accessKind(null), 'none')
  })

  it('les messages d’erreur ne contiennent jamais le secret', () => {
    const result = resolveClaudeAccess({ ANTHROPIC_API_KEY: OAT })
    assert.ok(!JSON.stringify(result).includes(OAT.slice(12)))
  })
})

describe('readAgentSettings', () => {
  it('valeurs par défaut validées au POC', () => {
    assert.deepEqual(readAgentSettings({}, { configDir: '/tmp/engine/claude' }), {
      model: 'claude-opus-5-5',
      effort: 'medium',
      maxTurns: 24,
      maxBudgetUsd: 1.5,
      timeoutMs: 300_000,
      questionTimeoutMs: 900_000,
      toolTimeoutMs: 960_000,
      configDir: '/tmp/engine/claude',
    })
  })

  it('lit l’environnement et ignore les valeurs invalides', () => {
    const settings = readAgentSettings(
      { EDITOR_MODEL: 'claude-sonnet-5', EDITOR_EFFORT: 'turbo', EDITOR_MAX_TURNS: '-3', EDITOR_MAX_BUDGET_USD: '0.8' },
      { configDir: '/tmp/c' },
    )
    assert.equal(settings.model, 'claude-sonnet-5')
    assert.equal(settings.effort, 'medium')
    assert.equal(settings.maxTurns, 24)
    assert.equal(settings.maxBudgetUsd, 0.8)
    assert.equal(readAgentSettings({ EDITOR_EFFORT: 'high' }, { configDir: '/tmp/c' }).effort, 'high')
  })

  it('refuse un CLAUDE_CONFIG_DIR vide ou relatif (piège 5 du POC)', () => {
    assert.throws(() => readAgentSettings({}, { configDir: '' }), /absolute/)
    assert.throws(() => readAgentSettings({}, { configDir: 'claude' }), /absolute/)
  })
})
