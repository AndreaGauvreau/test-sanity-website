import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, it } from 'vitest'
import { loadDesignSystem, type DesignSystem } from './design-system'
import { lineRects, measuresOf, rawText, rawZone } from './measure-fixtures'
import type { ZoneMeasure } from './measure'
import { CHECK_LABELS, contractCheckId, publicChecks, retryProblems } from './report'
import { runRenderChecks, runStaticChecks, type RenderCheckInput } from './run'
import type { VisualVerdict } from './visual'

/**
 * Les deux temps des contrôles (job.ts > runChecks du POC) : ordre, déclenchement du typecheck, zones de la demande,
 * contrôles du rendu sur une fausse session d'aperçu, et ce que voit le client (report.ts).
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const siteDir = path.join(here, 'fixtures/conduit')
const HERO = 'src/components/sections/Hero/Hero.module.css'
const HERO_TSX = 'src/components/sections/Hero/Hero.tsx'

let ds: DesignSystem
let hero: string
beforeAll(async () => {
  ds = await loadDesignSystem(siteDir)
  hero = await readFile(path.join(siteDir, HERO), 'utf8')
})

const recolored = () => hero.replace('.title {\n', '.title {\n  color: var(--color-text-accent);\n')
const noTypecheck = async () => {
  throw new Error('typecheck appelé sans fichier .ts/.tsx modifié')
}

describe('runStaticChecks', () => {
  it('enchaîne scope puis tokens, sans typecheck pour du CSS seul, et trace les textes', async () => {
    const result = await runStaticChecks({
      ds,
      scope: ['style', 'text'],
      zones: ['hero.title'],
      access: { files: [HERO], textTool: true },
      changes: [{ file: HERO, before: hero, after: recolored() }],
      hardcoded: [],
      texts: 1,
      typecheck: noTypecheck,
    })
    assert.deepEqual(result.checks.map((check) => [check.id, check.ok]), [['scope', true], ['tokens', true], ['texts', true]])
    assert.equal(result.ok, true)
    assert.deepEqual(result.violations, [])
  })

  it('refuse un fichier hors périmètre et une règle d’une autre zone ; ok à faux', async () => {
    const other = 'src/components/sections/Faq/Faq.module.css'
    const result = await runStaticChecks({
      ds,
      scope: ['style'],
      zones: ['hero.lede'],
      access: { files: [HERO], textTool: false },
      changes: [
        { file: HERO, before: hero, after: recolored() },
        { file: other, before: '.faq {}\n', after: '.faq { color: red; }\n' },
      ],
      hardcoded: [],
      texts: 0,
      typecheck: noTypecheck,
    })
    assert.equal(result.ok, false)
    const [scope, tokens] = result.checks
    assert.deepEqual([scope.id, scope.ok, scope.detail], ['scope', false, other])
    assert.equal(tokens.ok, false)
    assert.match(tokens.problem, /Hero\.module\.css: `\.title` does not belong to this zone/)
    assert.deepEqual(retryProblems(result.checks).length, 2)
    // Consignes du 2e essai en anglais (Claude travaille en anglais) : aucun texte français sur ce site anglais.
    assert.doesNotMatch(retryProblems(result.checks).join(' '), /[àâçéèêëîïôûùüÿœ«»]/)
    assert.match(retryProblems(result.checks)[0], /^Files changed outside the allowed scope: /)
  })

  it('juge toutes les zones de la demande à plusieurs éléments', async () => {
    const both = recolored().replace('.lede {\n', '.lede {\n  color: var(--color-text);\n')
    const run = (zones: string[]) =>
      runStaticChecks({
        ds,
        scope: { style: true, text: false },
        zones,
        access: { files: [HERO], textTool: false },
        changes: [{ file: HERO, before: hero, after: both }],
        hardcoded: [],
        texts: 0,
        typecheck: noTypecheck,
      })
    assert.equal((await run(['hero.title'])).ok, false)
    assert.equal((await run(['hero.title', 'hero.lede'])).ok, true)
  })

  it('lance le typecheck dès qu’un .tsx change, et renvoie sa première ligne', async () => {
    const tsx = "export function Hero() {\n  return <h1 data-edit=\"hero.title\">Hi</h1>\n}\n"
    const result = await runStaticChecks({
      ds,
      scope: ['style'],
      zones: ['hero.title'],
      access: { files: [HERO], textTool: false },
      changes: [{ file: HERO_TSX, before: tsx, after: tsx.replace('Hi', 'Hello') }],
      hardcoded: [],
      texts: 0,
      typecheck: async () => 'Hero.tsx(2,3): error TS2322\nsuite',
    })
    assert.deepEqual(result.checks.map((check) => check.id), ['scope', 'tokens', 'types'])
    const types = result.checks[2]
    assert.deepEqual([types.ok, types.detail], [false, 'Hero.tsx(2,3): error TS2322'])
  })

  it('signale les valeurs en dur accordées qui ont servi', async () => {
    const padded = hero.replace('.title {\n', '.title {\n  padding: 1rem;\n')
    const granted = { property: 'padding', value: '1rem' }
    const result = await runStaticChecks({
      ds,
      scope: ['style'],
      zones: ['hero.title'],
      access: { files: [HERO], textTool: false },
      changes: [{ file: HERO, before: hero, after: padded }],
      hardcoded: [granted, { property: 'gap', value: '2rem' }],
      texts: 0,
      typecheck: noTypecheck,
    })
    assert.equal(result.ok, true)
    assert.deepEqual(result.granted, [granted])
  })

  it('sans fichier ni texte : aucun contrôle', async () => {
    const result = await runStaticChecks({
      ds,
      scope: ['text'],
      zones: ['hero.title'],
      access: { files: [], textTool: true },
      changes: [],
      hardcoded: [],
      texts: 0,
      typecheck: noTypecheck,
    })
    assert.deepEqual([result.checks, result.ok], [[], true])
  })
})

/** Verdict d'une fausse session : tout va bien, sauf ce que `partial` change. */
function verdict(after: ZoneMeasure[], partial: Partial<VisualVerdict> = {}): VisualVerdict {
  return {
    render: { ok: true },
    responsive: { ok: true },
    isolation: { ok: true, zones: [] },
    after,
    occurrences: after,
    painted: after,
    unmeasured: [],
    unreadable: [],
    ...partial,
  }
}

/** Fausse session : l'état d'avant, et ce que renvoie verify(). */
function session(before: ZoneMeasure[], next: VisualVerdict): RenderCheckInput['session'] {
  return { before, occurrences: before, painted: before, verify: async () => next }
}

describe('runRenderChecks', () => {
  it('rend, déborde, isole, cadre dans cet ordre ; rien de plus sans texte réécrit ni couleur changée', async () => {
    const before = measuresOf({})
    const result = await runRenderChecks({ session: session(before, verdict(measuresOf({}))), logotype: false, acceptsLongerText: false })
    assert.deepEqual(result.checks.map((check) => check.id).slice(0, 4), ['render', 'responsive', 'isolation', 'frame'])
    assert.equal(result.ok, true)
    assert.equal(result.warning, null)
  })

  it('refuse une ligne gagnée à 375 px sans l’accord du client, l’accepte avec', async () => {
    // Texte réécrit par set_text (autres mots) qui passe de 2 à 3 lignes à 375 px.
    const before = measuresOf({}, rawZone({ texts: [rawText({ text: 'Book a dock', rects: lineRects(2) })] }))
    const after = measuresOf(
      { 375: rawZone({ texts: [rawText({ text: 'Book a loading dock in seconds', rects: lineRects(3) })] }) },
      rawZone({ texts: [rawText({ text: 'Book a loading dock in seconds', rects: lineRects(2) })] }),
    )
    const refused = await runRenderChecks({ session: session(before, verdict(after)), logotype: false, acceptsLongerText: false })
    const lines = refused.checks.find((check) => check.id === 'lines')
    assert.equal(lines?.ok, false)
    assert.equal(refused.ok, false)
    // La consigne nomme l'effet du contrat, celui que le schéma d'ask_client accepte.
    assert.match(lines?.problem ?? '', /effect “longer-text”/)
    const accepted = await runRenderChecks({ session: session(before, verdict(after)), logotype: false, acceptsLongerText: true })
    assert.equal(accepted.checks.find((check) => check.id === 'lines')?.ok, true)
  })

  it('ne compte pas contre l’isolation les autres zones visées par la même demande', async () => {
    const isolation = { ok: false, zones: ['hero.lede', 'footer'], detail: 'hero.lede (375, 768 px), footer (1280 px)' }
    const run = (alsoChanged?: string[]) =>
      runRenderChecks({
        session: session(measuresOf({}), verdict(measuresOf({}), { isolation })),
        logotype: false,
        acceptsLongerText: false,
        alsoChanged,
      })
    const alone = (await run()).checks.find((check) => check.id === 'isolation')!
    assert.deepEqual([alone.ok, alone.detail], [false, 'hero.lede (375, 768 px), footer (1280 px)'])
    const shared = (await run(['hero.lede'])).checks.find((check) => check.id === 'isolation')!
    assert.deepEqual([shared.ok, shared.detail], [false, 'footer (1280 px)'])
    const all = (await run(['hero.lede', 'footer'])).checks.find((check) => check.id === 'isolation')!
    assert.deepEqual([all.ok, all.detail], [true, undefined])
  })

  it('refuse une page en erreur ou qui déborde, avec la consigne pour Claude', async () => {
    const result = await runRenderChecks({
      session: session(
        measuresOf({}),
        verdict(measuresOf({}), {
          render: { ok: false, detail: 'HTTP 500 at 375 px' },
          responsive: { ok: false, detail: 'Horizontal overflow at 375 px (+40 px)' },
        }),
      ),
      logotype: false,
      acceptsLongerText: false,
    })
    assert.equal(result.ok, false)
    const [render, responsive] = retryProblems(result.checks)
    assert.equal(render, 'The page no longer renders correctly: HTTP 500 at 375 px.')
    assert.equal(
      responsive,
      'Horizontal overflow at 375 px (+40 px). The site must stay responsive: shorten the text or avoid fixed widths.',
    )
  })

  it('avertit d’un texte recouvert sans refuser (décision 17), et le client le lit en anglais', async () => {
    const before = measuresOf({})
    const after = measuresOf({ 375: rawZone({ texts: [rawText({ text: 'Dock scheduling', coveredLines: [0] })] }) })
    const result = await runRenderChecks({ session: session(before, verdict(after)), logotype: false, acceptsLongerText: false })
    assert.equal(result.ok, true)
    assert.match(result.warning?.client ?? '', /^Warning: the text “Dock scheduling” is fully hidden/)
    const shown = publicChecks(result.checks, result.warning)
    assert.deepEqual(shown.at(-1), { id: 'cover', label: 'Covered text', ok: true, warning: true, detail: result.warning?.client })
  })
})

describe('publicChecks : ce que voit le client', () => {
  it('ids du contrat, libellés anglais, ni consigne à Claude ni détail technique', () => {
    const shown = publicChecks([
      { id: 'scope', label: 'Only the allowed files changed', ok: true, problem: 'x' },
      { id: 'texts', label: 'Texts compliant', ok: true, problem: '' },
      { id: 'placement', label: 'Inner zones: placement only', ok: true, detail: 'hero.title', problem: '' },
      { id: 'contrast-unverifiable', label: 'Each color…', ok: false, detail: 'No effect', problem: 'secret' },
      { id: 'contrast-reach', label: 'Each color rule…', ok: true, problem: '' },
    ])
    assert.deepEqual(shown, [
      { id: 'scope', label: CHECK_LABELS.scope, ok: true },
      { id: 'unverifiable', label: CHECK_LABELS.unverifiable, ok: false },
      { id: 'reach', label: CHECK_LABELS.reach, ok: true },
    ])
    assert.equal(contractCheckId('constructor'), null)
    assert.ok(Object.isFrozen(CHECK_LABELS))
    for (const label of Object.values(CHECK_LABELS)) assert.match(label, /^[\x20-\x7e]+$/, 'libellé ASCII anglais')
  })
})
