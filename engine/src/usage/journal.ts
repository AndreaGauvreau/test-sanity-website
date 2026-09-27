import { appendFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import type { AiUsageDoc, EditJob, EngineUser, Usage } from '../../../src/admin/core/contracts'
import type { SanityPort } from '../content/sanity'
import type { UsageRecorder } from '../jobs/types'
import { writeFileAtomic } from '../store/json-file'

/**
 * Journal de consommation IA (B5, pied de Ask AI) : UN document Sanity PRIVÉ `aiUsage.<id>` (le point le rend illisible
 * sans jeton) par demande IA terminée, écrit avec le jeton robot. Id déterministe (`aiUsage.<requestId>`) et
 * `createIfNotExists` : écrire deux fois la même demande ne crée jamais de doublon (rejeu sûr).
 *
 * Jamais de perte silencieuse : sans jeton, ou si Sanity échoue, le document part dans un journal local de secours
 * (`<ENGINE_WORKSPACE>/data/usage-pending.jsonl`, une ligne JSON par document, 0600), rejoué au démarrage et après
 * chaque écriture réussie. Si même l'ajout au fichier échoue, l'erreur remonte (l'éditeur la journalise).
 */

export const PENDING_FILE = 'usage-pending.jsonl'

export type UsageJournal = {
  /** Port de l'éditeur (engine-core) : appelé à la fin de CHAQUE demande. */
  readonly recorder: UsageRecorder
  /** Écrit un document (éditeur ou Ask AI) : 'sanity' s'il est parti, 'pending' s'il attend dans le journal local. */
  record(doc: AiUsageDoc): Promise<'sanity' | 'pending'>
  /** Rejoue le journal local ; s'arrête au premier échec de Sanity (le reste attend). */
  flush(): Promise<{ sent: number; left: number }>
  /** Nombre de documents en attente dans le journal local. */
  pendingCount(): Promise<number>
}

export type UsageJournalDeps = {
  sanity: SanityPort | null
  /** Dossier `data/` du moteur (absolu). */
  dataDir: string
  log?: (line: string) => void
  now?: () => Date
}

const ID_PART = /^[A-Za-z0-9_-]{1,100}$/

/** Longueur maximale de `AiUsageDoc.request` (colonne « Request » de B5). */
export const REQUEST_MAX = 120

/**
 * Texte de la demande pour B5 : espaces réunis, 120 caractères au plus (« … » compris). Donnée citée telle quelle par
 * l'admin, jamais interprétée. null si vide.
 */
export function requestText(note: string | undefined): string | null {
  const flat = (note ?? '').replace(/\s+/g, ' ').trim()
  if (!flat) return null
  return flat.length > REQUEST_MAX ? `${flat.slice(0, REQUEST_MAX - 1).trimEnd()}…` : flat
}

const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0

/** Forme minimale d'un AiUsageDoc (lignes du journal local relues, documents d'Ask AI). */
export function isAiUsageDoc(value: unknown): value is AiUsageDoc {
  if (typeof value !== 'object' || value === null) return false
  const doc = value as Record<string, unknown>
  const user = doc.user as Record<string, unknown> | undefined
  return (
    typeof doc._id === 'string' &&
    doc._id.startsWith('aiUsage.') &&
    ID_PART.test(doc._id.slice('aiUsage.'.length)) &&
    doc._type === 'aiUsage' &&
    (doc.feature === 'editor' || doc.feature === 'ask') &&
    typeof doc.requestId === 'string' &&
    typeof doc.status === 'string' &&
    typeof doc.createdAt === 'string' &&
    (doc.request === undefined || (typeof doc.request === 'string' && doc.request.length <= REQUEST_MAX)) &&
    typeof doc.model === 'string' &&
    !!user &&
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof user.role === 'string' &&
    ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'costUsd', 'durationMs'].every((key) => finite(doc[key]))
  )
}

function usageFields(usage: Usage): Usage {
  return {
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    costUsd: usage.costUsd,
    costKind: usage.costKind,
    access: usage.access,
    durationMs: usage.durationMs,
    ...(usage.turns !== undefined ? { turns: usage.turns } : {}),
  }
}

/** Id Sanity sûr pour une demande (« job_…», « ask_… ») : caractères permis seulement. */
export function usageDocId(requestId: string): `aiUsage.${string}` {
  const safe = requestId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100) || 'unknown'
  return `aiUsage.${safe}`
}

/**
 * Document d'une demande de l'éditeur. null si Claude n'a pas tourné (`job.usage` absent : refus avant l'appel,
 * aperçu indisponible…) : rien n'a été consommé, rien n'est écrit.
 */
export function usageDocFromJob(job: EditJob, now: () => Date = () => new Date()): AiUsageDoc | null {
  if (!job.usage) return null
  const request = requestText(job.request.note)
  return {
    _id: usageDocId(job.id),
    _type: 'aiUsage',
    feature: 'editor',
    requestId: job.id,
    status: job.status,
    page: job.request.page,
    ...(request ? { request } : {}),
    user: { id: job.requestedBy.id, name: job.requestedBy.name, role: job.requestedBy.role },
    createdAt: job.finishedAt ?? now().toISOString(),
    ...usageFields(job.usage),
  }
}

/**
 * Document d'une question Ask AI (pour ask-ai : `askUsageRecorderOf(context)`, ou
 * `getUsageJournal(context).record(askUsageDoc(...))`). `request` : la question (tronquée à 120 caractères).
 */
export function askUsageDoc(input: {
  requestId: string
  user: EngineUser
  usage: Usage
  status?: string
  screen?: string
  at?: string
  request?: string
}): AiUsageDoc {
  const request = requestText(input.request)
  return {
    _id: usageDocId(input.requestId),
    _type: 'aiUsage',
    feature: 'ask',
    requestId: input.requestId,
    status: input.status ?? 'done',
    ...(input.screen ? { page: input.screen } : {}),
    ...(request ? { request } : {}),
    user: { id: input.user.id, name: input.user.name, role: input.user.role },
    createdAt: input.at ?? new Date().toISOString(),
    ...usageFields(input.usage),
  }
}

/**
 * Entrée d'Ask AI : même forme qu'`AskUsageEntry` d'engine/src/ask/usage.ts (types structurels, pas d'import croisé),
 * plus `request` facultatif (la question).
 */
export type AskUsageInput = {
  requestId: string
  user: EngineUser
  usage: Usage
  status: string
  page?: string
  createdAt: string
  request?: string
}

/** Port `AskUsageRecorder` d'ask-ai branché sur le journal commun (secours local + rejeu, jamais de perte). */
export function askRecorderFor(journal: Pick<UsageJournal, 'record'>): { recordAsk(entry: AskUsageInput): Promise<void> } {
  return {
    async recordAsk(entry) {
      await journal.record(
        askUsageDoc({
          requestId: entry.requestId,
          user: entry.user,
          usage: entry.usage,
          status: entry.status,
          at: entry.createdAt,
          ...(entry.page ? { screen: entry.page } : {}),
          ...(entry.request ? { request: entry.request } : {}),
        }),
      )
    },
  }
}

export function createUsageJournal(deps: UsageJournalDeps): UsageJournal {
  if (!deps.dataDir || !path.isAbsolute(deps.dataDir)) throw new Error('The usage journal needs an absolute data folder.')
  const file = path.join(deps.dataDir, PENDING_FILE)
  const log = deps.log ?? ((line: string) => console.error(line))
  const now = deps.now ?? (() => new Date())
  let chain: Promise<unknown> = Promise.resolve()

  /** Une opération sur le journal local à la fois (ajout et réécriture ne se croisent jamais). */
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = chain.then(task, task)
    chain = next.catch(() => {})
    return next
  }

  const readLines = async (): Promise<string[]> => {
    try {
      return (await readFile(file, 'utf8')).split('\n').filter((line) => line.trim())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  const append = (doc: AiUsageDoc) => appendFile(file, `${JSON.stringify(doc)}\n`, { encoding: 'utf8', mode: 0o600 })

  async function send(doc: AiUsageDoc): Promise<void> {
    if (!deps.sanity) throw new Error('no Sanity write token')
    await deps.sanity.createIfNotExists(doc)
  }

  async function flushNow(): Promise<{ sent: number; left: number }> {
    const lines = await readLines()
    if (!lines.length || !deps.sanity) return { sent: 0, left: lines.length }
    const left: string[] = []
    let sent = 0
    let stopped = false
    for (const line of lines) {
      if (stopped) {
        left.push(line)
        continue
      }
      let doc: unknown
      try {
        doc = JSON.parse(line)
      } catch {
        doc = null
      }
      // Ligne illisible : gardée telle quelle (jamais effacée en silence), signalée.
      if (!isAiUsageDoc(doc)) {
        left.push(line)
        continue
      }
      try {
        await send(doc)
        sent++
      } catch (error) {
        stopped = true
        left.push(line)
        log(`[usage] replay paused (Sanity unavailable): ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (sent) {
      if (left.length) await writeFileAtomic(file, `${left.join('\n')}\n`)
      else await rm(file, { force: true })
      log(`[usage] ${sent} pending usage record(s) sent to Sanity${left.length ? `, ${left.length} still pending` : ''}`)
    }
    return { sent, left: left.length }
  }

  const journal: UsageJournal = {
    recorder: {
      async record({ job }) {
        const doc = usageDocFromJob(job, now)
        if (doc) await journal.record(doc)
      },
    },

    record(doc) {
      return serial(async () => {
        if (!isAiUsageDoc(doc)) throw new Error('Invalid aiUsage document.')
        try {
          await send(doc)
        } catch (error) {
          try {
            await append(doc)
          } catch (appendError) {
            log(`[usage] ${doc.requestId}: NOT recorded (Sanity and the local journal both failed)`)
            throw appendError
          }
          log(`[usage] ${doc.requestId}: kept in data/${PENDING_FILE} (${deps.sanity ? `Sanity failed: ${error instanceof Error ? error.message : String(error)}` : 'no Sanity write token'})`)
          return 'pending' as const
        }
        // Sanity répond : on rejoue en passant ce qui attendait (sans faire attendre l'éditeur).
        void serial(flushNow).catch((error) => log(`[usage] replay failed: ${error instanceof Error ? error.message : String(error)}`))
        return 'sanity' as const
      })
    },

    flush: () => serial(flushNow),

    pendingCount: () => serial(async () => (await readLines()).length),
  }
  return journal
}
