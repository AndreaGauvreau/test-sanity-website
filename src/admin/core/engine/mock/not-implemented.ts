import { engineErrorBody, ENGINE_MESSAGES } from '../errors'
import type { MockEngineResponse } from './types'

/** Réponse 501 des zones du moteur simulé pas encore écrites. */
export function mockNotImplemented(area: string): MockEngineResponse {
  return { status: 501, json: engineErrorBody('not_implemented', ENGINE_MESSAGES.mockNotImplemented(area)) }
}
