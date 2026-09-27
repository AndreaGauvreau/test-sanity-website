import { z } from 'zod'
import type { AskMessage, AskRequest } from '../../../src/admin/core/contracts'

/**
 * Validation de `POST /ask` (contrat AskRequest) : question de 1 à 1 000 caractères, 10 messages d'historique au plus,
 * écran courant facultatif (chemin de l'admin). Le corps a déjà été borné à 64 Kio par le serveur.
 */

export const QUESTION_MAX = 1000
export const HISTORY_MAX = 10
/** Un message d'historique : une question (≤ 1 000) ou une réponse (courte, voir answer.ts) ; marge pour l'ancien format. */
export const HISTORY_TEXT_MAX = 4000

export const ASK_REQUEST_MESSAGES = {
  question: `Ask a question of 1 to ${QUESTION_MAX} characters.`,
  history: `The conversation sent is too long (${HISTORY_MAX} messages at most).`,
  invalid: 'Invalid Ask AI request.',
} as const

const message = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(HISTORY_TEXT_MAX),
})

const schema = z.object({
  question: z.string(),
  history: z.array(z.unknown()).optional().default([]),
  screen: z.string().max(200).optional(),
})

export type ParsedAskRequest = Required<Pick<AskRequest, 'question' | 'history'>> & { screen?: string }

export type AskRequestParse = { ok: true; request: ParsedAskRequest } | { ok: false; error: string }

/** Caractères de contrôle retirés (sauf retours à la ligne et tabulations), blancs de tête et de fin retirés. */
function clean(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
}

export function parseAskRequest(body: unknown): AskRequestParse {
  const parsed = schema.safeParse(body)
  if (!parsed.success) return { ok: false, error: ASK_REQUEST_MESSAGES.invalid }
  const question = clean(parsed.data.question)
  if (!question || [...question].length > QUESTION_MAX) return { ok: false, error: ASK_REQUEST_MESSAGES.question }
  if (parsed.data.history.length > HISTORY_MAX) return { ok: false, error: ASK_REQUEST_MESSAGES.history }
  const history: AskMessage[] = []
  for (const item of parsed.data.history) {
    const entry = message.safeParse(item)
    if (!entry.success) return { ok: false, error: ASK_REQUEST_MESSAGES.invalid }
    const text = clean(entry.data.text)
    if (text) history.push({ role: entry.data.role, text })
  }
  const screen = parsed.data.screen?.trim()
  return { ok: true, request: { question, history, ...(screen && /^\/admin(?:[/?][^\s]*)?$/.test(screen) ? { screen } : {}) } }
}
