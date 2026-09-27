import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk'
import path from 'node:path'

/**
 * Accès à Claude et réglages de l'agent, lus dans l'environnement du moteur (`engine/.env.local`, noms seulement).
 * Porté de `batterie-tests:cms/src/editor/config.ts` (resolveClaudeAccess + réglages de l'agent).
 */

/** Identifiant transmis au processus Claude Code : UN SEUL, jamais les deux. */
export type ClaudeCredential = { kind: 'api-key'; secret: string } | { kind: 'subscription'; secret: string }

export type AccessResult = { ok: true; access: ClaudeCredential; warning?: string } | { ok: false; error: string }

export type AccessEnv = {
  ANTHROPIC_API_KEY?: string
  CLAUDE_CODE_OAUTH_TOKEN?: string
  NODE_ENV?: string
}

export type AccessOptions = {
  /**
   * Mode local EXPLICITE du moteur (moteur sur la machine du développeur, 127.0.0.1). Seul cas, avec
   * NODE_ENV=development, où le jeton d'abonnement est accepté. `npm run engine` (tsx) ne pose pas NODE_ENV : sans ce
   * drapeau, un moteur local refuserait l'abonnement. engine-core ne le passe à `true` que sur une configuration
   * explicite (jamais par défaut, jamais en mode hébergé).
   */
  localMode?: boolean
}

// Un identifiant ne contient jamais de blanc : un jeton collé sur deux lignes (piège du POC) ou entouré d'espaces est
// recollé. Les jetons d'abonnement font aujourd'hui 108 caractères : plus court, il a sans doute été coupé.
const clean = (value: string | undefined) => (value ?? '').replace(/\s+/g, '')
const OAUTH_PREFIX = 'sk-ant-oat'
const OAUTH_MIN_LENGTH = 100

/**
 * La clé API passe en premier : c'est la seule voie autorisée dès que des clients utilisent l'éditeur.
 * Le jeton d'abonnement Pro/Max (`claude setup-token`) est réservé au développement : NODE_ENV=development, ou mode
 * local explicite du moteur. Un jeton d'abonnement collé dans ANTHROPIC_API_KEY est refusé (l'API le rejetterait sans
 * explication). Messages en anglais : ils peuvent remonter jusqu'à l'admin.
 */
export function resolveClaudeAccess(env: AccessEnv, options: AccessOptions = {}): AccessResult {
  const apiKey = clean(env.ANTHROPIC_API_KEY)
  const oauthToken = clean(env.CLAUDE_CODE_OAUTH_TOKEN)
  if (apiKey.startsWith(OAUTH_PREFIX)) {
    return {
      ok: false,
      error:
        'ANTHROPIC_API_KEY contains a subscription token (sk-ant-oat…), not an API key: move it to ' +
        'CLAUDE_CODE_OAUTH_TOKEN and leave ANTHROPIC_API_KEY empty.',
    }
  }
  if (apiKey) return { ok: true, access: { kind: 'api-key', secret: apiKey } }
  if (oauthToken) {
    const allowed = env.NODE_ENV === 'development' || options.localMode === true
    if (!allowed) {
      return {
        ok: false,
        error:
          'The subscription token (CLAUDE_CODE_OAUTH_TOKEN) is only accepted for local development. ' +
          'Set ANTHROPIC_API_KEY in engine/.env.local for any other use.',
      }
    }
    const truncated = oauthToken.startsWith(OAUTH_PREFIX) && oauthToken.length < OAUTH_MIN_LENGTH
    return {
      ok: true,
      access: { kind: 'subscription', secret: oauthToken },
      ...(truncated
        ? { warning: '`claude setup-token` prints the token on two lines: copy both (the token looks truncated).' }
        : {}),
    }
  }
  return {
    ok: false,
    error:
      'No Claude access is configured in engine/.env.local: set ANTHROPIC_API_KEY (required for clients), or for a ' +
      'local test paste the output of `claude setup-token` (both lines) into CLAUDE_CODE_OAUTH_TOKEN. Then restart the engine.',
  }
}

/** Valeur de `Usage.access` (contrat) pour un identifiant. */
export const accessKind = (access: ClaudeCredential | null) => (access ? access.kind : 'none')

// ─── Réglages de l'agent ─────────────────────────────────────────────────────

export type AgentSettings = {
  model: string
  effort: EffortLevel
  /** Plafond de tours PAR APPEL de query() (le 2e essai en a autant). */
  maxTurns: number
  /** Plafond du SDK PAR APPEL de query() : une demande à 2 essais peut coûter jusqu'à 2 × ce montant. */
  maxBudgetUsd: number
  /** Délai de Claude par appel, hors temps d'attente d'une réponse du client. */
  timeoutMs: number
  /** Délai laissé au client pour répondre à une question (15 min par défaut). */
  questionTimeoutMs: number
  /** Durée maximale d'un appel d'outil MCP : couvre l'attente d'une réponse du client (question + 60 s). */
  toolTimeoutMs: number
  /** CLAUDE_CONFIG_DIR dédié, absolu (jamais ~/.claude de la machine). */
  configDir: string
}

const EFFORTS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

const positive = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return value !== undefined && value.trim() !== '' && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export type SettingsEnv = {
  EDITOR_MODEL?: string
  EDITOR_EFFORT?: string
  EDITOR_MAX_TURNS?: string
  EDITOR_MAX_BUDGET_USD?: string
  EDITOR_TIMEOUT_MS?: string
  EDITOR_QUESTION_TIMEOUT_MS?: string
}

/**
 * Réglages de l'agent d'après l'environnement. `configDir` doit être un chemin ABSOLU et non vide (piège 5 du POC :
 * un chemin vide résolu en relatif désignait le dossier du moteur) : sinon, exception au démarrage.
 */
export function readAgentSettings(env: SettingsEnv, paths: { configDir: string }): AgentSettings {
  if (!paths.configDir || !path.isAbsolute(paths.configDir)) {
    throw new Error(`CLAUDE_CONFIG_DIR must be an absolute path (got ${JSON.stringify(paths.configDir)}).`)
  }
  const effort = (EFFORTS as readonly string[]).includes(env.EDITOR_EFFORT ?? '') ? (env.EDITOR_EFFORT as EffortLevel) : 'medium'
  const questionTimeoutMs = positive(env.EDITOR_QUESTION_TIMEOUT_MS, 15 * 60_000)
  return {
    model: env.EDITOR_MODEL?.trim() || 'claude-opus-5-5',
    effort,
    maxTurns: Math.floor(positive(env.EDITOR_MAX_TURNS, 24)),
    maxBudgetUsd: positive(env.EDITOR_MAX_BUDGET_USD, 1.5),
    timeoutMs: positive(env.EDITOR_TIMEOUT_MS, 300_000),
    questionTimeoutMs,
    toolTimeoutMs: questionTimeoutMs + 60_000,
    configDir: path.normalize(paths.configDir),
  }
}
