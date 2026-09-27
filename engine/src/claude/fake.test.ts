import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import { loadDesignSystem } from '../guards/design-system'
import { lintContextFor } from '../guards/guards'
import type { ToolAccess } from '../guards/types'
import type { AgentEvent, AgentRun } from './agent'
import { addCall, EMPTY_COST, totalCost } from './cost'
import { applyEdit, createFakeAgent, fakeScenarios } from './fake'
import type { QuestionDraft } from './questions'

const css = 'src/components/sections/Hero/Hero.module.css'

function workspace() {
  const cwd = mkdtempSync(path.join(tmpdir(), 'kz-fake-'))
  mkdirSync(path.join(cwd, 'src/components/sections/Hero'), { recursive: true })
  writeFileSync(path.join(cwd, css), '.title {\n  font: var(--text-title-lg);\n}\n')
  writeFileSync(path.join(cwd, '.env.local'), 'SECRET=1\n')
  return cwd
}

const run = (cwd: string, over: Partial<AgentRun> = {}, events: AgentEvent[] = []): AgentRun => ({
  prompt: 'Make the title bigger.',
  cwd,
  toolAccess: { files: [css], textTool: true },
  systemAppend: 'SYSTEM',
  access: { kind: 'api-key', secret: 'fake' },
  signal: new AbortController().signal,
  onEvent: (event) => events.push(event),
  ...over,
})

const QUESTION: QuestionDraft[] = [
  {
    question: 'Which size?',
    options: [
      { label: 'Title XL', tone: 'recommended' },
      { label: 'Leave it', tone: 'neutral' },
    ],
  },
]

describe('faux Claude — outils réels, hook réel', () => {
  it('modifie un CSS du périmètre (fichier réellement écrit), journal comme le vrai', async () => {
    const cwd = workspace()
    const events: AgentEvent[] = []
    const agent = createFakeAgent([fakeScenarios.editCss(css, 'var(--text-title-lg)', 'var(--text-title-xl)')])
    const result = await agent(run(cwd, {}, events))
    assert.equal(result.ok, true)
    assert.match(readFileSync(path.join(cwd, css), 'utf8'), /var\(--text-title-xl\)/)
    assert.deepEqual(events.map((event) => event.kind), ['read', 'edit'])
    assert.equal(result.sessionId, 'fake-session-1')
    assert.equal(result.costKind, 'session')
    assert.equal(agent.runs.length, 1)
  })

  it('le hook d’engine-guards refuse : édition hors périmètre, secret, shell', async () => {
    const cwd = workspace()
    const events: AgentEvent[] = []
    const agent = createFakeAgent([
      {
        steps: [
          { kind: 'edit', file: 'src/components/sections/Other/Other.module.css', content: 'x' },
          { kind: 'read', file: '.env.local' },
          { kind: 'tool', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    ])
    await agent(run(cwd, {}, events))
    // 3 refus du hook, plus « Tool requested: Bash » (describeTool, comme le vrai runner).
    assert.equal(events.filter((event) => event.kind === 'warn').length, 4)
    assert.ok(!existsSync(path.join(cwd, 'src/components/sections/Other/Other.module.css')), 'rien écrit hors périmètre')
  })

  it('set_text passe par le gestionnaire injecté ; son refus revient dans le journal', async () => {
    const seen: [string, string][] = []
    const events: AgentEvent[] = []
    const agent = createFakeAgent([fakeScenarios.setText('dockSchedulingPage:hero.title', 'Dock scheduling, simplified')])
    const textTool = { onSet: async (field: string, value: string) => (seen.push([field, value]), value.length > 10 ? null : 'Too short.') }
    await agent(run(workspace(), { textTool }, events))
    assert.deepEqual(seen, [['dockSchedulingPage:hero.title', 'Dock scheduling, simplified']])
    // Sans T : le hook refuse set_text avant le gestionnaire.
    const denied = createFakeAgent([fakeScenarios.setText('x', 'y')])
    const deniedEvents: AgentEvent[] = []
    await denied(run(workspace(), { toolAccess: { files: [], textTool: false }, textTool }, deniedEvents))
    assert.equal(seen.length, 1)
    assert.equal(deniedEvents.at(-1)?.kind, 'warn')
  })

  it('pose une question et attend la réponse avant de continuer', async () => {
    const cwd = workspace()
    const order: string[] = []
    const askTool = {
      ask: async () => {
        order.push('asked')
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push('answered')
        return { answer: 'Client’s answer: Title XL' }
      },
    }
    const agent = createFakeAgent([fakeScenarios.ask(QUESTION, [{ kind: 'edit', file: css, find: '-lg', replace: '-xl' }])])
    const result = await agent(run(cwd, { askTool }))
    assert.deepEqual(order, ['asked', 'answered'])
    assert.equal(result.ok, true)
    assert.match(readFileSync(path.join(cwd, css), 'utf8'), /--text-title-xl/)
  })

  it('n’a rien modifié : succès sans changement, avec le message', async () => {
    const result = await createFakeAgent([fakeScenarios.nothingChanged()])(run(workspace()))
    assert.equal(result.ok, true)
    assert.match(result.message, /nothing was changed/)
  })
})

describe('faux Claude — échecs et coût', () => {
  it('échec du SDK, budget dépassé (coût gardé), accès refusé (fatal), plantage (estimé)', async () => {
    const agent = createFakeAgent([
      fakeScenarios.fails(),
      fakeScenarios.overBudget(1.52),
      fakeScenarios.accessRefused(),
      fakeScenarios.crash(),
    ])
    const cwd = workspace()
    const failed = await agent(run(cwd))
    assert.equal(failed.ok, false)
    assert.equal(failed.error, 'Claude hit an error while making the change.')
    const budget = await agent(run(cwd))
    assert.equal(budget.error, 'The maximum budget per change was reached.')
    assert.equal(budget.costUsd, 1.52)
    const fatal = await agent(run(cwd))
    assert.equal(fatal.fatal, true)
    assert.equal(fatal.costKind, 'call')
    const crash = await agent(run(cwd))
    assert.equal(crash.costKind, 'call')
    assert.match(crash.error ?? '', /process crashed/)
    await assert.rejects(agent(run(cwd)), /no script for call #5/)
  })

  it('reprise au 2e essai : même session, coût CUMULÉ rapporté, que addCall ne compte pas deux fois', async () => {
    const cwd = workspace()
    const agent = createFakeAgent(
      fakeScenarios.retryOnSecondAttempt(
        { ...fakeScenarios.editCss(css, '-lg', '-md'), costUsd: 0.05 },
        { ...fakeScenarios.editCss(css, '-md', '-xl'), costUsd: 0.03 },
      ),
    )
    const first = await agent(run(cwd))
    const second = await agent(run(cwd, { prompt: 'The automatic checks refused your change…', resume: first.sessionId! }))
    assert.equal(second.sessionId, first.sessionId)
    assert.equal(second.costUsd, 0.08, 'cumul de la session, comme total_cost_usd')
    let state = addCall(EMPTY_COST, first, null)
    state = addCall(state, second, first.sessionId)
    assert.equal(totalCost(state), 0.08)
    assert.equal(agent.runs[1].resume, first.sessionId)
  })

  it('Stop pendant le travail : arrêt, coût de l’appel estimé', async () => {
    const stop = new AbortController()
    const agent = createFakeAgent([{ steps: [{ kind: 'wait', ms: 1000 }, { kind: 'edit', file: css, content: 'changed' }] }])
    const cwd = workspace()
    setTimeout(() => stop.abort(), 5)
    const result = await agent(run(cwd, { signal: stop.signal }))
    assert.equal(result.error, 'Change stopped on request.')
    assert.equal(result.costKind, 'call')
    assert.doesNotMatch(readFileSync(path.join(cwd, css), 'utf8'), /changed/)
  })

  it('question sans réponse (délai ou Stop) : l’attente rompue arrête l’appel', async () => {
    const askTool = { ask: async () => Promise.reject(new Error('No answer within 15 min.')) }
    const result = await createFakeAgent([fakeScenarios.ask(QUESTION)])(run(workspace(), { askTool }))
    assert.equal(result.ok, false)
    assert.match(result.error ?? '', /No answer within 15 min/)
  })

  it('script en fonction : décide selon la demande', async () => {
    const agent = createFakeAgent((request, index) => (request.resume ? fakeScenarios.nothingChanged(`retry ${index}`) : fakeScenarios.fails()))
    const cwd = workspace()
    const first = await agent(run(cwd))
    const second = await agent(run(cwd, { resume: first.sessionId! }))
    assert.equal(second.message, 'retry 1')
  })
})

describe('applyEdit — l’outil Edit réel (FOLLOWUPS #37)', () => {
  it('remplacement littéral de l’occurrence unique ; toutes avec replace_all', () => {
    assert.deepEqual(applyEdit('a { color: x; }', 'x', '$&$1'), { content: 'a { color: $&$1; }' }, 'jamais les motifs de String.replace')
    assert.deepEqual(applyEdit('x y x', 'x', 'z', true), { content: 'z y z' })
  })

  it('erreurs de l’outil : introuvable, ambigu, fichier absent, fichier existant, rien à changer', () => {
    const error = (result: ReturnType<typeof applyEdit>) => ('error' in result ? result.error : '')
    assert.match(error(applyEdit('abc', 'zz', 'y')), /^String to replace not found in file\./)
    assert.match(error(applyEdit('x y x', 'x', 'z')), /^Found 2 matches of the string to replace, but replace_all is false\./)
    assert.match(error(applyEdit(null, 'x', 'z')), /^File does not exist\./)
    assert.match(error(applyEdit('abc', '', 'z')), /^Cannot create new file - file already exists\./)
    assert.match(error(applyEdit('abc', 'b', 'b')), /^No changes to make/)
  })

  it('création (old_string vide sur un fichier absent ou vide) ; une suppression emporte le saut de ligne qui suit', () => {
    assert.deepEqual(applyEdit(null, '', 'new'), { content: 'new' })
    assert.deepEqual(applyEdit('', '', 'new'), { content: 'new' })
    assert.deepEqual(applyEdit('a\n  gap: 1rem;\nb\n', '  gap: 1rem;', ''), { content: 'a\nb\n' })
  })
})

describe('faux Claude — l’Edit passe au hook comme le vrai (FOLLOWUPS #37, SEC-07)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const repo = path.resolve(here, '../../..')
  const LEDE = '28.75rem; /* 460 */\n  color: var(--color-text-muted);'

  /** Dépôt git jetable avec le VRAI Hero.module.css (le hook lit sa version HEAD) et l'accès d'engine-core (lint). */
  async function bench(): Promise<{ cwd: string; access: ToolAccess; source: string }> {
    const cwd = mkdtempSync(path.join(tmpdir(), 'kz-fake-lint-'))
    const source = readFileSync(path.join(repo, css), 'utf8')
    mkdirSync(path.join(cwd, path.dirname(css)), { recursive: true })
    writeFileSync(path.join(cwd, css), source)
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    git('init', '-q')
    git('add', '-A')
    git('commit', '-qm', 'init')
    const ds = await loadDesignSystem(repo)
    const lint = lintContextFor({ ds, scope: ['style'], zones: ['hero.lede'], hardcoded: [] })
    return { cwd, access: { files: [css], textTool: false, lint }, source }
  }

  it('valeur en dur : refusée par la pré-validation AVANT l’écriture (fichier intact)', async () => {
    const { cwd, access, source } = await bench()
    const events: AgentEvent[] = []
    const agent = createFakeAgent([fakeScenarios.editCss(css, LEDE, LEDE.replace('var(--color-text-muted)', '#ff0000'))])
    await agent(run(cwd, { toolAccess: access }, events))
    const refusal = events.find((event) => event.kind === 'warn')?.label ?? ''
    assert.match(refusal, /^Edit refused \(src\/components\/sections\/Hero\/Hero\.module\.css\): the file after this edit breaks/)
    assert.equal(readFileSync(path.join(cwd, css), 'utf8'), source)
  })

  it('token permis : jugé conforme sur old_string / new_string, puis écrit', async () => {
    const { cwd, access, source } = await bench()
    const events: AgentEvent[] = []
    const after = LEDE.replace('var(--color-text-muted)', 'var(--color-text)')
    const result = await createFakeAgent([fakeScenarios.editCss(css, LEDE, after)])(run(cwd, { toolAccess: access }, events))
    assert.equal(result.ok, true)
    assert.ok(!events.some((event) => event.kind === 'warn'), JSON.stringify(events))
    assert.equal(readFileSync(path.join(cwd, css), 'utf8'), source.replace(LEDE, after))
  })

  it('old_string ambigu : refusé par le hook ; replace_all le lève (les deux règles jugées)', async () => {
    const { cwd, access, source } = await bench()
    const events: AgentEvent[] = []
    const find = 'color: var(--color-text-muted);'
    const agent = createFakeAgent([
      fakeScenarios.editCss(css, find, 'color: var(--color-text);'),
      { steps: [{ kind: 'edit', file: css, find, replace: 'color: var(--color-text);', replaceAll: true }] },
    ])
    await agent(run(cwd, { toolAccess: access }, events))
    assert.match(events.find((event) => event.kind === 'warn')?.label ?? '', /old_string appears 2 times/)
    assert.equal(readFileSync(path.join(cwd, css), 'utf8'), source)
    // replace_all : la 2e occurrence (.rating) sort de la zone hero.lede, le lint la refuse aussi — sans rien écrire.
    const second: AgentEvent[] = []
    await agent(run(cwd, { toolAccess: access }, second))
    assert.equal(second.filter((event) => event.kind === 'warn').length, 1)
    assert.equal(readFileSync(path.join(cwd, css), 'utf8'), source)
  })

  it('fichier entier (`content`, comme le faux Claude d’ENGINE_FAKE_CLAUDE) : old_string = contenu actuel', async () => {
    const { cwd, access, source } = await bench()
    const events: AgentEvent[] = []
    const content = source.replace(LEDE, LEDE.replace('var(--color-text-muted)', 'var(--color-text)'))
    await createFakeAgent([{ steps: [{ kind: 'edit', file: css, content }] }])(run(cwd, { toolAccess: access }, events))
    assert.ok(!events.some((event) => event.kind === 'warn'), JSON.stringify(events))
    assert.equal(readFileSync(path.join(cwd, css), 'utf8'), content)
  })

  it('sans lint (CSS jugé après l’essai) : l’outil lui-même refuse un old_string ambigu ou absent, relevé dans toolErrors', async () => {
    const cwd = workspace()
    writeFileSync(path.join(cwd, css), '.a { color: var(--x); }\n.b { color: var(--x); }\n')
    const events: AgentEvent[] = []
    const agent = createFakeAgent([
      {
        steps: [
          { kind: 'edit', file: css, find: 'var(--x)', replace: 'var(--y)' },
          { kind: 'edit', file: css, find: 'missing', replace: 'var(--y)' },
        ],
      },
    ])
    await agent(run(cwd, {}, events))
    assert.deepEqual(events.map((event) => event.kind), ['edit', 'edit'], 'le vrai runner ne journalise pas les résultats d’outil')
    assert.equal(agent.toolErrors.length, 2)
    assert.match(agent.toolErrors[0], /^Edit \(src\/components\/sections\/Hero\/Hero\.module\.css\): Found 2 matches/)
    assert.match(agent.toolErrors[1], /String to replace not found/)
    assert.equal(readFileSync(path.join(cwd, css), 'utf8'), '.a { color: var(--x); }\n.b { color: var(--x); }\n')
  })
})
