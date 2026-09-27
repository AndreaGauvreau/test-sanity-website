import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { z } from 'zod'
import { ALLOWED_TOOLS, ASK_TOOL, MEASURE_TOOL, TEXT_TOOL } from './names'
import { questionProblems } from './questions'
import { ASK_CLIENT_DESCRIPTION, kuartzTools, MEASURE_DESCRIPTION, SET_TEXT_SCHEMA, type ToolHandlers } from './tools'

/**
 * Nos outils MCP ouvrent le prompt envoyé au modèle (outils → système → messages) : leurs définitions ne doivent pas
 * dépendre de la demande, sinon le cache du prompt repart de zéro à chaque zone (tâche 23 du POC).
 */

const pause = <T>(task: () => Promise<T>) => task()
const measureTool = { measure: async () => '375 px: 2 lines' }
const askTool = { ask: async () => ({ answer: 'Client’s answer: Text muted.' }) }
const textTool = { onSet: async () => null }

const RUNS: Record<string, ToolHandlers> = {
  'hero.title': { textTool, measureTool, askTool },
  'features.card#2': { textTool: { onSet: async () => null }, measureTool, askTool },
  'style only': { measureTool, askTool },
  'no preview': { textTool, askTool },
}

const definitions = (run: ToolHandlers) =>
  kuartzTools(run, pause).map((t) => ({
    name: t.name,
    description: t.description,
    schema: JSON.stringify(z.toJSONSchema(z.object(t.inputSchema))),
  }))

async function call(run: ToolHandlers, name: string, args: Record<string, unknown>) {
  const found = kuartzTools(run, pause).find((t) => t.name === name)
  assert.ok(found, `outil ${name} absent`)
  const result = await found.handler(args as never, {})
  return { isError: result.isError === true, text: (result.content[0] as { text?: string } | undefined)?.text ?? '' }
}

describe('kuartzTools — définitions fixes', () => {
  it('déclare toujours set_text, measure et ask_client, dans cet ordre', () => {
    for (const run of Object.values(RUNS)) assert.deepEqual(kuartzTools(run, pause).map((t) => t.name), ['set_text', 'measure', 'ask_client'])
  })

  it('mêmes définitions (nom, description, schéma JSON) quelle que soit la demande', () => {
    const [first, ...others] = Object.entries(RUNS)
    for (const [label, run] of others) assert.deepEqual(definitions(run), definitions(first[1]), `${label} diffère de ${first[0]}`)
  })

  it('set_text ne cite aucun champ : ils sont dans la demande', () => {
    const setText = definitions(RUNS['features.card#2'])[0]
    assert.doesNotMatch(setText.description, /features|hero|characters max/)
    assert.equal(setText.schema, JSON.stringify(z.toJSONSchema(z.object(SET_TEXT_SCHEMA))))
  })

  it('ALLOWED_TOOLS : les 4 outils intégrés puis nos trois outils, gelé', () => {
    assert.deepEqual([...ALLOWED_TOOLS], ['Read', 'Edit', 'Glob', 'Grep', TEXT_TOOL, MEASURE_TOOL, ASK_TOOL])
    assert.deepEqual([TEXT_TOOL, MEASURE_TOOL, ASK_TOOL], ['mcp__kuartz__set_text', 'mcp__kuartz__measure', 'mcp__kuartz__ask_client'])
    assert.ok(Object.isFrozen(ALLOWED_TOOLS))
    assert.throws(() => (ALLOWED_TOOLS as string[]).push('Bash'))
  })

  it('le schéma d’ask_client porte l’effet longer-text du contrat', () => {
    const schema = JSON.stringify(definitions(RUNS['hero.title'])[2].schema)
    assert.match(schema, /longer-text/)
    assert.doesNotMatch(schema, /texte-plus-long/)
  })
})

describe('kuartzTools — outil indisponible pour cette demande', () => {
  it('set_text sans texte coché : erreur claire', async () => {
    assert.deepEqual(await call(RUNS['style only'], 'set_text', { field: 'x', value: 'y' }), {
      isError: true,
      text: 'Text not enabled: no editable text for this request.',
    })
  })

  it('set_text avec texte coché : le gestionnaire valide le champ', async () => {
    assert.deepEqual(await call(RUNS['hero.title'], 'set_text', { field: 'dockSchedulingPage:hero.title', value: 'New' }), {
      isError: false,
      text: 'Text saved in the draft for dockSchedulingPage:hero.title.',
    })
    const refusing = { textTool: { onSet: async () => 'Too long.' } }
    assert.deepEqual(await call(refusing, 'set_text', { field: 'f', value: 'v' }), { isError: true, text: 'Too long.' })
  })

  it('measure sans aperçu, ask_client sans gestionnaire : erreurs claires', async () => {
    assert.deepEqual(await call(RUNS['no preview'], 'measure', {}), { isError: true, text: 'Measure unavailable: visual checks are turned off.' })
    const question = { question: 'Which color?', options: [{ label: 'Accent', tone: 'recommended' }, { label: 'Keep', tone: 'neutral' }] }
    assert.deepEqual(await call({ measureTool }, 'ask_client', { questions: [question] }), { isError: true, text: 'Questions unavailable.' })
  })

  it('ask_client suspend le délai de Claude pendant l’attente (pauseClock)', async () => {
    let paused = 0
    const tools = kuartzTools({ askTool }, async (task) => {
      paused++
      return task()
    })
    const question = { question: 'Which color?', options: [{ label: 'Accent', tone: 'recommended' }, { label: 'Keep', tone: 'neutral' }] }
    await tools[2].handler({ questions: [question] } as never, {})
    assert.equal(paused, 1)
  })
})

describe('ASK_CLIENT_DESCRIPTION — en anglais, quatre usages, refus annoncés', () => {
  const has = (part: string) => assert.ok(ASK_CLIENT_DESCRIPTION.includes(part), `« ${part} » absent`)

  it('les quatre cas et les règles des options', () => {
    has('price, hours, number, address')
    has('contradicts what the element does')
    has('would gain a line at 375 px')
    has('effect "longer-text"')
    has('never the neutral option')
    has('The client can always answer freely')
    has('for (2) and (3), before any set_text')
    has('A line gained at 375 px is seen after set_text and measure: then ask a new question')
    has('no option proposes a value: the client gives it as a free answer')
    has('No question, topic or option, whatever its tone, cites url(), @import or a web address')
    assert.equal(ASK_CLIENT_DESCRIPTION.split('before any set_text').length, 2, '« before any set_text » une seule fois')
  })

  it('tient sous le plafond de Claude Code (2 048 caractères par description d’outil MCP)', () => {
    assert.ok(ASK_CLIENT_DESCRIPTION.length <= 2048, `${ASK_CLIENT_DESCRIPTION.length} caractères`)
  })

  it('chaque propriété annoncée comme interdite en dur est bien refusée', () => {
    const properties = ['font-family', 'font', 'opacity', 'display', 'position', 'transform', 'background-image', 'outline', 'outline-offset', 'box-shadow', 'top', 'right', 'bottom', 'left', 'inset']
    for (const property of properties) {
      assert.match(ASK_CLIENT_DESCRIPTION, new RegExp(`(?<![\\w-])${property}(?![\\w-])`), `${property} annoncé`)
      const problem = questionProblems(
        [{ question: 'Which value?', options: [{ label: 'Closest token', tone: 'recommended' }, { label: 'Exact value', tone: 'discouraged', hardcoded: { property, value: '1px' } }] }],
      )
      assert.match(problem ?? '', /cannot take a hard-coded value|font outside the design system/, `${property} refusé`)
    }
  })
})

describe('MEASURE_DESCRIPTION', () => {
  it('annonce les largeurs relevées : les formats de l’éditeur (contrat EDITOR_VIEWPORTS), Tablet à 810 et non 768', () => {
    assert.ok(MEASURE_DESCRIPTION.startsWith('Measures the selected element as it renders right now in the draft preview, at 375, 810 and 1280 px: '))
  })
})
