import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EngineUser, PendingChange } from '../../../src/admin/core/contracts'
import type { FakeSanity } from '../content/fake'
import type { SanityDoc } from '../content/sanity'
import { gitAuthor } from '../git/git'
import { makeBench, type Bench } from '../jobs/testing'
import type { FakeScript } from '../claude'
import { catalogFromConfig, loadAdminConfig, type Catalog } from './catalog'
import { createPublishService, type PublishDeps, type PublishService } from './service'

/**
 * Banc d'essai de la publication (tests seulement) : le banc de l'éditeur (`makeBench` : vrai dépôt git temporaire
 * main/draft, faux Claude, faux Sanity, verrou partagé) + le service de publication, un faux `fetch` (hook Vercel,
 * revalidation) et un faux typecheck. Jamais de réseau, jamais le vrai dépôt.
 */

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

/** Le vrai manifeste de Conduit (src/admin.config.ts) : chemins lisibles réalistes. */
export async function conduitCatalog(): Promise<Catalog> {
  const config = await loadAdminConfig(path.join(ROOT, 'src/admin.config.ts'))
  if (!config) throw new Error('src/admin.config.ts is missing')
  return catalogFromConfig(config)
}

/** Fait répondre le faux Sanity à la requête de `listDrafts` (brouillons `drafts.*`). */
export function answerDraftQueries(sanity: FakeSanity): void {
  sanity.onFetch((query) => {
    if (!query.includes('path("drafts.**")')) throw new Error(`Unexpected GROQ query in test: ${query}`)
    return Object.values(sanity.docs)
      .filter((doc) => doc._id.startsWith('drafts.'))
      .map((doc) => ({ _id: doc._id, _type: doc._type, _rev: doc._rev, _updatedAt: doc._updatedAt ?? '2026-09-27T10:00:00Z' }))
      .sort((a, b) => String(b._updatedAt).localeCompare(String(a._updatedAt)))
  })
}

/** Écrit un brouillon (copie du publié s'il existe, puis `set`), comme le ferait l'admin. */
export async function writeDraft(sanity: FakeSanity, doc: SanityDoc, set: Record<string, unknown> = {}): Promise<void> {
  const published = sanity.docs[doc._id]
  const base: SanityDoc = { ...(published ?? doc), _id: `drafts.${doc._id}`, _type: doc._type }
  delete base._rev
  await sanity.createIfNotExists(base)
  if (Object.keys(set).length) await sanity.patch(`drafts.${doc._id}`, { set })
}

export type FetchCall = { url: string; method: string; headers: Record<string, string>; body: string }

/** Faux fetch : enregistre les appels ; `respond` décide du statut (200 par défaut). */
export function fakeFetch(respond: (call: FetchCall) => { status: number; body?: string } = () => ({ status: 200, body: '{}' })) {
  const calls: FetchCall[] = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => void (headers[key] = value))
    const call: FetchCall = { url: String(input), method: init?.method ?? 'GET', headers, body: typeof init?.body === 'string' ? init.body : '' }
    calls.push(call)
    const answer = respond(call)
    return new Response(answer.body ?? '{}', { status: answer.status })
  }) as typeof fetch
  return { impl, calls }
}

export type PublishBench = Bench & {
  publish: PublishService
  fetch: ReturnType<typeof fakeFetch>
  typechecks: number
  /** Ajoute une modification IA validée : un commit sur draft (fichier écrit) + la PendingChange « validated ». */
  addValidatedChange(input: { file: string; content: string; title?: string; by?: EngineUser }): Promise<PendingChange>
}

export type PublishBenchOptions = {
  script?: FakeScript
  catalog?: Catalog
  typecheck?: PublishDeps['typecheck']
  respond?: Parameters<typeof fakeFetch>[0]
  deployHookUrl?: string | null
  revalidate?: { url: string | null; secret: string | null }
  push?: boolean
  sourceBranch?: string | null
  noSanity?: boolean
  now?: () => Date
}

let counter = 0

export async function makePublishBench(options: PublishBenchOptions = {}): Promise<PublishBench> {
  const bench = await makeBench(options.script ?? [])
  answerDraftQueries(bench.sanity)
  const fetch = fakeFetch(options.respond)
  const state = { typechecks: 0 }
  const publish = createPublishService({
    repo: bench.repo,
    store: bench.store,
    lock: bench.lock,
    validatedDesign: () => bench.service.validatedDesign(),
    sanity: options.noSanity ? null : bench.sanity,
    catalog: options.catalog ?? (await conduitCatalog()),
    mode: 'local',
    git: { push: options.push ?? false, sourceBranch: async () => options.sourceBranch ?? 'dashboard' },
    deployHookUrl: options.deployHookUrl === undefined ? null : options.deployHookUrl,
    revalidate: options.revalidate ?? { url: 'http://127.0.0.1:4040/api/revalidate', secret: 'revalidate-secret-test' },
    typecheck: async (dir) => {
      state.typechecks++
      return options.typecheck ? options.typecheck(dir) : null
    },
    fetch: fetch.impl,
    ...(options.now ? { now: options.now } : {}),
    log: () => {},
  })
  async function addValidatedChange(input: { file: string; content: string; title?: string; by?: EngineUser }): Promise<PendingChange> {
    const by = input.by ?? { id: 'u-client', name: 'Marie Client', email: 'marie@conduit.test', role: 'client' }
    const base = await bench.repo.head()
    await writeFile(path.join(bench.repoDir, input.file), input.content)
    const commit = await bench.repo.commitAll(`[ai-editor] ${input.title ?? input.file}`, gitAuthor(by))
    counter++
    const id = `chg_test${String(counter).padStart(6, '0')}${Date.now().toString(36)}`
    const at = new Date(Date.now() + counter).toISOString()
    const change: PendingChange = {
      id,
      page: '/',
      targets: [{ zone: 'hero.title', index: 0, label: input.title ?? 'Hero · Title' }],
      status: 'validated',
      jobIds: [],
      adjustments: 0,
      summary: [{ target: 'Title', description: 'size → Heading XL', kind: 'style', where: 'code' }],
      checks: [],
      commit,
      createdAt: at,
      createdBy: by,
      validatedAt: at,
      validatedBy: by,
    }
    await bench.store.editor.putChange({ change, internal: { baseCommit: base, commits: [commit] } })
    return change
  }
  const out = Object.assign(bench, { publish, fetch, addValidatedChange }) as PublishBench
  Object.defineProperty(out, 'typechecks', { get: () => state.typechecks })
  return out
}
