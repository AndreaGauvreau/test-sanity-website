import assert from 'node:assert/strict'
import { appendFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'vitest'
import type { EditJob, Usage } from '../../../src/admin/core/contracts'
import { createFakeSanity } from '../content/fake'
import type { AskUsageRecorder } from '../ask/usage'
import { askRecorderFor, askUsageDoc, createUsageJournal, isAiUsageDoc, PENDING_FILE, requestText, usageDocFromJob } from './journal'

/** Journal aiUsage : Sanity (faux) d'abord, journal local de secours ensuite, rejeu, jamais de doublon ni de perte. */

const USAGE: Usage = {
  model: 'claude-opus-5-5',
  inputTokens: 18_240,
  outputTokens: 1_100,
  cacheReadTokens: 12_000,
  cacheWriteTokens: 3_000,
  costUsd: 0.0712,
  costKind: 'billed',
  access: 'api-key',
  durationMs: 24_000,
  turns: 6,
}

function job(id: string, usage: Usage | null = USAGE, note = 'Bigger'): EditJob {
  return {
    id,
    changeId: 'chg_abcdefgh01',
    kind: 'request',
    request: { page: '/', targets: [{ zone: 'hero.title', index: 0, label: 'Hero · Title' }], scope: ['style'], note, viewport: 1280 },
    requestedBy: { id: 'u-client', name: 'Marie Client', email: 'marie@conduit.test', role: 'client' },
    createdAt: '2026-09-27T10:00:00.000Z',
    finishedAt: '2026-09-27T10:00:24.000Z',
    status: 'done',
    steps: [],
    summary: [],
    checks: [],
    texts: [],
    hardcoded: [],
    attempts: 1,
    ...(usage ? { usage } : {}),
  }
}

let dir: string | null = null
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = null
})

async function dataDir() {
  dir = await mkdtemp(path.join(os.tmpdir(), 'kz-usage-'))
  return dir
}

const quiet = () => {}

describe('usageDocFromJob', () => {
  it('document privé aiUsage.<id> aux champs du contrat ; rien si Claude n’a pas tourné', () => {
    const doc = usageDocFromJob(job('job_abcdefgh01'))!
    assert.deepEqual(doc, {
      _id: 'aiUsage.job_abcdefgh01',
      _type: 'aiUsage',
      feature: 'editor',
      requestId: 'job_abcdefgh01',
      status: 'done',
      page: '/',
      request: 'Bigger',
      user: { id: 'u-client', name: 'Marie Client', role: 'client' },
      createdAt: '2026-09-27T10:00:24.000Z',
      ...USAGE,
    })
    assert.ok(!JSON.stringify(doc).includes('marie@conduit.test'), 'pas d’e-mail dans le journal')
    assert.equal(usageDocFromJob(job('job_abcdefgh02', null)), null)
    assert.ok(isAiUsageDoc(doc))
    assert.ok(!isAiUsageDoc({ ...doc, _id: 'aiUsage.../x' }))
    const ask = askUsageDoc({ requestId: 'ask_abcdefgh01', user: { id: 'u', name: 'Andrea', email: 'a@b.c', role: 'kuartz' }, usage: USAGE, screen: '/admin/media', at: '2026-09-27T11:00:00Z' })
    assert.deepEqual([ask._id, ask.feature, ask.page, ask.status], ['aiUsage.ask_abcdefgh01', 'ask', '/admin/media', 'done'])
  })
})

describe('request (colonne « Request » de B5)', () => {
  it('note de la demande : espaces réunis, 120 caractères au plus ; vide → absent', () => {
    const long = `Make the title   bigger\nand ${'x'.repeat(200)}`
    const doc = usageDocFromJob(job('job_abcdefgh03', USAGE, long))!
    assert.equal(doc.request?.length, 120)
    assert.ok(doc.request?.startsWith('Make the title bigger and x'))
    assert.ok(doc.request?.endsWith('…'))
    assert.ok(isAiUsageDoc(doc))
    assert.ok(!('request' in usageDocFromJob(job('job_abcdefgh04', USAGE, '   '))!))
    assert.equal(requestText('  a  b '), 'a b')
    assert.ok(!isAiUsageDoc({ ...doc, request: 'y'.repeat(121) }), 'une ligne relue trop longue est refusée')
  })
})

describe('askRecorderFor (Ask AI par le journal commun)', () => {
  it('port AskUsageRecorder : document « ask » dans Sanity, secours local si Sanity est en panne', async () => {
    const sanity = createFakeSanity()
    const journal = createUsageJournal({ sanity, dataDir: await dataDir(), log: quiet })
    const recorder: AskUsageRecorder = askRecorderFor(journal)
    const user = { id: 'u', name: 'Andrea', email: 'a@b.c', role: 'kuartz' as const }
    await recorder.recordAsk({ requestId: 'ask_abcdefgh01', user, usage: USAGE, status: 'answered', page: '/admin/media', createdAt: '2026-09-27T11:00:00Z' })
    const doc = sanity.docs['aiUsage.ask_abcdefgh01']
    assert.deepEqual([doc.feature, doc.status, doc.page, doc.createdAt], ['ask', 'answered', '/admin/media', '2026-09-27T11:00:00Z'])
    sanity.failNext('create')
    await recorder.recordAsk({ requestId: 'ask_abcdefgh02', user, usage: USAGE, status: 'refused', createdAt: '2026-09-27T11:01:00Z' })
    assert.equal(await journal.pendingCount(), 1, 'jamais perdu : gardé pour le rejeu')
  })
})

describe('createUsageJournal', () => {
  it('Sanity disponible : écrit une fois (createIfNotExists, pas de doublon au rejeu)', async () => {
    const sanity = createFakeSanity()
    const journal = createUsageJournal({ sanity, dataDir: await dataDir(), log: quiet })
    await journal.recorder.record({ job: job('job_abcdefgh01'), change: null })
    await journal.recorder.record({ job: job('job_abcdefgh01'), change: null })
    await journal.recorder.record({ job: job('job_abcdefgh02', null), change: null })
    assert.deepEqual(Object.keys(sanity.docs), ['aiUsage.job_abcdefgh01'])
    assert.equal(sanity.docs['aiUsage.job_abcdefgh01'].costUsd, 0.0712)
    assert.equal(await journal.pendingCount(), 0)
  })

  it('Sanity en panne → journal local de secours (0600) → rejeu dès que Sanity répond', async () => {
    const sanity = createFakeSanity()
    const data = await dataDir()
    const lines: string[] = []
    const journal = createUsageJournal({ sanity, dataDir: data, log: (line) => lines.push(line) })
    sanity.failNext('create')
    sanity.failNext('create')
    assert.equal(await journal.record(usageDocFromJob(job('job_abcdefgh01'))!), 'pending')
    assert.equal(await journal.record(usageDocFromJob(job('job_abcdefgh02'))!), 'pending')
    assert.equal(await journal.pendingCount(), 2)
    const file = path.join(data, PENDING_FILE)
    assert.equal((await stat(file)).mode & 0o777, 0o600)
    assert.deepEqual(Object.keys(sanity.docs), [])
    // Rejeu : Sanity refuse encore une fois → arrêt, rien perdu.
    sanity.failNext('create')
    assert.deepEqual(await journal.flush(), { sent: 0, left: 2 })
    // La demande suivante passe : les deux en attente partent aussi (rejeu après une écriture réussie).
    assert.equal(await journal.record(usageDocFromJob(job('job_abcdefgh03'))!), 'sanity')
    assert.equal(await journal.pendingCount(), 0)
    assert.deepEqual(Object.keys(sanity.docs).sort(), ['aiUsage.job_abcdefgh01', 'aiUsage.job_abcdefgh02', 'aiUsage.job_abcdefgh03'])
    await assert.rejects(stat(file))
    assert.ok(lines.some((line) => /kept in data\/usage-pending.jsonl/.test(line)))
  })

  it('sans jeton : tout attend dans le journal local ; un moteur avec jeton le rejoue ; ligne illisible gardée', async () => {
    const data = await dataDir()
    const offline = createUsageJournal({ sanity: null, dataDir: data, log: quiet })
    assert.equal(await offline.record(usageDocFromJob(job('job_abcdefgh01'))!), 'pending')
    assert.deepEqual(await offline.flush(), { sent: 0, left: 1 })
    await appendFile(path.join(data, PENDING_FILE), 'not json\n')
    const sanity = createFakeSanity()
    const online = createUsageJournal({ sanity, dataDir: data, log: quiet })
    assert.deepEqual(await online.flush(), { sent: 1, left: 1 })
    assert.equal(await readFile(path.join(data, PENDING_FILE), 'utf8'), 'not json\n')
    assert.ok(sanity.docs['aiUsage.job_abcdefgh01'])
  })

  it('perte impossible en silence : si le fichier aussi échoue, l’erreur remonte', async () => {
    const data = await dataDir()
    const journal = createUsageJournal({ sanity: null, dataDir: path.join(data, 'missing-folder'), log: quiet })
    await assert.rejects(journal.record(usageDocFromJob(job('job_abcdefgh01'))!))
    await assert.rejects(journal.record({ _id: 'bad' } as never), /Invalid aiUsage document/)
    assert.throws(() => createUsageJournal({ sanity: null, dataDir: 'relative', log: quiet }))
  })
})
