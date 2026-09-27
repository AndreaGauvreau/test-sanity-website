import { randomBytes } from 'node:crypto'
import { getAtPath, setAtPath } from './path'
import type { PatchOps, SanityAction, SanityDoc, SanityPort } from './sanity'

/**
 * Faux Sanity en mémoire (tests du moteur et d'engine-publish) : même port que le client réel, sans réseau. Révisions
 * (`_rev`) renouvelées à chaque écriture, verrou `ifRevisionId` / `ifDraftRevisionId`, publication, abandon,
 * dépublication et suppression par l'API Actions (tout ou rien). Une requête GROQ n'est pas interprétée : `fetch`
 * répond aux seules requêtes enregistrées par `onFetch`.
 */
export type FakeSanity = SanityPort & {
  /** Documents actuels, par id (copie). */
  readonly docs: Record<string, SanityDoc>
  /** Journal des opérations, dans l'ordre (« patch drafts.x », « delete drafts.x »…). */
  readonly log: string[]
  /** Fait échouer la prochaine opération dont le nom commence par `op` (« patch », « action »…). */
  failNext(op: string, error?: Error): void
  onFetch(handler: (query: string, params?: Record<string, unknown>) => unknown): void
}

const rev = () => randomBytes(6).toString('hex')

export function createFakeSanity(initial: SanityDoc[] = []): FakeSanity {
  const docs = new Map<string, SanityDoc>(initial.map((doc) => [doc._id, { ...structuredClone(doc), _rev: doc._rev ?? rev() }]))
  const log: string[] = []
  const failures: { op: string; error: Error }[] = []
  let fetchHandler: ((query: string, params?: Record<string, unknown>) => unknown) | null = null

  const maybeFail = (op: string) => {
    const index = failures.findIndex((failure) => op.startsWith(failure.op))
    if (index >= 0) throw failures.splice(index, 1)[0].error
  }
  const stamp = (doc: SanityDoc): SanityDoc => ({ ...doc, _rev: rev(), _updatedAt: new Date().toISOString() })

  const fake: FakeSanity = {
    get docs() {
      return Object.fromEntries([...docs].map(([id, doc]) => [id, structuredClone(doc)]))
    },
    log,
    failNext: (op, error = new Error(`Fake Sanity: ${op} failed`)) => void failures.push({ op, error }),
    onFetch: (handler) => void (fetchHandler = handler),

    async getDocuments(ids) {
      maybeFail('get')
      return ids.map((id) => (docs.has(id) ? structuredClone(docs.get(id)!) : null))
    },
    async createIfNotExists(doc) {
      maybeFail('create')
      log.push(`createIfNotExists ${doc._id}`)
      if (!docs.has(doc._id)) docs.set(doc._id, stamp({ ...structuredClone(doc), _createdAt: new Date().toISOString() }))
    },
    async patch(id, ops: PatchOps) {
      maybeFail('patch')
      log.push(`patch ${id}`)
      const current = docs.get(id)
      if (!current) throw new Error(`Fake Sanity: document ${id} not found`)
      if (ops.ifRevisionId && ops.ifRevisionId !== current._rev) throw new Error('Fake Sanity: revision mismatch')
      let next: SanityDoc = current
      for (const [path, value] of Object.entries(ops.setIfMissing ?? {})) {
        if (getAtPath(next, path) === undefined) next = setAtPath(next, path, structuredClone(value))
      }
      for (const [path, value] of Object.entries(ops.set ?? {})) next = setAtPath(next, path, structuredClone(value))
      for (const path of ops.unset ?? []) {
        if (getAtPath(next, path) !== undefined) next = setAtPath(next, path, undefined)
      }
      docs.set(id, stamp(next))
    },
    async delete(id) {
      maybeFail('delete')
      log.push(`delete ${id}`)
      docs.delete(id)
    },
    async action(actions: SanityAction[]) {
      maybeFail('action')
      // Tout ou rien, comme l'API Actions : on vérifie avant d'appliquer.
      for (const action of actions) {
        switch (action.actionType) {
          case 'sanity.action.document.publish':
          case 'sanity.action.document.discard': {
            const draft = docs.get(action.draftId)
            if (!draft) throw new Error(`Fake Sanity: draft ${action.draftId} not found`)
            if (action.actionType !== 'sanity.action.document.publish') break
            if (action.ifDraftRevisionId && action.ifDraftRevisionId !== draft._rev) throw new Error('Fake Sanity: draft revision mismatch')
            const published = docs.get(action.publishedId)
            if (action.ifPublishedRevisionId && action.ifPublishedRevisionId !== published?._rev) {
              throw new Error('Fake Sanity: published revision mismatch')
            }
            break
          }
          case 'sanity.action.document.unpublish':
            if (!docs.has(action.publishedId)) throw new Error(`Fake Sanity: ${action.publishedId} is not published`)
            break
          case 'sanity.action.document.delete': {
            if (!docs.has(action.publishedId)) throw new Error(`Fake Sanity: ${action.publishedId} not found`)
            const draft = `drafts.${action.publishedId}`
            if (docs.has(draft) && !action.includeDrafts.includes(draft)) throw new Error('Fake Sanity: a draft exists that is not specified for deletion')
            break
          }
        }
      }
      for (const action of actions) {
        switch (action.actionType) {
          case 'sanity.action.document.publish': {
            log.push(`${action.actionType} ${action.draftId}`)
            const draft = docs.get(action.draftId)!
            docs.set(action.publishedId, stamp({ ...draft, _id: action.publishedId }))
            docs.delete(action.draftId)
            break
          }
          case 'sanity.action.document.discard':
            log.push(`${action.actionType} ${action.draftId}`)
            docs.delete(action.draftId)
            break
          case 'sanity.action.document.unpublish': {
            // Comme Sanity : le contenu publié reste en brouillon (le brouillon existant, sinon une copie du publié).
            log.push(`${action.actionType} ${action.publishedId}`)
            const published = docs.get(action.publishedId)!
            if (!docs.has(action.draftId)) docs.set(action.draftId, stamp({ ...structuredClone(published), _id: action.draftId }))
            docs.delete(action.publishedId)
            break
          }
          case 'sanity.action.document.delete':
            log.push(`${action.actionType} ${action.publishedId}`)
            for (const draft of action.includeDrafts) docs.delete(draft)
            docs.delete(action.publishedId)
            break
        }
      }
    },
    async fetch<T>(query: string, params?: Record<string, unknown>) {
      maybeFail('fetch')
      if (!fetchHandler) throw new Error('Fake Sanity: no fetch handler')
      return fetchHandler(query, params) as T
    },
  }
  return fake
}
