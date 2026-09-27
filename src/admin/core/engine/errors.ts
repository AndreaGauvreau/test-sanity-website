import type { EngineErrorBody, EngineErrorCode } from '../contracts/engine'

/**
 * Erreurs du canal admin ↔ moteur, partagées serveur et navigateur. Pur.
 * Messages destinés à l'utilisateur de l'admin : anglais.
 */

export const ENGINE_MESSAGES = {
  notConfigured: 'The AI engine is not configured.',
  unavailable: "The AI engine isn't responding. Try again in a moment.",
  timeout: 'The AI engine took too long to respond. Try again in a moment.',
  badResponse: 'The AI engine sent an unexpected response.',
  notFound: 'Not found',
  forbidden: "You don't have access to this.",
  badRequest: 'Invalid request.',
  tooLarge: 'This request is too large.',
  mockNotImplemented: (area: string) => `Mock engine: "${area}" is not implemented yet.`,
} as const

export class EngineRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'EngineRequestError'
  }
}

export function isEngineErrorBody(value: unknown): value is EngineErrorBody {
  const error = (value as { error?: unknown } | null)?.error as { code?: unknown; message?: unknown } | undefined
  return !!error && typeof error.code === 'string' && typeof error.message === 'string'
}

export function engineErrorBody(code: EngineErrorCode, message: string): EngineErrorBody {
  return { error: { code, message } }
}

/** Réponse HTTP d'erreur au format EngineErrorBody. */
export function engineErrorResponse(status: number, code: EngineErrorCode, message: string): Response {
  return Response.json(engineErrorBody(code, message), { status, headers: { 'cache-control': 'no-store' } })
}
