import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, it } from 'vitest'
import { fakeScenarios, type FakeCall } from '../claude'
import { EngineError } from '../server/errors'
import { CLIENT, editRequest, HERO_CSS, HERO_TSX, KUARTZ, LEDE_MUTED, ledeColor, makeBench, PAGE_DOC, TITLE_FIELD, type Bench } from './testing'
import { FAILED_MESSAGE, INTERRUPTED_MESSAGE, STOPPED_MESSAGE } from './types'

/**
 * Cycle complet d'une demande, sur un vrai dépôt git temporaire façon Conduit, avec le faux Claude d'engine-claude, un
 * faux aperçu et un faux Sanity : statuts, commits, retour arrière (fichiers ET textes), ajustement, Validate (un seul
 * commit), Cancel, coût d'une session reprise, refus 409, reprise après un redémarrage.
 */

const DARKER = fakeScenarios.editCss(HERO_CSS, LEDE_MUTED, ledeColor('var(--color-text)'), 'The lede is now darker.')
const BAD_COLOR = fakeScenarios.editCss(HERO_CSS, LEDE_MUTED, ledeColor('red'), 'Done.')
const ACCENT = fakeScenarios.editCss(HERO_CSS, 'color: var(--color-text);', 'color: var(--color-text-accent);', 'The lede is now orange.')

let bench: Bench | null = null
afterEach(async () => {
  await bench?.cleanup()
  bench = null
})

async function start(b: Bench, body = editRequest(), user = CLIENT) {
  const job = await b.service.request(user, body)
  assert.equal(job.status, 'queued')
  return job
}

const expect409 = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof EngineError && error.status === 409 && error.code === code)
}

describe('cycle d’une demande (style)', () => {
  it('done : commit sur draft au nom du client, captures, contrôles publics, modification à valider', async () => {
    bench = await makeBench([DARKER])
    const base = bench.git('rev-parse', 'HEAD')
    const queued = await start(bench)
    assert.equal(queued.kind, 'request')
    assert.equal(queued.request.targets[0].label, 'Hero · Lede') // libellé de zones.json, jamais celui du navigateur
    const job = await bench.until(queued.id, ['done', 'failed', 'rejected', 'stopped'])
    assert.equal(job.status, 'done', JSON.stringify(job.steps, null, 1))
    assert.equal(job.message, 'The lede is now darker.')
    assert.equal(job.attempts, 1)
    assert.ok(job.checks.length > 0 && job.checks.every((check) => check.ok))
    assert.ok(job.checks.every((check) => /^[\x20-\x7e’—]+$/.test(check.label)), 'libellés anglais')
    assert.deepEqual(job.summary, [{ target: 'Hero · Lede', description: 'color → Color text (token)', kind: 'style', where: 'code' }])
    assert.ok(job.steps.every((step) => step.at && step.kind && step.label))
    // Commit : auteur = le client, committer = le robot, draft un commit devant main.
    assert.notEqual(bench.git('rev-parse', 'HEAD'), base)
    assert.equal(bench.git('log', '-1', '--format=%an <%ae>|%cn'), 'Marie Client <marie@conduit.test>|Kuartz AI editor')
    assert.equal(bench.git('status', '--porcelain'), '')
    assert.match(await readFile(path.join(bench.repoDir, HERO_CSS), 'utf8'), /color: var\(--color-text\);/)
    // Captures lisibles, nom contrôlé.
    assert.equal((await bench.service.shot(job.id, '375-before.png')).length, 4)
    await assert.rejects(bench.service.shot(job.id, '../../data/editor.json'), (error: unknown) => (error as EngineError).status === 400)
    // Modification en attente, fil de la page, consommation.
    await bench.service.idle()
    const state = await bench.service.state('/', CLIENT)
    assert.equal(state.active, null)
    assert.equal(state.pending?.status, 'to-validate')
    assert.deepEqual(state.pending?.jobIds, [job.id])
    assert.equal(state.thread.length, 1)
    assert.equal(state.preview.url, 'http://127.0.0.1:4999/?kz_preview=token-for-u-client', 'URL émise pour l’utilisateur qui la demande')
    assert.equal(state.model.label, 'Opus 5.5')
    assert.equal(state.conversationUsage?.costUsd, 0.05)
    assert.equal(bench.usage.length, 1)
    assert.equal(bench.preview.closed(), 1)
  })

  it('rejected : Claude n’a rien modifié, rien n’est commité, la modification est close', async () => {
    bench = await makeBench([fakeScenarios.nothingChanged()])
    const base = bench.git('rev-parse', 'HEAD')
    const job = await bench.until((await start(bench)).id, ['rejected', 'done', 'failed'])
    assert.equal(job.status, 'rejected')
    assert.match(job.message ?? '', /already fits/)
    assert.equal(bench.git('rev-parse', 'HEAD'), base)
    await bench.service.idle()
    assert.equal((await bench.service.state('/', CLIENT)).pending, null)
    assert.equal(bench.store.editor.change(job.changeId)?.change.status, 'cancelled')
  })

  it('SEC-07 : une valeur en dur est refusée par le hook AVANT l’écriture (fichier intact, étape warn), rejected', async () => {
    bench = await makeBench([BAD_COLOR])
    const before = await readFile(path.join(bench.repoDir, HERO_CSS), 'utf8')
    const job = await bench.until((await start(bench)).id, ['done', 'failed', 'rejected'])
    assert.equal(job.status, 'rejected')
    assert.ok(job.steps.some((step) => step.kind === 'warn' && step.label.startsWith(`Edit refused (${HERO_CSS}): the file after this edit breaks`)))
    assert.equal(await readFile(path.join(bench.repoDir, HERO_CSS), 'utf8'), before)
    assert.equal(bench.git('status', '--porcelain'), '')
  })

  it('2e essai : contrôles refusés au 1er, session reprise, coût jamais doublé', async () => {
    // Une violation statique n'atteint plus le disque (SEC-07) : le refus vient ici des contrôles du rendu.
    bench = await makeBench(fakeScenarios.retryOnSecondAttempt(DARKER, fakeScenarios.editCss(HERO_CSS, 'color: var(--color-text);', 'color: var(--color-text-accent);', 'Fixed.')), {
      preview: { verdicts: [{ isolation: { ok: false, zones: ['hero.title'], detail: 'hero.title (375 px)' } }, {}] },
    })
    const job = await bench.until((await start(bench)).id, ['done', 'failed'])
    assert.equal(job.status, 'done', JSON.stringify(job.steps.map((s) => s.label)))
    assert.equal(job.attempts, 2)
    assert.equal(bench.agent.runs[1].resume, 'fake-session-1')
    assert.match(bench.agent.runs[1].prompt, /automatic checks refused/)
    assert.ok(job.steps.some((step) => step.kind === 'retry'))
    // Session reprise : le SDK rapporte le cumul (0,10 $), pas 0,05 + 0,10.
    assert.equal(job.usage?.costUsd, 0.1)
    assert.equal(job.usage?.costKind, 'billed')
  })

  it('failed : contrôles encore refusés au 2e essai → retour arrière complet, message du contrat', async () => {
    bench = await makeBench([DARKER, { steps: [], message: 'Tried again.' }], {
      preview: { verdicts: [{ isolation: { ok: false, zones: ['hero.title'], detail: 'hero.title (375 px)' } }] },
    })
    const before = await readFile(path.join(bench.repoDir, HERO_CSS), 'utf8')
    const base = bench.git('rev-parse', 'HEAD')
    const job = await bench.until((await start(bench)).id, ['done', 'failed'])
    assert.equal(job.status, 'failed')
    assert.equal(job.error, FAILED_MESSAGE)
    assert.ok(job.checks.some((check) => !check.ok))
    assert.equal(await readFile(path.join(bench.repoDir, HERO_CSS), 'utf8'), before)
    assert.equal(bench.git('rev-parse', 'HEAD'), base)
    assert.equal(bench.git('status', '--porcelain'), '')
  })

  it('contrôles du rendu refusés (isolation) puis corrigés au 2e essai', async () => {
    bench = await makeBench([DARKER, { steps: [], message: 'Kept the change.' }], {
      preview: { verdicts: [{ isolation: { ok: false, zones: ['hero.title'], detail: 'hero.title (375 px)' } }, {}] },
    })
    const job = await bench.until((await start(bench)).id, ['done', 'failed'])
    assert.equal(job.status, 'done')
    assert.equal(bench.preview.verifies(), 2)
    assert.ok(job.steps.some((step) => step.label === 'Rest of the page unchanged: not passed.'))
  })

  it('pas de 2e essai si le plafond du cumul de la demande est atteint', async () => {
    bench = await makeBench([{ ...DARKER, costUsd: 0.07 }, DARKER], {
      maxRequestUsd: 0.06,
      preview: { verdicts: [{ isolation: { ok: false, zones: ['hero.title'], detail: 'hero.title (375 px)' } }] },
    })
    const job = await bench.until((await start(bench)).id, ['done', 'failed'])
    assert.equal(job.status, 'failed')
    assert.equal(bench.agent.runs.length, 1)
    assert.ok(job.steps.some((step) => /budget of this change is used up/.test(step.label)))
    // Le budget passé au SDK est réduit à ce qui reste du plafond de la demande.
    assert.deepEqual(bench.budgets, [0.06])
  })

  it('plafond du SDK atteint, erreur fatale, plantage : failed, rien de changé, coût gardé', async () => {
    for (const call of [fakeScenarios.overBudget(), fakeScenarios.accessRefused(), fakeScenarios.crash([{ kind: 'edit', file: HERO_CSS, find: LEDE_MUTED, replace: ledeColor('var(--color-text)') }])] as FakeCall[]) {
      bench = await makeBench([call])
      const base = bench.git('rev-parse', 'HEAD')
      const job = await bench.until((await start(bench)).id, ['done', 'failed'])
      assert.equal(job.status, 'failed')
      assert.equal(job.error, FAILED_MESSAGE)
      assert.equal(bench.agent.runs.length, 1, 'aucun 2e essai')
      assert.equal(bench.git('rev-parse', 'HEAD'), base)
      assert.equal(bench.git('status', '--porcelain'), '')
      assert.ok((job.usage?.costUsd ?? 0) > 0)
      await bench.cleanup()
      bench = null
    }
  })

  it('le hook refuse un composant en 🖌 seul : aucun fichier touché, rejected', async () => {
    bench = await makeBench([{ steps: [{ kind: 'edit', file: HERO_TSX, find: 'section', replace: 'div' }], message: 'Done.' }])
    const job = await bench.until((await start(bench)).id, ['done', 'failed', 'rejected'])
    assert.equal(job.status, 'rejected')
    assert.ok(job.steps.some((step) => step.kind === 'warn'))
    assert.equal(bench.git('status', '--porcelain'), '')
  })

  it('aperçu indisponible : failed avant de lancer Claude', async () => {
    bench = await makeBench([DARKER], { preview: { failOpen: true } })
    const job = await bench.until((await start(bench)).id, ['done', 'failed'])
    assert.equal(job.status, 'failed')
    assert.equal(bench.agent.runs.length, 0)
  })

  it('design system invalide ou copie de travail sale', async () => {
    bench = await makeBench([DARKER])
    await writeFile(path.join(bench.repoDir, 'stray.txt'), 'left over')
    const job = await bench.until((await start(bench)).id, ['done', 'failed'])
    assert.equal(job.status, 'done')
    assert.ok(job.steps.some((step) => /unsaved changes/.test(step.label)))
    assert.equal(bench.git('status', '--porcelain'), '')
  })
})

describe('textes Sanity', () => {
  it('set_text : brouillon créé depuis le publié, textsBefore enregistré avant l’écriture, résumé', async () => {
    bench = await makeBench([fakeScenarios.setText(TITLE_FIELD, 'Dock scheduling, simply')])
    const job = await bench.until((await start(bench, editRequest({ zone: 'hero.title', scope: ['text'], note: 'Shorter title' }))).id, ['done', 'failed'])
    assert.equal(job.status, 'done', JSON.stringify(job.steps.map((s) => s.label)))
    assert.deepEqual(job.texts, [{ document: PAGE_DOC, path: 'hero.title', before: 'Dock scheduling that just works', after: 'Dock scheduling, simply' }])
    assert.equal(job.summary[0].where, 'sanity-draft')
    const docs = bench.sanity.docs
    assert.equal((docs[`drafts.${PAGE_DOC}`].hero as { title: string }).title, 'Dock scheduling, simply')
    assert.equal((docs[PAGE_DOC].hero as { title: string }).title, 'Dock scheduling that just works', 'le publié ne bouge pas')
    const stored = bench.store.editor.job(job.id)!
    assert.deepEqual(stored.internal.texts?.[PAGE_DOC], { id: PAGE_DOC, type: 'dockSchedulingPage', draftExisted: false, fields: { 'hero.title': 'Dock scheduling that just works' } })
    // Aucun commit (rien dans le code) ; le signal d'aperçu a attendu le texte écrit.
    assert.equal(bench.git('rev-list', '--count', 'main..draft'), '0')
    assert.ok(bench.signal.calls.some((call) => call.texts.includes('Dock scheduling, simply')))
    // Le prompt cite les textes comme des données.
    assert.match(bench.agent.runs[0].prompt, /Dock scheduling that just works/)
  })

  it('échec après un set_text : le brouillon créé par la demande est supprimé', async () => {
    bench = await makeBench([{ steps: [{ kind: 'set_text', field: TITLE_FIELD, value: 'Temporary title' }], outcome: 'error' }])
    const job = await bench.until((await start(bench, editRequest({ zone: 'hero.title', scope: ['text'] }))).id, ['done', 'failed'])
    assert.equal(job.status, 'failed')
    assert.equal(bench.sanity.docs[`drafts.${PAGE_DOC}`], undefined)
    assert.ok(bench.sanity.log.includes(`delete drafts.${PAGE_DOC}`))
  })

  it('brouillon déjà existant : valeur exacte restaurée, brouillon gardé', async () => {
    bench = await makeBench([{ steps: [{ kind: 'set_text', field: TITLE_FIELD, value: 'Temporary title' }], outcome: 'error' }])
    await bench.sanity.createIfNotExists({ _id: `drafts.${PAGE_DOC}`, _type: 'dockSchedulingPage', hero: { title: 'Draft title by a human', lede: 'x' } })
    const job = await bench.until((await start(bench, editRequest({ zone: 'hero.title', scope: ['text'] }))).id, ['done', 'failed'])
    assert.equal(job.status, 'failed')
    assert.equal((bench.sanity.docs[`drafts.${PAGE_DOC}`].hero as { title: string }).title, 'Draft title by a human')
  })

  it('restauration impossible : restoreFailed, nouvelle demande refusée (503) tant que le texte n’est pas remis', async () => {
    bench = await makeBench([{ steps: [{ kind: 'set_text', field: TITLE_FIELD, value: 'Temporary title' }], outcome: 'error' }, DARKER])
    // Retour arrière de la demande (tenté deux fois), puis la 1re nouvelle demande : trois échecs.
    for (let i = 0; i < 3; i++) bench.sanity.failNext('delete')
    const job = await bench.until((await start(bench, editRequest({ zone: 'hero.title', scope: ['text'] }))).id, ['done', 'failed'])
    assert.equal(job.status, 'failed')
    await bench.service.idle()
    assert.equal(bench.store.editor.job(job.id)?.internal.restoreFailed, true)
    assert.ok(bench.sanity.docs[`drafts.${PAGE_DOC}`], 'brouillon encore là')
    await assert.rejects(bench.service.request(CLIENT, editRequest()), (error: unknown) => (error as EngineError).status === 503)
    // Sanity répond de nouveau : le texte est remis, puis la demande démarre.
    const next = await start(bench)
    assert.equal(bench.sanity.docs[`drafts.${PAGE_DOC}`], undefined)
    assert.equal(bench.store.editor.job(job.id)?.internal.restoreFailed, false)
    assert.equal((await bench.until(next.id, ['done', 'failed'])).status, 'done')
  })

  it('Cancel quand Sanity échoue : 503, rien n’a bougé ; Cancel retenté : tout est remis', async () => {
    bench = await makeBench([{ steps: [...DARKER.steps!, { kind: 'set_text', field: TITLE_FIELD, value: 'Claude title' }], message: 'ok' }])
    const base = bench.git('rev-parse', 'HEAD')
    const request = { ...editRequest({ scope: ['style', 'text'] }), targets: [{ zone: 'hero.lede', index: 0, label: 'x' }, { zone: 'hero.title', index: 0, label: 'y' }] }
    const first = await start(bench, request)
    await bench.until(first.id, ['done'])
    await bench.service.idle()
    const head = bench.git('rev-parse', 'HEAD')
    bench.sanity.failNext('patch')
    await assert.rejects(bench.service.cancel(CLIENT, first.changeId), (error: unknown) => (error as EngineError).status === 503)
    assert.equal(bench.git('rev-parse', 'HEAD'), head)
    assert.equal(bench.store.editor.change(first.changeId)?.change.status, 'to-validate')
    assert.equal((await bench.service.cancel(CLIENT, first.changeId)).status, 'cancelled')
    assert.equal(bench.git('rev-parse', 'HEAD'), base)
    assert.equal(bench.sanity.docs[`drafts.${PAGE_DOC}`], undefined)
  })

  it('sans jeton d’écriture : la portée Text (Sanity) est refusée 503 unavailable, le Style fonctionne', async () => {
    bench = await makeBench([DARKER], { noWriteToken: true })
    await assert.rejects(bench.service.request(CLIENT, editRequest({ zone: 'hero.title', scope: ['text'] })), (error: unknown) => {
      return error instanceof EngineError && error.status === 503 && error.code === 'unavailable'
    })
    const job = await bench.until((await start(bench)).id, ['done', 'failed'])
    assert.equal(job.status, 'done')
  })
})

describe('questions au client', () => {
  const question = {
    question: 'This orange is not in the design system. Which one?',
    options: [
      { label: 'Accent orange', tone: 'recommended' as const },
      { label: 'Leave it as is', tone: 'neutral' as const },
    ],
  }

  it('waiting puis réponse : Claude continue avec le choix du client', async () => {
    bench = await makeBench([fakeScenarios.ask([question], DARKER.steps)])
    const id = (await start(bench)).id
    const waiting = await bench.until(id, ['waiting', 'failed'])
    assert.equal(waiting.status, 'waiting')
    assert.equal(waiting.question?.questions.length, 1)
    assert.ok(Date.parse(waiting.question!.expiresAt) > Date.parse(waiting.question!.askedAt))
    const option = waiting.question!.questions[0].options[0]
    await assert.rejects(bench.service.answer(CLIENT, id, { answers: [] }), (error: unknown) => (error as EngineError).status === 400)
    const answered = await bench.service.answer(CLIENT, id, { answers: [{ questionId: waiting.question!.questions[0].id, optionId: option.id }] })
    assert.equal(answered.status, 'running')
    assert.equal(answered.question, undefined)
    const job = await bench.until(id, ['done', 'failed'])
    assert.equal(job.status, 'done')
    assert.deepEqual(job.answers, [{ questionId: waiting.question!.questions[0].id, optionId: option.id }])
    await expect409(bench.service.answer(CLIENT, id, { answers: [] }), 'conflict')
  })

  it('question sans réponse au délai : stopped, rien de changé', async () => {
    bench = await makeBench([fakeScenarios.ask([question], DARKER.steps)], { questionTimeoutMs: 60 })
    const job = await bench.until((await start(bench)).id, ['stopped', 'done', 'failed'])
    assert.equal(job.status, 'stopped')
    assert.match(job.error ?? '', /No answer for 1 minutes? — stopped, nothing was changed\./)
    assert.equal(bench.git('status', '--porcelain'), '')
  })
})

describe('Stop', () => {
  it('pendant le travail : arrêt, retour arrière, « Stopped — nothing was changed. »', async () => {
    bench = await makeBench([{ steps: [{ kind: 'edit', file: HERO_CSS, find: LEDE_MUTED, replace: ledeColor('var(--color-text)') }, { kind: 'wait', ms: 5_000 }], message: 'x' }])
    const id = (await start(bench)).id
    await bench.until(id, ['running'])
    for (let i = 0; i < 100 && bench.agent.runs.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10))
    const stopped = await bench.service.stop(CLIENT, id)
    assert.equal(stopped.status, 'stopped')
    assert.equal(stopped.error, STOPPED_MESSAGE)
    assert.equal(bench.git('status', '--porcelain'), '')
  })

  it('pendant une question : arrêt immédiat', async () => {
    bench = await makeBench([fakeScenarios.ask([{ question: 'Which?', options: [{ label: 'A', tone: 'recommended' }, { label: 'B', tone: 'neutral' }] }])])
    const id = (await start(bench)).id
    await bench.until(id, ['waiting'])
    const stopped = await bench.service.stop(KUARTZ, id)
    assert.equal(stopped.status, 'stopped')
  })
})

describe('modification en attente : ajustement, Validate, Cancel, 409', () => {
  it('409 busy pendant le travail, awaiting_validation ensuite, publishing pendant une publication', async () => {
    bench = await makeBench([{ ...DARKER, steps: [...DARKER.steps!, { kind: 'wait', ms: 200 }] }, ACCENT])
    const first = await start(bench)
    await expect409(bench.service.request(KUARTZ, editRequest()), 'busy')
    assert.equal(bench.service.blocker(), 'busy')
    await bench.until(first.id, ['done'])
    await bench.service.idle()
    await expect409(bench.service.request(KUARTZ, editRequest()), 'awaiting_validation')
    assert.equal(bench.service.blocker(), 'awaiting_validation')
    // Verrou partagé avec engine-publish : pas de publication tant qu'une modification attend.
    await expect409(bench.lock.runPublish(async () => 'published'), 'awaiting_validation')
    await bench.service.validate(CLIENT, first.changeId)
    assert.equal(bench.service.blocker(), null)
    const release = bench.lock.acquirePublish()
    await expect409(bench.service.request(KUARTZ, editRequest()), 'publishing')
    await expect409(bench.service.validate(CLIENT, first.changeId).then(() => bench!.service.cancel(CLIENT, first.changeId)), 'conflict')
    release()
  })

  it('ajustement puis Validate : UN seul commit au nom de l’auteur de la demande', async () => {
    bench = await makeBench([DARKER, ACCENT])
    const base = bench.git('rev-parse', 'HEAD')
    const first = await start(bench)
    await bench.until(first.id, ['done'])
    await bench.service.idle()
    const adjust = await bench.service.request(KUARTZ, editRequest({ changeId: first.changeId, note: 'Orange instead.' }))
    assert.equal(adjust.kind, 'adjustment')
    assert.equal(adjust.changeId, first.changeId)
    await bench.until(adjust.id, ['done'])
    await bench.service.idle()
    assert.equal(bench.git('rev-list', '--count', `${base}..HEAD`), '2')
    const pending = (await bench.service.state('/', CLIENT)).pending!
    assert.equal(pending.adjustments, 1)
    assert.equal(pending.jobIds.length, 2)
    assert.equal(pending.usage?.costUsd, 0.1)

    const validated = await bench.service.validate(KUARTZ, first.changeId)
    assert.equal(validated.status, 'validated')
    assert.equal(bench.git('rev-list', '--count', `${base}..HEAD`), '1')
    assert.equal(validated.commit, bench.git('rev-parse', 'HEAD'))
    assert.equal(bench.git('log', '-1', '--format=%an'), 'Marie Client')
    assert.match(bench.git('log', '-1', '--format=%B'), /Validated by Kuartz Dev/)
    assert.match(await readFile(path.join(bench.repoDir, HERO_CSS), 'utf8'), /var\(--color-text-accent\)/)
    const state = await bench.service.state('/', CLIENT)
    assert.equal(state.pending, null)
    assert.deepEqual(state.thread.map((entry) => entry.type), ['job', 'job', 'validated'])
    assert.equal(state.thread[2].type === 'validated' && state.thread[2].pendingTotal, 1)
    const design = await bench.service.validatedDesign()
    assert.deepEqual(design.map((item) => [item.changeId, item.files]), [[first.changeId, [HERO_CSS]]])
    // Idempotent.
    assert.equal((await bench.service.validate(KUARTZ, first.changeId)).status, 'validated')
  })

  it('Validate accepté dès que la demande est done, sans attendre l’écriture du journal de consommation', async () => {
    bench = await makeBench([DARKER], { usageDelayMs: 1_500 })
    const first = await start(bench)
    await bench.until(first.id, ['done'], 10_000)
    // Aucun `idle()` : l'admin envoie Validate dès que le sondage montre done, le journal (lent) n'est pas encore écrit.
    const started = Date.now()
    const validated = await bench.service.validate(CLIENT, first.changeId)
    assert.equal(validated.status, 'validated')
    assert.ok(Date.now() - started < 1_000, `Validate a attendu le journal (${Date.now() - started} ms)`)
    assert.equal(bench.usage.length, 0)
    assert.equal(bench.service.blocker(), null)
    // Le journal reste suivi : `idle()` l'attend, l'entrée n'est pas perdue.
    await bench.service.idle()
    assert.deepEqual(bench.usage.map((job) => job.id), [first.id])
  })

  it('résumé et titre de publication : l’état FINAL après un ajustement, sans la valeur remplacée', async () => {
    bench = await makeBench([DARKER, ACCENT])
    const first = await start(bench)
    await bench.until(first.id, ['done'])
    await bench.service.idle()
    const adjust = await bench.service.request(CLIENT, editRequest({ changeId: first.changeId, note: 'Orange instead.' }))
    await bench.until(adjust.id, ['done'])
    await bench.service.idle()
    const pending = (await bench.service.state('/', CLIENT)).pending!
    assert.deepEqual(pending.summary, [{ target: 'Hero · Lede', description: 'color → Color text accent (token)', kind: 'style', where: 'code' }])
    await bench.service.validate(CLIENT, first.changeId)
    const [item] = await bench.service.validatedDesign()
    assert.equal(item.title, 'Hero · Lede — color → Color text accent (token)')
  })

  it('ajustement puis Cancel : retour arrière de la demande ET de l’ajustement (fichiers + textes)', async () => {
    bench = await makeBench([
      { steps: [...DARKER.steps!, { kind: 'set_text', field: TITLE_FIELD, value: 'First title' }], message: 'ok' },
      { steps: [{ kind: 'set_text', field: TITLE_FIELD, value: 'Second title' }], message: 'ok' },
    ])
    const base = bench.git('rev-parse', 'HEAD')
    const request = { ...editRequest({ scope: ['style', 'text'] }), targets: [{ zone: 'hero.lede', index: 0, label: 'x' }, { zone: 'hero.title', index: 0, label: 'y' }] }
    const first = await start(bench, request)
    await bench.until(first.id, ['done'])
    await bench.service.idle()
    const adjust = await bench.service.request(CLIENT, { ...request, changeId: first.changeId })
    await bench.until(adjust.id, ['done'])
    await bench.service.idle()
    assert.equal((bench.sanity.docs[`drafts.${PAGE_DOC}`].hero as { title: string }).title, 'Second title')

    const cancelled = await bench.service.cancel(CLIENT, first.changeId)
    assert.equal(cancelled.status, 'cancelled')
    assert.equal(bench.git('rev-parse', 'HEAD'), base)
    assert.equal(bench.git('status', '--porcelain'), '')
    assert.equal(bench.sanity.docs[`drafts.${PAGE_DOC}`], undefined, 'brouillon créé par la modification : supprimé')
    const state = await bench.service.state('/', CLIENT)
    assert.equal(state.pending, null)
    assert.equal(state.thread.at(-1)?.type, 'cancelled')
  })

  it('Cancel refusé si un texte a été retouché ailleurs depuis', async () => {
    bench = await makeBench([fakeScenarios.setText(TITLE_FIELD, 'Claude title')])
    const first = await start(bench, editRequest({ zone: 'hero.title', scope: ['text'] }))
    await bench.until(first.id, ['done'])
    await bench.service.idle()
    await bench.sanity.patch(`drafts.${PAGE_DOC}`, { set: { 'hero.title': 'Edited by hand' } })
    await expect409(bench.service.cancel(CLIENT, first.changeId), 'conflict')
  })

  it('un ajustement qui échoue laisse la modification telle qu’avant lui', async () => {
    bench = await makeBench([DARKER, fakeScenarios.fails()])
    const first = await start(bench)
    await bench.until(first.id, ['done'])
    await bench.service.idle()
    const head = bench.git('rev-parse', 'HEAD')
    const adjust = await bench.service.request(CLIENT, editRequest({ changeId: first.changeId }))
    await bench.until(adjust.id, ['failed'])
    await bench.service.idle()
    assert.equal(bench.git('rev-parse', 'HEAD'), head)
    assert.equal(bench.store.editor.change(first.changeId)?.change.status, 'to-validate')
    await assert.rejects(bench.service.request(CLIENT, editRequest({ changeId: first.changeId, page: '/blog' })), (error: unknown) => (error as EngineError).status === 400)
  })
})

describe('reprise au démarrage (piège 7 du POC)', () => {
  it('demande interrompue : failed, fichiers remis, texte Sanity restauré, commit orphelin retiré', async () => {
    bench = await makeBench([])
    const base = bench.git('rev-parse', 'HEAD')
    // Simule un moteur tombé en pleine demande : texte écrit, fichier modifié ET commité, statut « running ».
    await bench.sanity.createIfNotExists({ ...bench.sanity.docs[PAGE_DOC], _id: `drafts.${PAGE_DOC}`, _type: 'dockSchedulingPage' })
    await bench.sanity.patch(`drafts.${PAGE_DOC}`, { set: { 'hero.title': 'Half-written' } })
    await writeFile(path.join(bench.repoDir, HERO_CSS), 'broken')
    bench.git('commit', '--quiet', '-am', 'orphan')
    await writeFile(path.join(bench.repoDir, 'junk.css'), 'x')
    await bench.store.editor.transact((data) => {
      data.jobs.job_interrupted0 = {
        job: { id: 'job_interrupted0', changeId: 'chg_interrupted0', kind: 'request', request: editRequest({ zone: 'hero.title', scope: ['text'] }) as never, requestedBy: CLIENT, createdAt: new Date().toISOString(), status: 'running', steps: [], summary: [], checks: [], texts: [], hardcoded: [], attempts: 1 },
        internal: {
          headBefore: base,
          texts: { [PAGE_DOC]: { id: PAGE_DOC, type: 'dockSchedulingPage', draftExisted: false, fields: { 'hero.title': 'Dock scheduling that just works' } } },
          textsDirty: true,
        },
      }
      data.changes.chg_interrupted0 = {
        change: { id: 'chg_interrupted0', page: '/', targets: [], status: 'working', jobIds: ['job_interrupted0'], adjustments: 0, summary: [], checks: [], createdAt: new Date().toISOString(), createdBy: CLIENT },
        internal: { baseCommit: base, commits: [] },
      }
    })
    await bench.service.recover()
    const job = bench.store.editor.job('job_interrupted0')!
    assert.equal(job.job.status, 'failed')
    assert.equal(job.job.error, INTERRUPTED_MESSAGE)
    assert.equal(job.internal.textsDirty, false)
    assert.equal(bench.sanity.docs[`drafts.${PAGE_DOC}`], undefined)
    assert.equal(bench.git('rev-parse', 'HEAD'), base)
    assert.equal(bench.git('status', '--porcelain'), '')
    assert.equal(bench.store.editor.change('chg_interrupted0')?.change.status, 'cancelled')
    assert.equal(bench.service.blocker(), null)
  })
})

describe('entrée de la demande', () => {
  it('refus 400 : zone inconnue, note vide ou trop longue, périmètre impossible, plus de 8 éléments', async () => {
    bench = await makeBench([])
    const bad = async (body: unknown) =>
      assert.rejects(bench!.service.request(CLIENT, body), (error: unknown) => error instanceof EngineError && error.status === 400)
    await bad(editRequest({ zone: 'nope' }))
    await bad(editRequest({ zone: '__proto__' }))
    await bad(editRequest({ note: '   ' }))
    await bad(editRequest({ note: 'x'.repeat(601) }))
    await bad({ ...editRequest(), scope: [] })
    await bad({ ...editRequest(), viewport: 1000 })
    await bad({ ...editRequest(), page: '//evil.example' })
    await bad({ ...editRequest(), targets: Array.from({ length: 9 }, () => ({ zone: 'hero.lede', index: 0, label: 'x' })) })
    await bad(editRequest({ zone: 'hero', scope: ['text'] }))
    assert.equal(bench.store.editor.activeJobs().length, 0)
  })

  it('503 sans accès Claude ou tant que l’aperçu n’est pas prêt', async () => {
    bench = await makeBench([], { access: { ok: false, error: 'No Claude access.' } })
    await assert.rejects(bench.service.request(CLIENT, editRequest()), (error: unknown) => (error as EngineError).status === 503)
    await bench.cleanup()
    bench = await makeBench([], { previewReady: () => false })
    await assert.rejects(bench.service.request(CLIENT, editRequest()), (error: unknown) => (error as EngineError).status === 503)
  })
})
