import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { AskResponse, EngineUser } from '../../../src/admin/core/contracts'
import { engineIdentityHeaders, signEngineUser } from '../../../src/admin/core/engine/signature'
import { CompleteError } from '../claude'
import { EngineError } from '../server/errors'
import { createUsageModule, getUsageJournal, PENDING_FILE } from '../usage'
import { createEngineServer, createRouter } from '../server/http'
import { REFUSAL_TEXT } from './answer'
import { ASK_MAX_TOKENS_PLAIN, ASK_MAX_TOKENS_THINKING, ASK_SYSTEM, askMaxTokens } from './prompt'
import { askModule, registerAskRoutes } from './routes'
import type { EngineContext } from '../server/modules'
import { ASK_MESSAGES, createAskService } from './service'
import { CLIENT, CONFIG, EDITOR, fakeComplete, fakeReader, KUARTZ } from './testing'
import { askUsageDoc, sanityAskUsageRecorder, type AskUsageEntry } from './usage'

const MODEL = 'claude-haiku-4-5-20251001'
const ANSWER = 'ANSWER: On Home › Hero (background) and on the post “How to cut dock wait times” (cover).\nLINKS: /admin/media /admin/pages/home\nCHANGE: no'

function makeService(reply: Parameters<typeof fakeComplete>[0] = ANSWER, extra: Partial<Parameters<typeof createAskService>[0]> = {}) {
  const complete = fakeComplete(reply)
  const recorded: AskUsageEntry[] = []
  const service = createAskService({
    config: CONFIG,
    complete,
    model: MODEL,
    reader: fakeReader(),
    usage: { recordAsk: async (entry) => void recorded.push(entry) },
    now: () => new Date('2026-09-27T10:00:00Z'),
    ...extra,
  })
  return { service, complete, recorded }
}

const reason = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error as EngineError
  }
  throw new Error('expected a rejection')
}

describe('service Ask AI', () => {
  it('question → réponse, liens du catalogue, consommation ; appel borné et prompt fixe', async () => {
    const { service, complete, recorded } = makeService()
    const res = await service.ask(CLIENT, { question: 'Where is the hero image used?', history: [], screen: '/admin/media' })
    expect(res.answer).toBe('On Home › Hero (background) and on the post “How to cut dock wait times” (cover).')
    expect(res.links).toEqual([
      { label: 'Open Media', href: '/admin/media' },
      { label: 'Open Home', href: '/admin/pages/home' },
    ])
    expect(res.refusedChange).toBe(false)
    expect(res.usage.inputTokens).toBe(2100)

    const call = complete.calls[0]
    expect(call.model).toBe(MODEL)
    // Haiku 4.5 (alias daté) : plafond sans réflexion, aucun effort transmis (aucun n'était réglé).
    expect(call.maxTokens).toBe(ASK_MAX_TOKENS_PLAIN)
    expect('effort' in call).toBe(false)
    expect(call.system).toBe(ASK_SYSTEM)
    // Données dans le message utilisateur, entre balises ; question à la fin.
    const last = call.messages.at(-1)!
    expect(last.role).toBe('user')
    expect(last.content).toMatch(/^<site_data>\n[\s\S]*\n<\/site_data>\n\nQuestion from the user:\nWhere is the hero image used\?$/)
    expect(last.content).toContain('USER IS ON SCREEN: Assets › Media (/admin/media)')

    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({ user: CLIENT, status: 'answered', page: '/admin/media', createdAt: '2026-09-27T10:00:00.000Z' })
    expect(recorded[0].requestId).toMatch(/^ask_[0-9a-f]{16}$/)
  })

  it('plafond de sortie PAR MODÈLE (la réflexion compte) : 16 000 pour un modèle qui réfléchit, 1 024 pour Haiku ; effort transmis', async () => {
    expect([ASK_MAX_TOKENS_THINKING, ASK_MAX_TOKENS_PLAIN]).toEqual([16_000, 1_024])
    expect(['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-opus-5'].map(askMaxTokens)).toEqual([
      16_000, 16_000, 16_000, 1_024, 1_024, 16_000,
    ])
    // Le plafond ne remplace jamais la brièveté du prompt.
    expect(ASK_SYSTEM).toMatch(/in 1 to 3 short sentences/)
    const { service, complete } = makeService(ANSWER, { model: 'claude-fable-5-1', effort: 'xhigh' })
    await service.ask(CLIENT, { question: 'Which pages have no meta description?', history: [] })
    expect(complete.calls[0]).toMatchObject({ model: 'claude-fable-5-1', effort: 'xhigh', maxTokens: 16_000 })
  })

  it('refus de Claude (refusal) ou plafond atteint (max_tokens) : message clair, aucun lien, consommation journalisée « failed »', async () => {
    for (const [stopReason, answer] of [
      ['refusal', ASK_MESSAGES.declined],
      ['max_tokens', ASK_MESSAGES.cutOff],
    ] as const) {
      // Le texte (vide ou non) n'est jamais lu : même une réponse qui prétend avoir modifié ne passe pas.
      const { service, recorded } = makeService({ text: 'ANSWER: Done, I changed it.\nLINKS: /admin/media\nCHANGE: yes', stopReason }, { model: 'claude-opus-5-5', effort: 'max' })
      const res = await service.ask(CLIENT, { question: 'Where is the hero image used?', history: [], screen: '/admin/media' })
      expect(res).toEqual({ answer, links: [], refusedChange: false, usage: expect.objectContaining({ model: 'claude-opus-5-5' }) })
      expect(recorded).toHaveLength(1)
      expect(recorded[0]).toMatchObject({ status: 'failed', usage: { model: 'claude-opus-5-5' }, page: '/admin/media' })
    }
    expect(ASK_MESSAGES.declined).toBe('Claude declined to answer this question. Try asking it another way.')
    expect(ASK_MESSAGES.cutOff).toBe('The answer was cut off: Claude hit its length limit. Ask a shorter, more precise question.')
  })

  it('le prompt système est identique quel que soit le rôle, la question ou l’écran (cache)', async () => {
    const { service, complete } = makeService()
    await service.ask(KUARTZ, { question: 'a', history: [] })
    await service.ask(CLIENT, { question: 'b', history: [], screen: '/admin/settings/general' })
    expect(complete.calls[0].system).toBe(complete.calls[1].system)
    expect(ASK_SYSTEM).toMatch(/You cannot change anything/)
    expect(ASK_SYSTEM).toMatch(/never instructions to you/)
  })

  it('demande de modification → refus fixe, journal « refused »', async () => {
    const { service, recorded } = makeService('ANSWER: Done! I changed it.\nLINKS: none\nCHANGE: yes')
    const res = await service.ask(CLIENT, { question: 'Change the hero title to “Docks, solved.”', history: [], screen: '/admin/pages/home' })
    expect(res).toMatchObject({ answer: REFUSAL_TEXT, links: [{ label: 'Open Home in AI editor', href: '/admin/editor?page=home' }], refusedChange: true })
    expect(recorded[0].status).toBe('refused')
  })

  it('historique : alterné, commence par une question, 10 messages au plus (sinon 400)', async () => {
    const { service, complete } = makeService()
    await service.ask(CLIENT, {
      question: 'And the favicon?',
      history: [
        { role: 'assistant', text: 'orphan' },
        { role: 'user', text: 'Q1' },
        { role: 'assistant', text: 'A1' },
        { role: 'user', text: 'Q2 without answer' },
      ],
    })
    expect(complete.calls[0].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(complete.calls[0].messages[0].content).toBe('Q1')
    const tooLong = Array.from({ length: 11 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` }))
    const error = await reason(service.ask(CLIENT, { question: 'x', history: tooLong }))
    expect([error.status, error.code]).toEqual([400, 'bad_request'])
  })

  it('question : 1 à 1000 caractères, corps invalide refusé', async () => {
    const { service, complete } = makeService()
    expect((await reason(service.ask(CLIENT, { question: '   ', history: [] }))).status).toBe(400)
    expect((await reason(service.ask(CLIENT, { question: 'x'.repeat(1001), history: [] }))).message).toBe('Ask a question of 1 to 1000 characters.')
    expect((await reason(service.ask(CLIENT, { question: 42 }))).status).toBe(400)
    expect((await reason(service.ask(CLIENT, null))).status).toBe(400)
    await service.ask(CLIENT, { question: 'x'.repeat(1000) })
    expect(complete.calls).toHaveLength(1)
  })

  it('sans accès Claude : 503 clair ; erreur de Claude : 503 avec son message, rien au journal', async () => {
    const none = makeService(ANSWER, { complete: null })
    const noAccess = await reason(none.service.ask(CLIENT, { question: 'x', history: [] }))
    expect([noAccess.status, noAccess.code, noAccess.message]).toEqual([503, 'unavailable', ASK_MESSAGES.noAccess])

    const failing = makeService(new CompleteError('Claude is busy (rate limit): try again in a moment.'))
    const busy = await reason(failing.service.ask(CLIENT, { question: 'x', history: [] }))
    expect([busy.status, busy.message]).toEqual([503, 'Claude is busy (rate limit): try again in a moment.'])
    expect(failing.recorded).toHaveLength(0)

    const crash = makeService(new Error('socket hang up sk-ant-secret'))
    const internal = await reason(crash.service.ask(CLIENT, { question: 'x', history: [] }))
    expect(internal.message).toBe(ASK_MESSAGES.failed)
  })

  it('une question à la fois par utilisateur ; limite de débit', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const complete = Object.assign(async () => {
      await gate
      return { text: ANSWER, usage: (await import('./testing')).usage(), stopReason: 'end_turn' }
    }, {})
    const { service } = makeService(ANSWER, { complete, rateLimit: { max: 2, windowMs: 60_000 } })
    const first = service.ask(CLIENT, { question: 'a', history: [] })
    const second = await reason(service.ask(CLIENT, { question: 'b', history: [] }))
    expect([second.status, second.code, second.message]).toEqual([409, 'busy', ASK_MESSAGES.inFlight])
    // Un autre utilisateur n'attend pas.
    const other = service.ask(EDITOR, { question: 'c', history: [] })
    release()
    await Promise.all([first, other])
    await service.ask(CLIENT, { question: 'd', history: [] })
    const limited = await reason(service.ask(CLIENT, { question: 'e', history: [] }))
    expect(limited.message).toBe(ASK_MESSAGES.rateLimited)
  })

  it('journal en échec : la réponse part quand même', async () => {
    const lines: string[] = []
    const { service } = makeService(ANSWER, { usage: { recordAsk: async () => Promise.reject(new Error('sanity down')) }, log: (l) => lines.push(l) })
    const res = await service.ask(CLIENT, { question: 'x', history: [] })
    expect(res.answer).toContain('On Home')
    expect(lines.join()).toContain('usage not recorded')
  })

  it('données du site réutilisées 30 s par rôle', async () => {
    const reader = fakeReader()
    let t = Date.parse('2026-09-27T10:00:00Z')
    const { service } = makeService(ANSWER, { reader, now: () => new Date(t) })
    await service.ask(CLIENT, { question: 'a', history: [] })
    await service.ask(CLIENT, { question: 'b', history: [] })
    expect(reader.calls).toHaveLength(1)
    t += 31_000
    await service.ask(CLIENT, { question: 'c', history: [] })
    expect(reader.calls).toHaveLength(2)
  })
})

describe('journal aiUsage (feature ask)', () => {
  it('document privé au format du contrat', async () => {
    const written: Record<string, unknown>[] = []
    const recorder = sanityAskUsageRecorder({ createIfNotExists: async (doc) => void written.push(doc) })
    const entry: AskUsageEntry = {
      requestId: 'ask_0123456789abcdef',
      user: CLIENT,
      usage: (await import('./testing')).usage(),
      status: 'answered',
      page: '/admin/media',
      createdAt: '2026-09-27T10:00:00.000Z',
    }
    await recorder.recordAsk(entry)
    expect(written[0]).toEqual(askUsageDoc(entry))
    expect(written[0]).toMatchObject({
      _id: 'aiUsage.ask_0123456789abcdef',
      _type: 'aiUsage',
      feature: 'ask',
      user: { id: 'u-cl', name: 'Marie', role: 'client' },
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 2100,
    })
    // Jamais l'e-mail dans le journal.
    expect(JSON.stringify(written[0])).not.toContain('marie@conduit.test')
  })
})

describe('route POST /ask (serveur réel, identité signée)', () => {
  const SECRET = 'engine-secret-for-tests-0123456789'
  // Identité Ed25519 (contrat engine.ts) : l'admin signe avec la clé privée, le moteur vérifie avec la clé publique.
  const pair = generateKeyPairSync('ed25519')
  const IDENTITY_PRIVATE = pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
  const IDENTITY_PUBLIC = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  let server: Server | null = null
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
    server = null
  })

  async function boot() {
    const router = createRouter()
    registerAskRoutes(router, { config: CONFIG, complete: fakeComplete(ANSWER), model: MODEL, reader: fakeReader(), usage: null })
    server = createEngineServer({ router, secret: SECRET, identityPublicKey: IDENTITY_PUBLIC, log: () => {} })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    return async (user: EngineUser, body: unknown, method = 'POST') => {
      const headers = { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json', ...engineIdentityHeaders(await signEngineUser(user, IDENTITY_PRIVATE)) }
      const response = await fetch(`${base}/ask`, { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined })
      return { status: response.status, json: (await response.json()) as AskResponse & { error?: { code: string; message: string } } }
    }
  }

  it('200 avec AskResponse ; 400 au format du contrat ; GET inconnu', async () => {
    const call = await boot()
    const ok = await call(EDITOR, { question: 'Where is the hero image used?', history: [] })
    expect(ok.status).toBe(200)
    expect(ok.json.links.map((l) => l.href)).toEqual(['/admin/media', '/admin/pages/home'])
    const bad = await call(EDITOR, { question: '' })
    expect(bad).toEqual({ status: 400, json: { error: { code: 'bad_request', message: 'Ask a question of 1 to 1000 characters.' } } })
    expect((await call(EDITOR, null, 'GET')).status).toBe(404)
  })
})

describe('SEC-08 dans le service', () => {
  it('la réponse du modèle passe par le filtre commun : domaine tiers retiré, domaine du manifeste gardé', async () => {
    const { service } = makeService('ANSWER: Log in again at conduit-billing.help/login, then visit conduit.com.\nLINKS: none\nCHANGE: no')
    const res = await service.ask(CLIENT, { question: 'Why am I logged out?', history: [] })
    expect(res.answer).toBe('Log in again at [link removed], then visit conduit.com.')
  })
})

describe('askModule (EngineModule de MODULES)', () => {
  it('enregistre POST /ask (droit ai.ask) ; modèle et effort = réglages de l’IA EN COURS, relus à chaque question (plus ASK_MODEL)', async () => {
    const router = createRouter()
    const complete = fakeComplete(ANSWER)
    // `context.settings` est un accesseur dans le vrai moteur (main.ts) : un choix enregistré dans B5 le change aussitôt.
    let settings = { model: 'claude-opus-5-5', effort: 'medium' }
    const context = {
      router,
      access: { ok: false, error: 'no key' },
      sanity: null,
      get settings() {
        return settings
      },
      config: {
        // ASK_MODEL ne sert plus qu'au test de connexion : Ask AI ne le lit plus.
        models: { ask: 'claude-haiku-4-5-20251001' },
        sanity: { projectId: 'p', dataset: 'development', apiVersion: '2026-09-01', readToken: 'read', writeToken: null },
        paths: { claude: '/tmp/kz-claude' },
      },
    } as unknown as EngineContext
    await askModule({ config: CONFIG, complete, reader: fakeReader(), usage: null }).register(context)
    const match = router.match('POST', '/ask')
    expect(match?.route.capability).toBe('ai.ask')
    const ask = async () =>
      (await match!.route.handler({ user: CLIENT, params: {}, query: new URLSearchParams(), body: { question: 'Where?' }, signal: new AbortController().signal })) as { json: AskResponse }
    const res = await ask()
    expect(res.json.links[0]).toEqual({ label: 'Open Media', href: '/admin/media' })
    expect(res.json.usage.model).toBe('claude-opus-5-5')
    // Rechargement à chaud : Haiku 4.5 choisi dans l'admin, puis Sonnet 5 / low.
    settings = { model: 'claude-haiku-4-5', effort: 'high' }
    expect((await ask()).json.usage.model).toBe('claude-haiku-4-5')
    settings = { model: 'claude-sonnet-5', effort: 'low' }
    await ask()
    expect(complete.calls.map((call) => [call.model, call.effort, call.maxTokens])).toEqual([
      ['claude-opus-5-5', 'medium', 16_000],
      // Effort transmis tel quel : c'est `complete` qui ne l'envoie jamais à Haiku (complete.test.ts, main.test.ts).
      ['claude-haiku-4-5', 'high', 1_024],
      ['claude-sonnet-5', 'low', 16_000],
    ])
  })

  it('sans accès Claude (resolveClaudeAccess en échec) : 503 clair', async () => {
    const router = createRouter()
    const context = {
      router,
      access: { ok: false, error: 'no key' },
      sanity: null,
      settings: { model: 'claude-opus-5-5', effort: 'medium' },
      config: { models: { ask: 'm' }, sanity: { projectId: 'p', dataset: 'd', apiVersion: '2026-09-01', readToken: 'r' }, paths: { claude: '/tmp/x' } },
    } as unknown as EngineContext
    await askModule({ config: CONFIG, reader: null, usage: null }).register(context)
    const error = await reason(Promise.resolve(router.match('POST', '/ask')!.route.handler({ user: CLIENT, params: {}, query: new URLSearchParams(), body: { question: 'x' }, signal: new AbortController().signal })))
    expect([error.status, error.message]).toEqual([503, ASK_MESSAGES.noAccess])
  })

  it('FOLLOWUPS #34 : sans `usage` explicite, la consommation passe par le journal commun (usageModule enregistré avant)', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'kz-ask-usage-'))
    try {
      const router = createRouter()
      const context = {
        router,
        access: { ok: false, error: 'no key' },
        // Sans jeton d'écriture : le journal commun garde le document dans son fichier local (jamais perdu).
        sanity: null,
        ports: {},
        settings: { model: 'claude-sonnet-5', effort: 'low' },
        config: {
          models: { ask: MODEL },
          sanity: { projectId: 'p', dataset: 'development', apiVersion: '2026-09-01', readToken: 'read', writeToken: null },
          paths: { claude: path.join(dataDir, 'claude'), data: dataDir },
        },
      } as unknown as EngineContext
      await createUsageModule({ log: () => {} }).register(context)
      await askModule({ config: CONFIG, complete: fakeComplete(ANSWER), reader: fakeReader() }).register(context)
      await router.match('POST', '/ask')!.route.handler({ user: CLIENT, params: {}, query: new URLSearchParams(), body: { question: 'Where?' }, signal: new AbortController().signal })
      const journal = getUsageJournal(context)!
      expect(await journal.pendingCount()).toBe(1)
      const doc = JSON.parse((await readFile(path.join(dataDir, PENDING_FILE), 'utf8')).trim())
      // Le journal porte le modèle réellement utilisé (réglages de l'IA en cours), pas ASK_MODEL.
      expect(doc).toMatchObject({ _type: 'aiUsage', feature: 'ask', status: 'answered', model: 'claude-sonnet-5', user: { id: CLIENT.id, role: 'client' } })
      expect(doc._id).toMatch(/^aiUsage\.ask_[0-9a-f]{16}$/)
      expect(JSON.stringify(doc)).not.toContain(CLIENT.email)
    } finally {
      await rm(dataDir, { recursive: true, force: true })
    }
  })
})
