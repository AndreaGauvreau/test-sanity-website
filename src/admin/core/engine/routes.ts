import type { Capability } from '../contracts/roles'

/**
 * LISTE BLANCHE des routes du moteur que l'admin relaie (`/admin/api/engine/[...path]`), d'après
 * core/contracts/engine.ts. Toute route absente d'ici répond 404 au navigateur sans jamais atteindre le moteur.
 * Pur : partagé par le relais, le client serveur et les tests.
 *
 * Ajouter une route : l'ajouter au contrat engine.ts (orchestrateur), puis ici avec son droit, puis au client.
 */

export type EngineMethod = 'GET' | 'POST'

export type EngineRouteDef = {
  method: EngineMethod
  /** Segments ; `:nom` = paramètre (validé par PARAM_PATTERNS, sinon SEGMENT_PATTERN). */
  pattern: readonly string[]
  /** Droit exigé (null = toute session). Le moteur revérifie d'après le rôle signé. */
  capability: Capability | null
  /** json (défaut) ou image (captures before/after). */
  kind?: 'json' | 'image'
  /** Paramètres de requête relayés (les autres sont supprimés). */
  query?: readonly string[]
  timeoutMs?: number
}

export const SEGMENT_PATTERN = /^[\w.-]+$/

const PARAM_PATTERNS: Record<string, RegExp> = {
  file: /^\d{3,4}-(before|after)\.png$/,
  number: /^\d{1,6}$/,
}

export const ENGINE_ROUTES: readonly EngineRouteDef[] = [
  { method: 'GET', pattern: ['health'], capability: null },
  // Éditeur IA (D1-D3, G1, G2)
  { method: 'GET', pattern: ['editor', 'state'], capability: 'ai.editor', query: ['page'] },
  { method: 'POST', pattern: ['editor', 'requests'], capability: 'ai.editor' },
  { method: 'GET', pattern: ['editor', 'jobs', ':id'], capability: 'ai.editor' },
  { method: 'POST', pattern: ['editor', 'jobs', ':id', 'answer'], capability: 'ai.editor' },
  { method: 'POST', pattern: ['editor', 'jobs', ':id', 'stop'], capability: 'ai.editor' },
  { method: 'POST', pattern: ['editor', 'changes', ':id', 'validate'], capability: 'ai.editor' },
  { method: 'POST', pattern: ['editor', 'changes', ':id', 'cancel'], capability: 'ai.editor' },
  { method: 'GET', pattern: ['editor', 'jobs', ':id', 'shots', ':file'], capability: 'ai.editor', kind: 'image' },
  // Publication (E1, G3) — l'état est partagé entre utilisateurs (Top bar)
  { method: 'GET', pattern: ['publish', 'status'], capability: 'publish.run' },
  { method: 'POST', pattern: ['publish'], capability: 'publish.run', timeoutMs: 30_000 },
  { method: 'POST', pattern: ['publish', 'retry'], capability: 'publish.run', timeoutMs: 30_000 },
  { method: 'POST', pattern: ['publish', 'discard'], capability: 'publish.run' },
  // Dépublier / supprimer au prochain Publish (FOLLOWUPS #27) : même droit que discard.
  { method: 'POST', pattern: ['publish', 'stage'], capability: 'publish.run' },
  { method: 'POST', pattern: ['publish', 'unstage'], capability: 'publish.run' },
  { method: 'GET', pattern: ['publish', 'diff', ':id'], capability: 'publish.diff' },
  // Versions (E2)
  { method: 'GET', pattern: ['versions'], capability: 'publish.run' },
  { method: 'POST', pattern: ['versions', ':number', 'rollback'], capability: 'versions.rollback', timeoutMs: 30_000 },
  // Ask AI (G4)
  { method: 'POST', pattern: ['ask'], capability: 'ai.ask', timeoutMs: 60_000 },
  // Connexion à Claude (B5 · carte « Claude connection ») : Kuartz et client. Le test d'un abonnement lance un tour
  // minimal de Claude Code (jusqu'à ≈ 60 s).
  { method: 'GET', pattern: ['claude', 'access'], capability: 'ai.access' },
  { method: 'POST', pattern: ['claude', 'access'], capability: 'ai.access' },
  { method: 'POST', pattern: ['claude', 'access', 'test'], capability: 'ai.access', timeoutMs: 75_000 },
  { method: 'POST', pattern: ['claude', 'access', 'clear'], capability: 'ai.access' },
  // Réglages de l'IA (B5 · carte « AI settings ») : modèle et niveau de réflexion de l'éditeur. Kuartz et client.
  { method: 'GET', pattern: ['claude', 'settings'], capability: 'ai.access' },
  { method: 'POST', pattern: ['claude', 'settings'], capability: 'ai.access' },
]

export const DEFAULT_ENGINE_TIMEOUT_MS = 15_000
/** Corps JSON maximal relayé vers le moteur. */
export const MAX_ENGINE_BODY_BYTES = 64 * 1024

export type EngineRouteMatch = { route: EngineRouteDef; params: Record<string, string> }

export function isSafeSegment(segment: string): boolean {
  return segment.length > 0 && segment.length <= 128 && SEGMENT_PATTERN.test(segment) && segment !== '.' && segment !== '..'
}

/** Route de la liste blanche correspondant à (méthode, segments), ou null. */
export function matchEngineRoute(method: string, segments: readonly string[]): EngineRouteMatch | null {
  if (!segments.every(isSafeSegment)) return null
  for (const route of ENGINE_ROUTES) {
    if (route.method !== method || route.pattern.length !== segments.length) continue
    const params: Record<string, string> = {}
    let ok = true
    for (let i = 0; i < segments.length && ok; i++) {
      const part = route.pattern[i]
      const seg = segments[i]
      if (part.startsWith(':')) {
        const name = part.slice(1)
        const re = PARAM_PATTERNS[name]
        if (re && !re.test(seg)) ok = false
        else params[name] = seg
      } else if (part !== seg) {
        ok = false
      }
    }
    if (ok) return { route, params }
  }
  return null
}

/**
 * Demande qui n'a de sens que depuis un admin ouvert sur CETTE machine : « Use my Claude subscription » (abonnement
 * Claude connecté sur la machine du moteur). Le relais la refuse (403) si l'hôte de la requête n'est pas
 * 127.0.0.1 / localhost ; le moteur, lui, la refuse hors ENGINE_MODE=local écrit. `body` : JSON brut relayé.
 */
export function requiresLocalAdmin(method: string, segments: readonly string[], body: string | undefined): boolean {
  if (method !== 'POST' || segments.length !== 2 || segments[0] !== 'claude' || segments[1] !== 'access') return false
  try {
    const parsed = JSON.parse(body ?? '') as unknown
    return typeof parsed === 'object' && parsed !== null && (parsed as { kind?: unknown }).kind === 'subscription'
  } catch {
    return false
  }
}

/** Garde seulement les paramètres de requête permis par la route (valeurs bornées). */
export function filterEngineQuery(route: EngineRouteDef, search: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams()
  for (const key of route.query ?? []) {
    const value = search.get(key)
    if (value !== null && value.length <= 512) out.set(key, value)
  }
  return out
}
