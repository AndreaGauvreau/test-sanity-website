import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, it } from 'vitest'
import { createEngineFakeClaude, editableFieldsOf, nextColor, updatedText, withColor, zoneSelectors } from './fake-claude'
import { editRequest, HERO_CSS, makeBench, PAGE_DOC, type Bench } from './testing'

/**
 * Faux Claude du démarrage (ENGINE_FAKE_CLAUDE, FOLLOWUPS #12) sur le VRAI cycle d'une demande : vrai prompt
 * (engine-claude), vrai hook, vrai lint, vrai git sur un dépôt temporaire, faux Sanity, faux aperçu. Aucun appel réel.
 */

let bench: Bench | null = null
afterEach(async () => {
  await bench?.cleanup()
  bench = null
})

async function run(scenario: Parameters<typeof createEngineFakeClaude>[0], request = editRequest()) {
  const fake = createEngineFakeClaude(scenario)
  bench = await makeBench([], { runAgent: (agentRun) => fake(agentRun, { maxBudgetUsd: 1, model: 'claude-opus-5-5', effort: 'medium' }), fakeClaude: scenario })
  const job = await bench.service.request({ id: 'u-client', name: 'Marie Client', email: 'marie@conduit.test', role: 'client' }, request)
  return { job, bench }
}

describe('scénarios du faux Claude', () => {
  it('css : couleur du texte de la zone demandée → token voisin, contrôles verts, commit', async () => {
    const { job, bench } = await run('css')
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.equal(done.status, 'done', JSON.stringify(done.steps))
    assert.match(await readFile(path.join(bench.repoDir, HERO_CSS), 'utf8'), /\.lede \{[^}]*color: var\(--color-text\);/)
    assert.ok(done.steps.some((step) => step.kind === 'warn' && step.label.startsWith('FAKE Claude (css)')))
    assert.ok(done.usage && done.usage.costUsd > 0)
  })

  it('text : réécrit le premier champ Sanity modifiable (brouillon), sans toucher au code', async () => {
    const { job, bench } = await run('text', editRequest({ zone: 'hero.title', scope: ['text'] }))
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.equal(done.status, 'done', JSON.stringify(done.steps))
    const draft = bench.sanity.docs[`drafts.${PAGE_DOC}`] as unknown as { hero: { title: string } }
    assert.equal(draft.hero.title, 'Dock scheduling that just works — updated')
    assert.equal(bench.git('status', '--porcelain'), '')
  })

  it('auto : texte si « T Text » est coché, sinon style', async () => {
    const { job, bench } = await run('auto', editRequest({ zone: 'hero.title', scope: ['text', 'style'] }))
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.equal(done.texts.length, 1)
  })

  it('ask : la question est montrée, la RÉPONSE du client décide du token écrit', async () => {
    const { job, bench } = await run('ask')
    const waiting = await bench.until(job.id, ['waiting'])
    const question = waiting.question!.questions[0]
    const accent = question.options.find((option) => option.label === 'Accent color')!
    await bench.service.answer(waiting.requestedBy, job.id, { answers: [{ questionId: question.id, optionId: accent.id }] })
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.equal(done.status, 'done', JSON.stringify(done.steps))
    assert.match(await readFile(path.join(bench.repoDir, HERO_CSS), 'utf8'), /\.lede \{[^}]*color: var\(--color-text-accent\);/)
  })

  it('fail et budget : échec propre, rien n’est changé', async () => {
    for (const scenario of ['fail', 'budget'] as const) {
      const { job, bench: current } = await run(scenario)
      const done = await current.until(job.id, ['done', 'failed', 'rejected'])
      assert.equal(done.status, 'failed', scenario)
      assert.equal(current.git('status', '--porcelain'), '', scenario)
      if (scenario === 'budget') assert.ok(done.usage && done.usage.costUsd >= 1.5)
      await current.cleanup()
      bench = null
    }
  })
})

describe('ENGINE_FAKE_CLAUDE passe par le hook avec pré-validation (SEC-07, FOLLOWUPS #36)', () => {
  it('le faux Claude reçoit toolAccess.lint ; son Edit est jugé sur le fichier futur AVANT l’écriture', async () => {
    const fake = createEngineFakeClaude('css')
    const lints: unknown[] = []
    // Contexte du lint durci (mode Texte : aucun octet CSS) sans toucher aux fichiers permis : l'Edit du faux Claude
    // ne passe que si le hook applique bien ce contexte (sans lui, un CSS du périmètre serait écrit).
    bench = await makeBench([], {
      fakeClaude: 'css',
      runAgent: (agentRun) => {
        lints.push(agentRun.toolAccess.lint)
        const lint = agentRun.toolAccess.lint!
        return fake({ ...agentRun, toolAccess: { ...agentRun.toolAccess, lint: { ...lint, scope: { style: false, text: true } } } }, { maxBudgetUsd: 1, model: 'claude-opus-5-5', effort: 'medium' })
      },
    })
    const before = await readFile(path.join(bench.repoDir, HERO_CSS), 'utf8')
    const job = await bench.service.request({ id: 'u-client', name: 'Marie Client', email: 'marie@conduit.test', role: 'client' }, editRequest())
    const done = await bench.until(job.id, ['done', 'failed', 'rejected'])
    assert.ok(lints[0], 'toolAccess.lint absent pour ENGINE_FAKE_CLAUDE')
    assert.equal(done.status, 'rejected', JSON.stringify(done.steps))
    assert.ok(done.steps.some((step) => step.kind === 'warn' && step.label.startsWith(`Edit refused (${HERO_CSS}): the file after this edit breaks`)))
    assert.equal(await readFile(path.join(bench.repoDir, HERO_CSS), 'utf8'), before)
  })
})

describe('lecture du prompt et CSS', () => {
  it('sélecteurs de la zone, champs modifiables, texte mis à jour, token voisin, déclaration posée', () => {
    assert.deepEqual(zoneSelectors('Rules of “Hero · Title” in the CSS Module: .title, .x (and their :hover states).'), ['.title', '.x'])
    assert.deepEqual(editableFieldsOf('Editable fields:\n- doc:hero.title (Title, 70 characters max, 2 lines max) — current: “Hi there”\n\nOther'), [
      { id: 'doc:hero.title', max: 70, current: 'Hi there' },
    ])
    assert.equal(updatedText('Short', 70), 'Short — updated')
    assert.ok(updatedText('A very long title that barely fits', 30).length <= 30)
    const colors = ['var(--color-text)', 'var(--color-text-muted)', 'var(--color-text-accent)']
    assert.equal(nextColor('var(--color-text-muted)', colors), 'var(--color-text)')
    assert.equal(nextColor('var(--color-text)', colors), 'var(--color-text-muted)')
    assert.equal(nextColor(null, colors), 'var(--color-text-accent)')
    assert.match(withColor('.a { margin: 0; }\n', '.a', 'var(--color-text)'), /\.a \{ margin: 0; color: var\(--color-text\); \}/)
  })
})
