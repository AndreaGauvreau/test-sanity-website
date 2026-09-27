import path from 'node:path'
import type { EditJob, PendingChange, Publication, PublishRun, ThreadEntry } from '../../../src/admin/core/contracts'
import type { AskedQuestions, ResolvedAnswer } from '../claude'
import { openJsonFile, type JsonFile } from './json-file'

/**
 * Magasin persistant du moteur (`<ENGINE_WORKSPACE>/data/`, fichiers JSON écrits atomiquement) :
 * - `editor.json` : demandes (EditJob + état interne), modifications en attente (PendingChange + commits), fils par page ;
 * - `publications.json` : publications et publication en cours (engine-publish).
 *
 * L'état interne (textsBefore, commits, session) n'est jamais renvoyé à l'admin : seuls `job` et `change` (types du
 * contrat) sortent. Tout ce qu'il faut pour remettre en état après un crash est écrit AVANT d'agir (piège 7 du POC).
 */

// ─── Types stockés ───────────────────────────────────────────────────────────

/** Un document Sanity tel qu'il était avant une demande : de quoi restaurer ses champs EXACTEMENT. */
export type DocumentSnapshot = {
  /** Id publié (sans « drafts. »). */
  id: string
  type: string
  /** Le brouillon `drafts.<id>` existait-il avant la demande ? Sinon, la restauration le supprime (s'il ne porte rien d'autre). */
  draftExisted: boolean
  /** Chemin Sanity → valeur avant la demande (null = champ absent). */
  fields: Record<string, string | null>
}

/** textsBefore : documents touchés par une demande, par id publié. */
export type TextSnapshot = Record<string, DocumentSnapshot>

export type WrittenText = { document: string; path: string; value: string }

export type JobInternal = {
  /** Tête de draft avant la demande. */
  headBefore: string | null
  /** Commit de la demande sur draft (si des fichiers ont changé). */
  commit?: string
  sessionId?: string | null
  /** textsBefore, enregistré AVANT la première écriture Sanity. */
  texts?: TextSnapshot
  /** Une écriture Sanity a pu avoir lieu : à restaurer en cas d'échec, d'arrêt ou de redémarrage. */
  textsDirty?: boolean
  /** Dernière valeur écrite par champ (`<document>:<chemin>`). */
  written?: Record<string, WrittenText>
  /** Questions en attente (ids du lot). */
  asked?: AskedQuestions
  /** Réponses résolues du client (options choisies), pour les contrôles (longer-text) et les valeurs en dur. */
  resolved?: ResolvedAnswer[]
  /** La restauration des textes a échoué : à retenter au prochain démarrage. */
  restoreFailed?: boolean
}

export type StoredJob = { job: EditJob; internal: JobInternal }

export type ChangeInternal = {
  /** Tête de draft avant la première demande de la modification. */
  baseCommit: string
  /** Commits des demandes réussies, dans l'ordre. */
  commits: string[]
}

export type StoredChange = { change: PendingChange; internal: ChangeInternal }

export type StoredThreadEntry =
  | { type: 'job'; jobId: string }
  | { type: 'validated'; changeId: string; at: string; pendingTotal: number }
  | { type: 'cancelled'; changeId: string; at: string }

export type EditorData = {
  version: 1
  jobs: Record<string, StoredJob>
  changes: Record<string, StoredChange>
  /** Fil de chaque page (chemin public), du plus ancien au plus récent. */
  threads: Record<string, StoredThreadEntry[]>
}

export type PublicationsData = {
  version: 1
  publications: Publication[]
  /** Publication en cours ou dernière publication (reprise `retry`). */
  run: PublishRun | null
  lastPublishedAt: string | null
  /** Place libre pour engine-publish (état qui n'a pas de type dans le contrat). */
  extra: Record<string, unknown>
}

/** Entrées gardées par page : l'admin en montre 50. */
export const THREAD_KEEP = 200
export const THREAD_SHOWN = 50

const ACTIVE = new Set<string>(['queued', 'running', 'waiting'])
const OPEN_CHANGE = new Set<string>(['working', 'to-validate'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function migrateEditor(raw: unknown): EditorData {
  if (!isRecord(raw) || raw.version !== 1) throw new Error('unknown format (expected version 1)')
  return {
    version: 1,
    jobs: isRecord(raw.jobs) ? (raw.jobs as EditorData['jobs']) : {},
    changes: isRecord(raw.changes) ? (raw.changes as EditorData['changes']) : {},
    threads: isRecord(raw.threads) ? (raw.threads as EditorData['threads']) : {},
  }
}

function migratePublications(raw: unknown): PublicationsData {
  if (!isRecord(raw) || raw.version !== 1) throw new Error('unknown format (expected version 1)')
  return {
    version: 1,
    publications: Array.isArray(raw.publications) ? (raw.publications as Publication[]) : [],
    run: isRecord(raw.run) ? (raw.run as PublishRun) : null,
    lastPublishedAt: typeof raw.lastPublishedAt === 'string' ? raw.lastPublishedAt : null,
    extra: isRecord(raw.extra) ? raw.extra : {},
  }
}

// ─── Magasin de l'éditeur ────────────────────────────────────────────────────

export type EditorStore = {
  data(): EditorData
  job(id: string): StoredJob | null
  change(id: string): StoredChange | null
  /** Demandes en file, en cours ou en attente de réponse. */
  activeJobs(): StoredJob[]
  /** La modification en attente (working ou to-validate), toutes pages confondues. */
  openChange(): StoredChange | null
  /** Modifications validées, pas encore publiées ni abandonnées (engine-publish). */
  validatedChanges(): StoredChange[]
  /** Fil d'une page (50 dernières entrées), demandes résolues. */
  thread(page: string, limit?: number): ThreadEntry[]
  putJob(stored: StoredJob): Promise<void>
  updateJob(id: string, change: (stored: StoredJob) => void): Promise<StoredJob>
  putChange(stored: StoredChange): Promise<void>
  updateChange(id: string, change: (stored: StoredChange) => void): Promise<StoredChange>
  appendThread(page: string, entry: StoredThreadEntry): Promise<void>
  /** Plusieurs changements en une seule écriture. */
  transact(change: (data: EditorData) => void): Promise<void>
  flush(): Promise<void>
}

export type PublicationsStore = {
  get(): PublicationsData
  update(change: (data: PublicationsData) => void): Promise<PublicationsData>
  /** Numéro de la prochaine publication (1, 2, …). */
  nextNumber(): number
  flush(): Promise<void>
}

export type EngineStore = { editor: EditorStore; publications: PublicationsStore; dir: string }

const missing = (kind: string, id: string) => new Error(`Unknown ${kind}: ${id}`)

function prune(data: EditorData) {
  const referenced = new Set<string>()
  for (const [page, entries] of Object.entries(data.threads)) {
    if (entries.length > THREAD_KEEP) data.threads[page] = entries.slice(-THREAD_KEEP)
    for (const entry of data.threads[page]) if (entry.type === 'job') referenced.add(entry.jobId)
  }
  for (const stored of Object.values(data.changes)) {
    if (OPEN_CHANGE.has(stored.change.status) || stored.change.status === 'validated') {
      for (const id of stored.change.jobIds) referenced.add(id)
    }
  }
  for (const [id, stored] of Object.entries(data.jobs)) {
    if (!referenced.has(id) && !ACTIVE.has(stored.job.status) && !stored.internal.restoreFailed) delete data.jobs[id]
  }
}

function editorStore(file: JsonFile<EditorData>): EditorStore {
  const data = () => file.get()
  const write = (change: (draft: EditorData) => void) => file.update((draft) => void change(draft)).then(() => {})
  return {
    data,
    job: (id) => (Object.hasOwn(data().jobs, id) ? data().jobs[id] : null),
    change: (id) => (Object.hasOwn(data().changes, id) ? data().changes[id] : null),
    activeJobs: () =>
      Object.values(data().jobs)
        .filter((stored) => ACTIVE.has(stored.job.status))
        .sort((a, b) => a.job.createdAt.localeCompare(b.job.createdAt)),
    openChange: () => Object.values(data().changes).find((stored) => OPEN_CHANGE.has(stored.change.status)) ?? null,
    validatedChanges: () =>
      Object.values(data().changes)
        .filter((stored) => stored.change.status === 'validated')
        .sort((a, b) => (a.change.validatedAt ?? '').localeCompare(b.change.validatedAt ?? '')),
    thread(page, limit = THREAD_SHOWN) {
      const entries = Object.hasOwn(data().threads, page) ? data().threads[page] : []
      const out: ThreadEntry[] = []
      for (const entry of entries) {
        if (entry.type !== 'job') out.push({ ...entry })
        else if (Object.hasOwn(data().jobs, entry.jobId)) out.push({ type: 'job', job: data().jobs[entry.jobId].job })
      }
      return out.slice(-limit)
    },
    putJob: (stored) => write((draft) => void (draft.jobs[stored.job.id] = stored)),
    async updateJob(id, change) {
      if (!Object.hasOwn(data().jobs, id)) throw missing('job', id)
      await write((draft) => change(draft.jobs[id]))
      return data().jobs[id]
    },
    putChange: (stored) => write((draft) => void (draft.changes[stored.change.id] = stored)),
    async updateChange(id, change) {
      if (!Object.hasOwn(data().changes, id)) throw missing('change', id)
      await write((draft) => change(draft.changes[id]))
      return data().changes[id]
    },
    appendThread: (page, entry) =>
      write((draft) => {
        const list = Object.hasOwn(draft.threads, page) ? draft.threads[page] : (draft.threads[page] = [])
        list.push(entry)
        prune(draft)
      }),
    transact: (change) => write(change),
    flush: () => file.flush(),
  }
}

function publicationsStore(file: JsonFile<PublicationsData>): PublicationsStore {
  return {
    get: () => file.get(),
    update: (change) => file.update((draft) => void change(draft)),
    nextNumber: () => file.get().publications.reduce((max, publication) => Math.max(max, publication.number), 0) + 1,
    flush: () => file.flush(),
  }
}

/** Ouvre (ou crée) le magasin dans `dataDir` (absolu). */
export async function openEngineStore(dataDir: string): Promise<EngineStore> {
  if (!dataDir || !path.isAbsolute(dataDir)) throw new Error('The engine data folder must be an absolute path.')
  const editor = await openJsonFile<EditorData>(
    path.join(dataDir, 'editor.json'),
    () => ({ version: 1, jobs: {}, changes: {}, threads: {} }),
    migrateEditor,
  )
  const publications = await openJsonFile<PublicationsData>(
    path.join(dataDir, 'publications.json'),
    () => ({ version: 1, publications: [], run: null, lastPublishedAt: null, extra: {} }),
    migratePublications,
  )
  return { editor: editorStore(editor), publications: publicationsStore(publications), dir: dataDir }
}
