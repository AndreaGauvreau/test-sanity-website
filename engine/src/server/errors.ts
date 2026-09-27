import type { EngineErrorBody, EngineErrorCode } from '../../../src/admin/core/contracts'

/**
 * Erreur métier du moteur : statut HTTP + code du contrat + message ANGLAIS pour le client de l'admin
 * (`EngineErrorBody`). Tout ce qui n'est pas une EngineError devient 500 `internal` sans détail (journal du moteur seul).
 */
export class EngineError extends Error {
  constructor(
    readonly status: number,
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'EngineError'
  }

  toBody(): EngineErrorBody {
    return { error: { code: this.code, message: this.message } }
  }
}

export const badRequest = (message: string) => new EngineError(400, 'bad_request', message)
export const notFound = (message = 'Not found.') => new EngineError(404, 'not_found', message)
export const conflict = (message: string) => new EngineError(409, 'conflict', message)
export const unavailable = (message: string) => new EngineError(503, 'unavailable', message)
export const forbidden = (message = 'You don’t have access to this action.') => new EngineError(403, 'forbidden', message)

/** Messages des refus 409 d'une nouvelle demande (contrat : busy | awaiting_validation | publishing). */
export const BUSY_MESSAGE = 'Claude is already working on a change. Wait for it to finish.'
export const AWAITING_MESSAGE = 'Validate or cancel the current change first.'
export const PUBLISHING_MESSAGE = 'A publication is in progress. Try again in a moment.'

export const busy = () => new EngineError(409, 'busy', BUSY_MESSAGE)
export const awaitingValidation = () => new EngineError(409, 'awaiting_validation', AWAITING_MESSAGE)
export const publishing = () => new EngineError(409, 'publishing', PUBLISHING_MESSAGE)
