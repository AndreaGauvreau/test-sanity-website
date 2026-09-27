import type { AskLink, AskMessage, Usage } from '../../core/contracts/engine'
import { isSafeAskHref } from './links'

/**
 * Conversation d'Ask AI (G4) : état pur (réducteur), historique envoyé au moteur, persistance de SESSION
 * (sessionStorage : un onglet, effacé à sa fermeture ; rattachée à l'utilisateur pour ne jamais montrer la conversation
 * d'un autre compte ouvert ensuite dans le même onglet). Pur : aucun React ici.
 */

export const QUESTION_MAX = 1000
/** Contrat AskRequest : 10 derniers messages au plus (5 questions-réponses). */
export const HISTORY_MAX = 10
/** Nombre de questions gardées dans la session. */
export const TURNS_KEPT = 30
export const STORAGE_KEY = 'kz-ask-ai'
const STORAGE_VERSION = 1

export const INTERRUPTED_MESSAGE = 'The answer was interrupted. Ask again.'

export type AskTurnUsage = Pick<Usage, 'model' | 'inputTokens' | 'outputTokens' | 'costUsd' | 'costKind'>

export type AskTurn = {
  id: string
  question: string
  status: 'pending' | 'answered' | 'error'
  answer?: string
  links?: AskLink[]
  refusedChange?: boolean
  usage?: AskTurnUsage
  error?: string
}

export type Conversation = { turns: AskTurn[] }

export type ConversationAction =
  | { type: 'ask'; id: string; question: string }
  | { type: 'answer'; id: string; answer: string; links: AskLink[]; refusedChange: boolean; usage: AskTurnUsage }
  | { type: 'fail'; id: string; error: string }
  /** « Try again » : la question en échec repart, à sa place dans le fil. */
  | { type: 'retry'; id: string }
  | { type: 'restore'; turns: AskTurn[] }
  | { type: 'clear' }

export const EMPTY_CONVERSATION: Conversation = { turns: [] }

export function conversationReducer(state: Conversation, action: ConversationAction): Conversation {
  switch (action.type) {
    case 'ask':
      return { turns: [...state.turns, { id: action.id, question: action.question, status: 'pending' as const }].slice(-TURNS_KEPT) }
    case 'answer':
      return {
        turns: state.turns.map((turn) =>
          turn.id === action.id
            ? { ...turn, status: 'answered' as const, answer: action.answer, links: action.links, refusedChange: action.refusedChange, usage: action.usage, error: undefined }
            : turn,
        ),
      }
    case 'fail':
      return { turns: state.turns.map((turn) => (turn.id === action.id ? { ...turn, status: 'error' as const, error: action.error } : turn)) }
    case 'retry':
      return { turns: state.turns.map((turn) => (turn.id === action.id ? { id: turn.id, question: turn.question, status: 'pending' as const } : turn)) }
    case 'restore':
      return { turns: action.turns }
    case 'clear':
      return EMPTY_CONVERSATION
  }
}

export function isPending(state: Conversation): boolean {
  return state.turns.some((turn) => turn.status === 'pending')
}

/** Historique pour le moteur : questions-réponses abouties AVANT `beforeId` (toutes sinon), les 10 derniers messages. */
export function historyOf(turns: readonly AskTurn[], beforeId?: string): AskMessage[] {
  const messages: AskMessage[] = []
  for (const turn of turns) {
    if (turn.id === beforeId) break
    if (turn.status !== 'answered' || !turn.answer) continue
    messages.push({ role: 'user', text: turn.question }, { role: 'assistant', text: turn.answer })
  }
  return messages.slice(-HISTORY_MAX)
}

/** Question prête à envoyer (espaces retirés), ou null (vide, trop longue). */
export function normalizeQuestion(text: string): string | null {
  const question = text.trim()
  if (!question || [...question].length > QUESTION_MAX) return null
  return question
}

// ─── Persistance (sessionStorage) ────────────────────────────────────────────

type Stored = { v: number; userId: string; turns: AskTurn[] }

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

function sanitizeTurn(value: unknown): AskTurn | null {
  if (!value || typeof value !== 'object') return null
  const t = value as Record<string, unknown>
  if (typeof t.id !== 'string' || typeof t.question !== 'string' || !t.question) return null
  const question = t.question.slice(0, QUESTION_MAX)
  // Une réponse qui n'est jamais arrivée (rechargement pendant l'attente) devient une erreur.
  if (t.status === 'pending') return { id: t.id, question, status: 'error', error: INTERRUPTED_MESSAGE }
  if (t.status === 'error') return { id: t.id, question, status: 'error', error: typeof t.error === 'string' ? t.error.slice(0, 300) : INTERRUPTED_MESSAGE }
  if (t.status !== 'answered' || typeof t.answer !== 'string') return null
  const links = Array.isArray(t.links)
    ? t.links.flatMap((l) => {
        const link = l as Partial<AskLink>
        return typeof link?.label === 'string' && isSafeAskHref(link.href) ? [{ label: link.label.slice(0, 80), href: link.href }] : []
      })
    : []
  const u = t.usage as Partial<AskTurnUsage> | undefined
  const usage: AskTurnUsage | undefined =
    u && isNum(u.inputTokens) && isNum(u.outputTokens) && isNum(u.costUsd)
      ? { model: typeof u.model === 'string' ? u.model : '', inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd, costKind: u.costKind === 'estimated' ? 'estimated' : 'billed' }
      : undefined
  return { id: t.id, question, status: 'answered', answer: t.answer.slice(0, 2000), links, refusedChange: t.refusedChange === true, ...(usage ? { usage } : {}) }
}

/** Relit la conversation de CET utilisateur (autre utilisateur, version ou JSON invalide → vide). */
export function readStoredTurns(raw: string | null, userId: string): AskTurn[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<Stored>
    if (parsed?.v !== STORAGE_VERSION || parsed.userId !== userId || !Array.isArray(parsed.turns)) return []
    return parsed.turns.flatMap((turn) => sanitizeTurn(turn) ?? []).slice(-TURNS_KEPT)
  } catch {
    return []
  }
}

export function serializeTurns(turns: readonly AskTurn[], userId: string): string {
  const stored: Stored = { v: STORAGE_VERSION, userId, turns: turns.slice(-TURNS_KEPT) }
  return JSON.stringify(stored)
}

/** Accès protégé (navigation privée, stockage bloqué : jamais d'exception). */
export const sessionStore = {
  read(): string | null {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  },
  write(value: string) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Stockage indisponible : la conversation vit seulement en mémoire.
    }
  },
  clear() {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // idem
    }
  },
}
