import type { PendingContentItem, PendingDesignItem } from '../../../src/admin/core/contracts'
import { draftIdOf, listDrafts, publishedIdOf, type SanityDoc, type SanityPort } from '../content/sanity'
import type { WorkRepo } from '../git/git'
import type { EditorStore } from '../store/store'
import { describeDraft, type Catalog } from './catalog'
import type { ContentSnapshot } from './state'

/**
 * Ce qui attend d'être mis en ligne (E1, compteur N de G3) :
 * - contenu : brouillons Sanity (`drafts.<id>`) des types gérés par l'admin, qui diffèrent vraiment du publié ;
 * - design : modifications IA VALIDÉES dont le commit (sur draft) n'est pas encore dans main.
 */

export type ContentPending = PendingContentItem & { rev: string }

export type Pending = {
  content: ContentPending[]
  design: PendingDesignItem[]
  total: number
  lastValidatedAt?: string
}

export type PendingDeps = {
  sanity: SanityPort | null
  catalog: Catalog
  repo: WorkRepo
  editorStore: EditorStore
  validatedDesign: () => Promise<PendingDesignItem[]>
}

/** Id publié sûr (même règle que content/sanity.ts) : on ne relaie jamais un id bizarre vers l'API Actions. */
export const PUBLISHED_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
export const isPublishableId = (id: string) => PUBLISHED_ID.test(id) && !id.startsWith('drafts.') && !id.includes('..')

const CHUNK = 100

async function getDocuments(sanity: SanityPort, ids: string[]): Promise<Map<string, SanityDoc>> {
  const found = new Map<string, SanityDoc>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const docs = await sanity.getDocuments(slice)
    docs.forEach((doc, index) => void (doc && found.set(slice[index], doc)))
  }
  return found
}

/**
 * Auteurs connus du moteur : documents écrits par une demande IA encore ouverte ou validée (le moteur écrit avec le
 * jeton robot ; Sanity ne dit pas QUI a modifié un brouillon écrit par l'admin).
 */
export function aiAuthors(editorStore: EditorStore): Map<string, string> {
  const authors = new Map<string, { name: string; at: string }>()
  const data = editorStore.data()
  for (const stored of Object.values(data.changes)) {
    if (!['working', 'to-validate', 'validated'].includes(stored.change.status)) continue
    for (const jobId of stored.change.jobIds) {
      const job = Object.hasOwn(data.jobs, jobId) ? data.jobs[jobId].job : null
      if (!job || job.status !== 'done') continue
      const at = job.finishedAt ?? job.createdAt
      for (const text of job.texts) {
        const previous = authors.get(text.document)
        if (!previous || previous.at < at) authors.set(text.document, { name: job.requestedBy.name, at })
      }
    }
  }
  return new Map([...authors].map(([id, entry]) => [id, entry.name]))
}

/** Brouillons de contenu à publier, du plus récent au plus ancien. */
export async function pendingContent(deps: Pick<PendingDeps, 'sanity' | 'catalog' | 'editorStore'>): Promise<ContentPending[]> {
  const { sanity, catalog } = deps
  if (!sanity) return []
  const drafts = (await listDrafts(sanity)).filter((draft) => {
    const id = publishedIdOf(draft._id)
    return catalog.types.has(draft._type) && isPublishableId(id) && catalog.resolve(draft._type, id) !== null
  })
  if (!drafts.length) return []
  const ids = drafts.flatMap((draft) => [draft._id, publishedIdOf(draft._id)])
  const docs = await getDocuments(sanity, ids)
  const authors = aiAuthors(deps.editorStore)
  const items: ContentPending[] = []
  for (const listed of drafts) {
    const id = publishedIdOf(listed._id)
    const draft = docs.get(draftIdOf(id))
    const entry = catalog.resolve(listed._type, id)
    if (!draft || !entry) continue
    const description = describeDraft(entry, draft, docs.get(id) ?? null)
    if (!description) continue
    const author = authors.get(id)
    items.push({
      id,
      type: draft._type,
      path: description.path,
      summary: description.summary,
      ...(author ? { author } : {}),
      updatedAt: typeof draft._updatedAt === 'string' ? draft._updatedAt : listed._updatedAt,
      ...(description.viewPath ? { viewPath: description.viewPath } : {}),
      rev: typeof draft._rev === 'string' ? draft._rev : listed._rev,
    })
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Modifications IA validées pas encore dans main. */
export async function pendingDesign(deps: Pick<PendingDeps, 'repo' | 'validatedDesign'>): Promise<PendingDesignItem[]> {
  const items = await deps.validatedDesign()
  const out: PendingDesignItem[] = []
  for (const item of items) {
    // Déjà dans main (publication interrompue entre l'avance rapide et l'écriture du statut) : plus en attente.
    if (await deps.repo.isAncestor(item.commit, 'refs/heads/main')) continue
    out.push(item)
  }
  return out
}

export async function computePending(deps: PendingDeps): Promise<Pending> {
  const [content, design] = await Promise.all([pendingContent(deps), pendingDesign(deps)])
  const validatedAt = deps.editorStore
    .validatedChanges()
    .map((stored) => stored.change.validatedAt)
    .filter((at): at is string => !!at)
    .sort()
  return {
    content,
    design,
    total: content.length + design.length,
    ...(validatedAt.length ? { lastValidatedAt: validatedAt.at(-1) } : {}),
  }
}

/**
 * `expected` de POST /publish = la liste vue par le client. Chaque entrée : `<id>` ou `<id>@<updatedAt>` (contenu),
 * `<changeId>` ou `<changeId>@<commit>` (design, commit entier ou préfixe ≥ 7). La forme avec `@` refuse aussi un
 * élément modifié depuis. Renvoie le message du refus, ou null si la liste est la même.
 */
export function expectedMismatch(expected: readonly string[], pending: Pick<Pending, 'content' | 'design'>): string | null {
  const current = new Map<string, (version: string) => boolean>()
  for (const item of pending.content) current.set(item.id, (version) => version === item.updatedAt)
  for (const item of pending.design) current.set(item.changeId, (version) => version.length >= 7 && item.commit.startsWith(version))
  const seen = new Set<string>()
  for (const entry of expected) {
    const at = entry.indexOf('@')
    const key = at === -1 ? entry : entry.slice(0, at)
    const check = current.get(key)
    if (!check) return 'The list of changes has changed since you opened it. Review it and publish again.'
    if (at !== -1 && !check(entry.slice(at + 1))) return 'A change was edited since you opened the list. Review it and publish again.'
    seen.add(key)
  }
  if (seen.size !== current.size) return 'The list of changes has changed since you opened it. Review it and publish again.'
  return null
}

export const snapshotContent = (items: readonly ContentPending[]): ContentSnapshot[] =>
  items.map((item) => ({ id: item.id, type: item.type, rev: item.rev, path: item.path }))
