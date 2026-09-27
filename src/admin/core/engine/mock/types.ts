import type { EngineUser } from '../../contracts/session'
import type { EngineMethod } from '../routes'

/**
 * Forme commune des gestionnaires du moteur SIMULÉ (ENGINE_MOCK=1). Chaque fichier de mock/ exporte un MockHandler.
 * La requête est déjà passée par la liste blanche (routes.ts) et le contrôle des droits : le gestionnaire reçoit des
 * segments et paramètres validés, le corps JSON parsé et l'identité (comme le vrai moteur après vérification HMAC).
 */
export type MockEngineRequest = {
  method: EngineMethod
  segments: readonly string[]
  params: Readonly<Record<string, string>>
  query: URLSearchParams
  body: unknown
  user: EngineUser
}

export type MockEngineResponse =
  | { status: number; json: unknown }
  | { status: number; binary: Uint8Array; contentType: string }

export type MockHandler = (request: MockEngineRequest) => MockEngineResponse | Promise<MockEngineResponse>
