import type {
  Answer,
  AskRequest,
  AskResponse,
  ClaudeAccessInput,
  ClaudeAccessState,
  EditJob,
  EditRequest,
  EditorState,
  EngineErrorCode,
  EngineHealth,
  PendingChange,
  Publication,
  PublishStatus,
} from '../contracts/engine'

import { ENGINE_MESSAGES, isEngineErrorBody } from './errors'

/**
 * Client NAVIGATEUR typé du moteur IA, pour les composants client. Il n'appelle que le relais same-origin
 * `/admin/api/engine/*` (le cookie de session suit tout seul) ; aucun secret ici. Erreurs : EngineClientError
 * (status HTTP + code du contrat + message anglais prêt à afficher).
 */

export const ENGINE_RELAY_BASE = '/admin/api/engine'

export class EngineClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'EngineClientError'
  }
}

type Options = { signal?: AbortSignal; fetchImpl?: typeof fetch }

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, options: Options = {}): Promise<T> {
  let res: Response
  try {
    res = await (options.fetchImpl ?? fetch)(`${ENGINE_RELAY_BASE}/${path}`, {
      method,
      headers: { accept: 'application/json', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal,
    })
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err
    throw new EngineClientError(0, 'unavailable', ENGINE_MESSAGES.unavailable)
  }
  const parsed = res.status === 204 ? null : await res.json().catch(() => undefined)
  if (!res.ok) {
    if (isEngineErrorBody(parsed)) throw new EngineClientError(res.status, parsed.error.code, parsed.error.message)
    throw new EngineClientError(res.status, 'internal', ENGINE_MESSAGES.badResponse)
  }
  return parsed as T
}

const seg = encodeURIComponent

export const engineClient = {
  health: (o?: Options) => call<EngineHealth>('GET', 'health', undefined, o),
  editor: {
    state: (page: string, o?: Options) => call<EditorState>('GET', `editor/state?page=${seg(page)}`, undefined, o),
    request: (request: EditRequest, o?: Options) => call<EditJob>('POST', 'editor/requests', request, o),
    job: (jobId: string, o?: Options) => call<EditJob>('GET', `editor/jobs/${seg(jobId)}`, undefined, o),
    answer: (jobId: string, answers: Answer[], o?: Options) => call<EditJob>('POST', `editor/jobs/${seg(jobId)}/answer`, { answers }, o),
    stop: (jobId: string, o?: Options) => call<EditJob>('POST', `editor/jobs/${seg(jobId)}/stop`, {}, o),
    validate: (changeId: string, o?: Options) => call<PendingChange>('POST', `editor/changes/${seg(changeId)}/validate`, {}, o),
    cancel: (changeId: string, o?: Options) => call<PendingChange>('POST', `editor/changes/${seg(changeId)}/cancel`, {}, o),
    /** URL d'une capture (pour <img src>) ; `file` : « 001-before.png ». */
    shotUrl: (jobId: string, file: string) => `${ENGINE_RELAY_BASE}/editor/jobs/${seg(jobId)}/shots/${seg(file)}`,
  },
  publish: {
    status: (o?: Options) => call<PublishStatus>('GET', 'publish/status', undefined, o),
    run: (expected: string[], o?: Options) => call<PublishStatus>('POST', 'publish', { expected }, o),
    retry: (o?: Options) => call<PublishStatus>('POST', 'publish/retry', {}, o),
    discard: (item: { kind: 'content'; id: string } | { kind: 'design'; changeId: string }, o?: Options) =>
      call<PublishStatus>('POST', 'publish/discard', item, o),
    /** Programme la dépublication ou la suppression d'un document au prochain Publish (POST /publish/stage). */
    stage: (item: { kind: 'unpublish' | 'delete'; id: string }, o?: Options) => call<PublishStatus>('POST', 'publish/stage', item, o),
    /** Annule une dépublication / suppression programmée (POST /publish/unstage). */
    unstage: (id: string, o?: Options) => call<PublishStatus>('POST', 'publish/unstage', { id }, o),
    /** Kuartz seulement (publish.diff). */
    diff: (changeId: string, o?: Options) => call<{ diff: string }>('GET', `publish/diff/${seg(changeId)}`, undefined, o),
  },
  versions: {
    list: (o?: Options) =>
      call<{ publications: Publication[]; rollback: { available: boolean; reason?: string } }>('GET', 'versions', undefined, o),
    /** Kuartz seulement (versions.rollback) ; 501 not_implemented en mode local. */
    rollback: (number: number, o?: Options) => call<Publication>('POST', `versions/${seg(String(number))}/rollback`, {}, o),
  },
  ask: (request: AskRequest, o?: Options) => call<AskResponse>('POST', 'ask', request, o),
  /** Connexion à Claude (B5) — droit ai.access. La clé part une fois (POST) et ne revient jamais : seulement `keyHint`. */
  claude: {
    access: (o?: Options) => call<ClaudeAccessState>('GET', 'claude/access', undefined, o),
    save: (input: ClaudeAccessInput, o?: Options) => call<ClaudeAccessState>('POST', 'claude/access', input, o),
    test: (o?: Options) => call<ClaudeAccessState>('POST', 'claude/access/test', {}, o),
    clear: (o?: Options) => call<ClaudeAccessState>('POST', 'claude/access/clear', {}, o),
  },
}

export type EngineClient = typeof engineClient
