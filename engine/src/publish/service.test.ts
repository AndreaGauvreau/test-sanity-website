import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'vitest'
import type { EngineError } from '../server/errors'
import { fakeScenarios } from '../claude'
import { CLIENT, editRequest, HERO_CSS, KUARTZ, PAGE_DOC, TITLE_FIELD } from '../jobs/testing'
import { INTERRUPTED_PUBLISH } from './service'
import { readExtra } from './state'
import { makePublishBench, writeDraft, type PublishBench, type PublishBenchOptions } from './testing'

/**
 * Publication de bout en bout sur un VRAI dépôt git temporaire (main/draft), avec faux Sanity, faux Claude, faux fetch
 * (hook Vercel, revalidation) et faux typecheck. Jamais de réseau, jamais le vrai dépôt.
 */

let bench: PublishBench | null = null
afterEach(async () => {
  await bench?.publish.idle()
  await bench?.cleanup()
  bench = null
})

async function setup(options: PublishBenchOptions = {}) {
  bench = await makePublishBench(options)
  return bench
}

const HOME = { _id: PAGE_DOC, _type: 'dockSchedulingPage' }
const POST = {
  _id: 'post-carrier',
  _type: 'post',
  title: 'Carrier portals: a checklist',
  slug: { _type: 'slug', current: 'carrier-portals' },
  excerpt: 'Short.',
  content: [{ _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: 'Body.' }] }],
}

async function rejects(promise: Promise<unknown>, status: number, code: string): Promise<EngineError> {
  try {
    await promise
  } catch (error) {
    const engineError = error as EngineError
    assert.deepEqual([engineError.status, engineError.code], [status, code], engineError.message)
    return engineError
  }
  assert.fail(`expected ${status} ${code}`)
}

const keysOf = async (b: PublishBench) => {
  const status = await b.publish.status()
  return [...status.pending.content.map((item) => item.id), ...status.pending.design.map((item) => item.changeId)]
}

describe('GET /publish/status', () => {
  it('brouillons comparés au publié, chemins lisibles, design validé, total et état partagé', async () => {
    const b = await setup()
    assert.deepEqual((await b.publish.status()).state, 'idle')
    await writeDraft(b.sanity, HOME, { 'hero.title': 'Dock scheduling, solved.' })
    await b.sanity.createIfNotExists(POST)
    await writeDraft(b.sanity, POST, { excerpt: 'Longer excerpt.' })
    // Brouillon identique au publié (reste d'une annulation) et type non géré : jamais listés.
    await b.sanity.createIfNotExists({ _id: 'faq-1', _type: 'faq', question: 'Why?' })
    await writeDraft(b.sanity, { _id: 'faq-1', _type: 'faq' })
    await b.sanity.createIfNotExists({ _id: 'drafts.aiUsage.job_x', _type: 'aiUsage' })
    const change = await b.addValidatedChange({ file: HERO_CSS, content: '.title { color: red; }\n' })

    const status = await b.publish.status()
    assert.equal(status.state, 'pending')
    assert.equal(status.pending.total, 3)
    assert.equal(status.pending.lastValidatedAt, change.validatedAt)
    const byId = Object.fromEntries(status.pending.content.map((item) => [item.id, item]))
    assert.deepEqual(Object.keys(byId).sort(), [PAGE_DOC, 'post-carrier'])
    assert.deepEqual([byId[PAGE_DOC].path, byId[PAGE_DOC].summary, byId[PAGE_DOC].viewPath], ['Home › Hero · Title', '“Dock scheduling, solved.”', '/'])
    assert.deepEqual([byId['post-carrier'].path, byId['post-carrier'].summary], ['Blog › Carrier portals: a checklist', '“Longer excerpt.”'])
    assert.ok(!('rev' in byId[PAGE_DOC]), 'la révision interne ne sort pas')
    assert.deepEqual(status.pending.design.map((item) => [item.changeId, item.files]), [[change.id, [HERO_CSS]]])
    assert.deepEqual(status.deploy.mode, 'local')
    assert.match(status.deploy.note ?? '', /Local mode/)
    assert.equal(await b.publish.pendingTotal(), 3)
  })

  it('auteur connu pour un texte écrit par l’éditeur IA ; sans jeton Sanity : design seul et note claire', async () => {
    const b = await setup({ script: [fakeScenarios.setText(TITLE_FIELD, 'Dock scheduling, solved.')] })
    const job = await b.service.request(CLIENT, editRequest({ zone: 'hero.title', scope: ['text'] }))
    await b.until(job.id, ['done'])
    await b.service.idle()
    await b.service.validate(CLIENT, job.changeId)
    const item = (await b.publish.status()).pending.content.find((entry) => entry.id === PAGE_DOC)
    assert.equal(item?.author, CLIENT.name)

    const none = await makePublishBench({ noSanity: true })
    try {
      const status = await none.publish.status()
      assert.deepEqual(status.pending.content, [])
      assert.match(status.deploy.note ?? '', /no Sanity write token/)
    } finally {
      await none.cleanup()
    }
  })

  it('Sanity injoignable : 503 unavailable ; le compteur N retombe sur le design seul', async () => {
    const b = await setup()
    await b.addValidatedChange({ file: HERO_CSS, content: '.title { color: red; }\n' })
    b.sanity.failNext('fetch')
    await rejects(b.publish.status(), 503, 'unavailable')
    b.sanity.failNext('fetch')
    assert.equal(await b.publish.pendingTotal(), 1)
  })

  it('texte seul validé puis publié dans le Studio (hors moteur) : réconcilié « published » au démarrage', async () => {
    const b = await setup({ script: [fakeScenarios.setText(TITLE_FIELD, 'Dock scheduling, solved.')] })
    const job = await b.service.request(CLIENT, editRequest({ zone: 'hero.title', scope: ['text'] }))
    await b.until(job.id, ['done'])
    await b.service.idle()
    await b.service.validate(CLIENT, job.changeId)
    await b.sanity.action([{ actionType: 'sanity.action.document.publish', draftId: `drafts.${PAGE_DOC}`, publishedId: PAGE_DOC }])
    await b.publish.recover()
    for (let i = 0; i < 200 && b.store.editor.change(job.changeId)?.change.status !== 'published'; i++) await new Promise((resolve) => setTimeout(resolve, 5))
    assert.equal(b.store.editor.change(job.changeId)?.change.status, 'published')
  })
})

describe('POST /publish', () => {
  it('contenu seul : 4 étapes (1 fait, 2-3 sautées, 4 revalidation), publication live, état « published »', async () => {
    const b = await setup()
    await writeDraft(b.sanity, HOME, { 'hero.title': 'Dock scheduling, solved.' })
    const started = await b.publish.publish(KUARTZ, { expected: await keysOf(b) })
    assert.equal(started.state, 'publishing')
    await b.publish.idle()

    const status = await b.publish.status()
    assert.equal(status.state, 'published')
    assert.equal(status.pending.total, 0)
    assert.deepEqual(
      status.run?.steps.map((step) => step.status),
      ['done', 'skipped', 'skipped', 'done'],
    )
    assert.equal(status.run?.steps[3].label, 'Live on conduit.com')
    assert.equal(b.sanity.docs[PAGE_DOC].hero && (b.sanity.docs[PAGE_DOC].hero as { title: string }).title, 'Dock scheduling, solved.')
    assert.equal(b.sanity.docs[`drafts.${PAGE_DOC}`], undefined)
    // Une seule requête Actions, avec ifDraftRevisionId.
    assert.equal(b.sanity.log.filter((line) => line.startsWith('sanity.action.document.publish')).length, 1)
    // Revalidation : POST, en-tête secret, tout le site.
    assert.deepEqual(
      b.fetch.calls.map((call) => [call.url, call.method, call.headers['x-kz-revalidate'], call.body]),
      [['http://127.0.0.1:4040/api/revalidate', 'POST', 'revalidate-secret-test', '{}']],
    )
    const publications = b.store.publications.get().publications
    assert.deepEqual(publications.map((p) => [p.number, p.status, p.by, p.tag]), [[1, 'live', KUARTZ.name, undefined]])
    assert.deepEqual(publications[0].content, [{ id: PAGE_DOC, path: 'Home › Hero · Title' }])
    assert.equal(b.typechecks, 0)
  })

  it('contenu + code (vrai cycle de l’éditeur) : typecheck, main ← draft sans checkout, tag, hook Vercel, statut published', async () => {
    const b = await setup({
      script: [fakeScenarios.editCss(HERO_CSS, 'color: var(--color-text-muted);', 'color: var(--color-text);', 'Darker.')],
      deployHookUrl: 'https://api.vercel.com/v1/integrations/deploy/secret-hook',
      respond: (call) => (call.url.includes('vercel') ? { status: 201, body: '{"job":{"id":"dpl_job1","state":"PENDING"}}' } : { status: 200 }),
    })
    const job = await b.service.request(CLIENT, editRequest())
    await b.until(job.id, ['done'])
    await b.service.idle()
    const change = await b.service.validate(CLIENT, job.changeId)
    await writeDraft(b.sanity, HOME, { 'hero.title': 'Dock scheduling, solved.' })

    const draftHead = b.git('rev-parse', 'draft')
    assert.notEqual(b.git('rev-parse', 'main'), draftHead)
    await b.publish.publish(CLIENT, { expected: await keysOf(b) })
    await b.publish.idle()

    const status = await b.publish.status()
    assert.equal(status.state, 'published', JSON.stringify(status.run))
    assert.deepEqual(status.run?.steps.map((step) => step.status), ['done', 'done', 'done', 'done'])
    assert.equal(status.deploy.mode, 'vercel-hook')
    assert.equal(b.git('rev-parse', 'main'), draftHead)
    assert.equal(b.git('rev-parse', 'publication-1^{commit}'), draftHead)
    assert.equal(b.git('rev-parse', '--abbrev-ref', 'HEAD'), 'draft', 'main n’est jamais extraite')
    assert.equal(b.typechecks, 1)
    assert.equal(b.store.editor.change(change.id)?.change.status, 'published')
    assert.deepEqual(b.fetch.calls.map((call) => call.method), ['POST', 'POST'])
    const [publication] = b.store.publications.get().publications
    assert.deepEqual([publication.status, publication.tag, publication.commit, publication.note], ['live', 'publication-1', draftHead, 'Vercel deployment job dpl_job1'])
    assert.deepEqual(publication.design.map((item) => item.changeId), [change.id])
    // Rien de secret dans l'état partagé.
    assert.ok(!JSON.stringify(status).includes('secret-hook'))
  })

  it('échec au build : état failed, journal, main inchangée, contenu déjà en ligne ; retry reprend à l’étape 2', async () => {
    let compiles = false
    const b = await setup({ typecheck: async () => (compiles ? null : "src/components/Hero.tsx(3,1): error TS1005: ';' expected.") })
    const change = await b.addValidatedChange({ file: HERO_CSS, content: '.title { color: red; }\n' })
    await writeDraft(b.sanity, HOME, { 'hero.title': 'Dock scheduling, solved.' })
    const mainBefore = b.git('rev-parse', 'main')

    await b.publish.publish(CLIENT, { expected: await keysOf(b) })
    await b.publish.idle()
    let status = await b.publish.status()
    assert.equal(status.state, 'failed')
    assert.equal(status.run?.step, 2)
    assert.deepEqual(status.run?.steps.map((step) => step.status), ['done', 'failed', 'waiting', 'waiting'])
    assert.match(status.run?.error?.message ?? '', /doesn’t compile.*previous code version is still live.*content changes are already live/)
    assert.match(status.run?.error?.log ?? '', /TS1005/)
    assert.equal(b.git('rev-parse', 'main'), mainBefore)
    assert.deepEqual(b.store.publications.get().publications.map((p) => [p.number, p.status]), [[1, 'failed']])
    assert.equal(b.store.editor.change(change.id)?.change.status, 'validated')
    // Pendant l'échec, une nouvelle demande de l'éditeur reste possible (verrou rendu).
    assert.equal(b.lock.isPublishing(), false)

    compiles = true
    const retried = await b.publish.retry(CLIENT)
    assert.equal(retried.state, 'publishing')
    await b.publish.idle()
    status = await b.publish.status()
    assert.equal(status.state, 'published')
    assert.deepEqual(status.run?.steps.map((step) => step.status), ['done', 'done', 'skipped', 'done'])
    assert.equal(b.sanity.log.filter((line) => line.startsWith('sanity.action.document.publish')).length, 1, 'étape 1 pas refaite')
    assert.equal(b.git('rev-parse', 'main'), b.git('rev-parse', 'draft'))
    assert.deepEqual(b.store.publications.get().publications.map((p) => [p.number, p.status, p.tag]), [[1, 'live', 'publication-1']])
    assert.equal(b.store.editor.change(change.id)?.change.status, 'published')
    await rejects(b.publish.retry(CLIENT), 409, 'conflict')
  })

  it('échec de la revalidation (étape 4) puis retry ; la publication suivante prend le numéro suivant', async () => {
    let up = false
    const b = await setup({ respond: () => (up ? { status: 200 } : { status: 401, body: '{"error":"unauthorized"}' }) })
    await writeDraft(b.sanity, HOME, { 'hero.title': 'One' })
    await b.publish.publish(CLIENT, { expected: await keysOf(b) })
    await b.publish.idle()
    const failed = await b.publish.status()
    assert.deepEqual([failed.state, failed.run?.step], ['failed', 4])
    assert.match(failed.run?.error?.message ?? '', /HTTP 401.*The content changes are already live/)
    up = true
    await b.publish.retry(CLIENT)
    await b.publish.idle()
    assert.equal((await b.publish.status()).state, 'published')

    await writeDraft(b.sanity, HOME, { 'hero.title': 'Two' })
    await b.publish.publish(CLIENT, { expected: await keysOf(b) })
    await b.publish.idle()
    assert.deepEqual(b.store.publications.get().publications.map((p) => [p.number, p.status]), [
      [1, 'previous'],
      [2, 'live'],
    ])
  })

  it('brouillon modifié après Publish (ifDraftRevisionId) : rien publié, failed ; une nouvelle publication passe', async () => {
    const b = await setup()
    await writeDraft(b.sanity, HOME, { 'hero.title': 'One' })
    // Sanity refuse l'action (révision du brouillon changée entre la liste et la publication).
    b.sanity.failNext('action', new Error('Fake Sanity: draft revision mismatch'))
    await b.publish.publish(CLIENT, { expected: await keysOf(b) })
    await b.publish.idle()
    const status = await b.publish.status()
    assert.deepEqual([status.state, status.run?.step], ['failed', 1])
    assert.match(status.run?.error?.message ?? '', /changed during the publication. Nothing was published/)
    assert.doesNotMatch(status.run?.error?.message ?? '', /already live/)
    assert.equal((b.sanity.docs[PAGE_DOC].hero as { title: string }).title, 'Dock scheduling that just works')
    // Brouillon retouché depuis : la révision notée ne correspond plus → refus explicite au retry.
    await b.sanity.patch(`drafts.${PAGE_DOC}`, { set: { 'hero.lede': 'Edited meanwhile' } })
    await b.publish.retry(CLIENT)
    await b.publish.idle()
    assert.match((await b.publish.status()).run?.error?.message ?? '', /changed after you pressed Publish/)
    // Une nouvelle publication (liste revue) passe.
    await b.publish.publish(CLIENT, { expected: await keysOf(b) })
    await b.publish.idle()
    assert.equal((await b.publish.status()).state, 'published')
    assert.deepEqual(b.store.publications.get().publications.map((p) => [p.number, p.status]), [
      [1, 'failed'],
      [2, 'live'],
    ])
  })

  it('409 : liste changée, @version périmée, demande active, modification non validée, publication en cours ; 400 sans rien', async () => {
    const b = await setup({ script: [fakeScenarios.ask([{ question: 'Which size?', options: [{ label: 'Heading XL', tone: 'recommended' }, { label: 'Keep it', tone: 'neutral' }] }]), fakeScenarios.editCss(HERO_CSS, 'color: var(--color-text-muted);', 'color: var(--color-text);')] })
    await rejects(b.publish.publish(CLIENT, { expected: [] }), 400, 'bad_request')
    await rejects(b.publish.publish(CLIENT, { nope: true }), 400, 'bad_request')
    await writeDraft(b.sanity, HOME, { 'hero.title': 'One' })
    await rejects(b.publish.publish(CLIENT, { expected: [] }), 409, 'conflict')
    await rejects(b.publish.publish(CLIENT, { expected: [PAGE_DOC, 'post-x'] }), 409, 'conflict')
    await rejects(b.publish.publish(CLIENT, { expected: [`${PAGE_DOC}@2020-01-01T00:00:00Z`] }), 409, 'conflict')
    assert.equal(b.lock.isPublishing(), false, 'verrou rendu après un refus')

    // Demande active (Claude attend une réponse) → busy.
    const job = await b.service.request(CLIENT, editRequest())
    await b.until(job.id, ['waiting'])
    await rejects(b.publish.publish(CLIENT, { expected: await keysOf(b) }), 409, 'busy')
    await b.service.stop(CLIENT, job.id)
    await b.until(job.id, ['stopped'])
    await b.service.idle()

    // Modification faite mais pas validée → awaiting_validation.
    const second = await b.service.request(CLIENT, editRequest())
    await b.until(second.id, ['done'])
    await b.service.idle()
    await rejects(b.publish.publish(CLIENT, { expected: await keysOf(b) }), 409, 'awaiting_validation')
    await b.service.validate(CLIENT, second.changeId)

    // Publication en cours → publishing (et l'éditeur refuse aussi).
    const keys = await keysOf(b)
    const release = b.lock.acquirePublish()
    await rejects(b.publish.publish(CLIENT, { expected: keys }), 409, 'publishing')
    await rejects(b.service.request(CLIENT, editRequest()), 409, 'publishing')
    release()
    // La forme @version exacte est acceptée.
    const item = (await b.publish.status()).pending.content[0]
    await b.publish.publish(CLIENT, { expected: [`${item.id}@${item.updatedAt}`, second.changeId] })
    await b.publish.idle()
    assert.equal((await b.publish.status()).state, 'published')
  })

  it('draft avec un commit qui n’est pas une modification validée : refusé AVANT de publier le contenu', async () => {
    const b = await setup()
    await writeDraft(b.sanity, HOME, { 'hero.title': 'One' })
    await b.repo.run(['commit', '--allow-empty', '--quiet', '-m', 'manual commit'])
    const error = await rejects(b.publish.publish(CLIENT, { expected: await keysOf(b) }), 409, 'conflict')
    assert.match(error.message, /not part of this publication/)
    assert.ok(b.sanity.docs[`drafts.${PAGE_DOC}`], 'contenu pas publié')
  })

  it('push (ENGINE_GIT_PUSH=1) vers la branche suivie du dépôt source, avec le tag', async () => {
    const b = await setup({ push: true, sourceBranch: 'dashboard' })
    const origin = await mkdtemp(path.join(os.tmpdir(), 'kz-origin-'))
    try {
      execFileSync('git', ['init', '--quiet', '--bare', origin])
      b.git('remote', 'add', 'origin', origin)
      b.git('push', '--quiet', 'origin', 'main:refs/heads/dashboard')
      const change = await b.addValidatedChange({ file: HERO_CSS, content: '.title { color: blue; }\n' })
      await b.publish.publish(KUARTZ, { expected: await keysOf(b) })
      await b.publish.idle()
      const status = await b.publish.status()
      assert.equal(status.state, 'published', JSON.stringify(status.run?.error))
      assert.match(status.run?.steps[1].detail ?? '', /publication-1 · pushed/)
      const remote = (ref: string) => execFileSync('git', ['--git-dir', origin, 'rev-parse', ref], { encoding: 'utf8' }).trim()
      assert.equal(remote('refs/heads/dashboard'), change.commit)
      assert.equal(remote('refs/tags/publication-1'), change.commit)
    } finally {
      await rm(origin, { recursive: true, force: true })
    }
  })

  it('redémarrage pendant une publication : failed « Interrupted », puis retry', async () => {
    const b = await setup()
    await writeDraft(b.sanity, HOME, { 'hero.title': 'One' })
    await b.publish.publish(CLIENT, { expected: await keysOf(b) })
    await b.publish.idle()
    // On simule un moteur arrêté au milieu de l'étape 1 : état « running » sans fin, état interne présent.
    await writeDraft(b.sanity, HOME, { 'hero.title': 'Two' })
    const content = (await b.publish.status()).pending.content.map((item) => ({ id: item.id, type: item.type, path: item.path, rev: String(b.sanity.docs[`drafts.${item.id}`]._rev) }))
    await b.store.publications.update((data) => {
      data.run = { id: 'pub_interrupted01', startedAt: new Date().toISOString(), startedBy: 'Marie', step: 1, steps: [1, 2, 3, 4].map((step) => ({ step: step as 1, label: 'x', status: step === 1 ? ('running' as const) : ('waiting' as const) })) }
      data.extra.publish = { run: { number: 2, by: { id: 'u', name: 'Marie', role: 'client' }, content, design: [], textChanges: [], codeChanged: false } }
    })
    await b.publish.recover()
    const status = await b.publish.status()
    assert.deepEqual([status.state, status.run?.error?.message], ['failed', INTERRUPTED_PUBLISH])
    assert.ok(readExtra(b.store.publications.get()).run, 'état interne gardé pour la reprise')
    await b.publish.retry(CLIENT)
    await b.publish.idle()
    assert.equal((await b.publish.status()).state, 'published')
    assert.equal((b.sanity.docs[PAGE_DOC].hero as { title: string }).title, 'Two')
  })
})

describe('POST /publish/discard', () => {
  it('contenu : le brouillon est abandonné, le publié reste ; inconnu → 404', async () => {
    const b = await setup()
    await writeDraft(b.sanity, HOME, { 'hero.title': 'One' })
    const status = await b.publish.discard(CLIENT, { kind: 'content', id: PAGE_DOC })
    assert.equal(status.pending.total, 0)
    assert.equal(b.sanity.docs[`drafts.${PAGE_DOC}`], undefined)
    assert.equal((b.sanity.docs[PAGE_DOC].hero as { title: string }).title, 'Dock scheduling that just works')
    await rejects(b.publish.discard(CLIENT, { kind: 'content', id: PAGE_DOC }), 404, 'not_found')
    await rejects(b.publish.discard(CLIENT, { kind: 'content', id: 'drafts.x' }), 404, 'not_found')
    await rejects(b.publish.discard(CLIENT, { kind: 'other' }), 400, 'bad_request')
  })

  it('texte seul validé par l’éditeur : abandonner son brouillon passe la modification à « discarded »', async () => {
    const b = await setup({ script: [fakeScenarios.setText(TITLE_FIELD, 'Dock scheduling, solved.')] })
    const job = await b.service.request(CLIENT, editRequest({ zone: 'hero.title', scope: ['text'] }))
    await b.until(job.id, ['done'])
    await b.service.idle()
    await b.service.validate(CLIENT, job.changeId)
    await b.publish.discard(CLIENT, { kind: 'content', id: PAGE_DOC })
    assert.equal(b.store.editor.change(job.changeId)?.change.status, 'discarded')
  })

  it('design : dernier commit retiré (reset), commit du milieu retiré (rebase, commits suivants mis à jour)', async () => {
    const b = await setup()
    const first = await b.addValidatedChange({ file: 'src/a.css', content: '.a { color: red; }\n' })
    const second = await b.addValidatedChange({ file: 'src/b.css', content: '.b { color: red; }\n' })
    const third = await b.addValidatedChange({ file: 'src/c.css', content: '.c { color: red; }\n' })
    // Le dernier : reset.
    await b.publish.discard(CLIENT, { kind: 'design', changeId: third.id })
    assert.equal(b.git('rev-parse', 'draft'), second.commit)
    // Le premier : rebase du second par-dessus main.
    const status = await b.publish.discard(CLIENT, { kind: 'design', changeId: first.id })
    const rewritten = b.store.editor.change(second.id)!.change.commit!
    assert.notEqual(rewritten, second.commit)
    assert.equal(b.git('rev-parse', 'draft'), rewritten)
    assert.equal(b.git('rev-parse', 'draft^'), b.git('rev-parse', 'main'))
    assert.deepEqual(b.git('show', '--name-only', '--format=', rewritten), 'src/b.css')
    assert.deepEqual(status.pending.design.map((item) => [item.changeId, item.commit]), [[second.id, rewritten]])
    assert.deepEqual([first.id, third.id].map((id) => b.store.editor.change(id)?.change.status), ['discarded', 'discarded'])
    assert.equal(b.git('rev-parse', '--abbrev-ref', 'HEAD'), 'draft')
  })

  it('design : conflit (un commit suivant s’appuie sur lui) → 409 propre, draft inchangée', async () => {
    const b = await setup()
    const first = await b.addValidatedChange({ file: 'src/a.css', content: '.a { color: red; }\n' })
    const second = await b.addValidatedChange({ file: 'src/a.css', content: '.a { color: blue; }\n' })
    const error = await rejects(b.publish.discard(CLIENT, { kind: 'design', changeId: first.id }), 409, 'conflict')
    assert.match(error.message, /Discard the later changes first/)
    assert.equal(b.git('rev-parse', 'draft'), second.commit)
    assert.equal(await b.repo.isClean(), true)
    assert.equal(b.store.editor.change(first.id)?.change.status, 'validated')
    await rejects(b.publish.discard(CLIENT, { kind: 'design', changeId: 'chg_unknown0001' }), 404, 'not_found')
  })
})

describe('GET /publish/diff/:changeId', () => {
  it('Kuartz seulement ; diff du commit de la modification', async () => {
    const b = await setup()
    const change = await b.addValidatedChange({ file: HERO_CSS, content: '.title { color: red; }\n' })
    const { diff } = await b.publish.diff(KUARTZ, change.id)
    assert.match(diff, /\+\.title \{ color: red; \}/)
    await rejects(b.publish.diff(CLIENT, change.id), 403, 'forbidden')
    await rejects(b.publish.diff(KUARTZ, 'chg_unknown0001'), 404, 'not_found')
    await rejects(b.publish.diff(KUARTZ, '../etc'), 404, 'not_found')
  })
})

describe('état interne', () => {
  it('rien de secret ni de révision dans publications.json ne sort par le statut', async () => {
    const b = await setup({ deployHookUrl: 'https://api.vercel.com/v1/integrations/deploy/hook-secret' })
    await writeDraft(b.sanity, HOME, { 'hero.title': 'One' })
    await b.publish.publish(CLIENT, { expected: await keysOf(b) })
    await b.publish.idle()
    const file = await readFile(path.join(b.workspace, 'data', 'publications.json'), 'utf8')
    assert.ok(!file.includes('hook-secret') && !file.includes('revalidate-secret-test'))
  })
})
