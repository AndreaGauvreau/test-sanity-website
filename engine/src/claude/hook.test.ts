import assert from 'node:assert/strict'
import type { HookInput } from '@anthropic-ai/claude-agent-sdk'
import { describe, it } from 'vitest'
import { ZONES } from './fixtures'
import { createGuardHook, scopeOf, toolAccessFor, type HookEvent } from './hook'
import { ALLOWED_TOOLS, ASK_TOOL, BUILTIN_TOOLS, MCP_SERVER_NAME, MCP_TOOLS, MEASURE_TOOL, TEXT_TOOL } from './names'

const root = '/ws/repo'
const heroCss = 'src/components/sections/Hero/Hero.module.css'

describe('names — une seule source (engine-guards), valeurs figées', () => {
  it('serveur kuartz, 3 outils MCP dans l’ordre, 4 outils intégrés, liste permise fixe et gelée', () => {
    assert.equal(MCP_SERVER_NAME, 'kuartz')
    assert.deepEqual([TEXT_TOOL, MEASURE_TOOL, ASK_TOOL], ['mcp__kuartz__set_text', 'mcp__kuartz__measure', 'mcp__kuartz__ask_client'])
    assert.deepEqual([...MCP_TOOLS], [TEXT_TOOL, MEASURE_TOOL, ASK_TOOL])
    assert.deepEqual([...BUILTIN_TOOLS], ['Read', 'Edit', 'Glob', 'Grep'])
    assert.deepEqual([...ALLOWED_TOOLS], ['Read', 'Edit', 'Glob', 'Grep', TEXT_TOOL, MEASURE_TOOL, ASK_TOOL])
    assert.ok(Object.isFrozen(ALLOWED_TOOLS) && Object.isFrozen(BUILTIN_TOOLS) && Object.isFrozen(MCP_TOOLS))
    assert.throws(() => (ALLOWED_TOOLS as string[]).push('Bash'))
  })
})

const hookInput = (tool_name: string, tool_input: Record<string, unknown>) =>
  ({ hook_event_name: 'PreToolUse', tool_name, tool_input, session_id: 's', transcript_path: '', cwd: root, tool_use_id: 't' }) as unknown as HookInput

describe('createGuardHook — adaptateur SDK du checkToolUse d’engine-guards', () => {
  const run = async (tool: string, input: Record<string, unknown>, access = { files: [heroCss], textTool: false }) => {
    const events: HookEvent[] = []
    const hook = createGuardHook(root, access, (event) => events.push(event))
    const output = await hook(hookInput(tool, input), undefined, { signal: new AbortController().signal })
    return { output, events }
  }

  it('laisse passer un appel permis sans rien journaliser', async () => {
    const { output, events } = await run('Read', { file_path: `${root}/src/components/sections/Hero/Hero.tsx` })
    assert.deepEqual(output, {})
    assert.deepEqual(events, [])
  })

  it('refuse avec permissionDecision deny et une étape warn (secret, shell, édition hors périmètre)', async () => {
    for (const [tool, input] of [
      ['Read', { file_path: `${root}/.env.local` }],
      ['Read', { file_path: `${root}/src/admin/core/auth/session.ts` }],
      ['Bash', { command: 'cat .env.local' }],
      ['Write', { file_path: `${root}/src/x.ts`, content: '' }],
      ['Edit', { file_path: `${root}/src/styles/tokens.css` }],
      [TEXT_TOOL, { field: 'x', value: 'y' }],
    ] as const) {
      const { output, events } = await run(tool, input)
      const specific = (output as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } })
        .hookSpecificOutput
      assert.equal(specific?.permissionDecision, 'deny', tool)
      assert.ok(specific?.permissionDecisionReason, tool)
      assert.equal(events.length, 1, tool)
      assert.equal(events[0].kind, 'warn')
    }
  })

  it('measure et ask_client sont toujours permis ; un autre évènement de hook est ignoré', async () => {
    assert.deepEqual((await run(MEASURE_TOOL, {})).output, {})
    assert.deepEqual((await run(ASK_TOOL, { questions: [] })).output, {})
    const hook = createGuardHook(root, { files: [], textTool: false }, () => assert.fail('aucun évènement'))
    const other = { hook_event_name: 'PostToolUse' } as unknown as HookInput
    assert.deepEqual(await hook(other, undefined, { signal: new AbortController().signal }), {})
  })

  it('décision injectable (tests)', async () => {
    const hook = createGuardHook(root, { files: [], textTool: false }, () => {}, () => ({ allow: false, reason: 'no' }))
    const output = await hook(hookInput('Read', {}), undefined, { signal: new AbortController().signal })
    assert.equal((output as { hookSpecificOutput: { permissionDecisionReason: string } }).hookSpecificOutput.permissionDecisionReason, 'no')
  })
})

describe('toolAccessFor', () => {
  it('🖌 Style : seulement les CSS des zones visées', () => {
    const access = toolAccessFor(ZONES.zones, { scope: scopeOf(['style']), targets: [{ zone: 'hero.title' }, { zone: 'features.card' }] }, 0)
    assert.deepEqual(access, {
      files: [heroCss, 'src/components/sections/Features/Features.module.css'],
      textTool: false,
    })
  })

  it('T Texte : les fichiers de texte d’une zone écrite dans le code, set_text si des champs Sanity existent', () => {
    const access = toolAccessFor(ZONES.zones, { scope: scopeOf(['text']), targets: [{ zone: 'integrations.logos' }, { zone: 'hero.title' }] }, 1)
    assert.deepEqual(access, { files: ['src/components/sections/Integrations/Integrations.tsx'], textTool: true })
  })

  it('zone inconnue ou héritée d’Object : ignorée (mineur #74 du POC)', () => {
    const access = toolAccessFor(ZONES.zones, { scope: scopeOf(['style', 'text']), targets: [{ zone: 'constructor' }, { zone: 'nope' }] }, 0)
    assert.deepEqual(access, { files: [], textTool: false })
  })
})
