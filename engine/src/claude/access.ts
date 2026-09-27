import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk'
import path from 'node:path'

/**
 * Accès à Claude et réglages de l'agent, lus dans l'environnement du moteur (`engine/.env.local`, noms seulement).
 * Porté de `batterie-tests:cms/src/editor/config.ts` (resolveClaudeAccess + réglages de l'agent).
 */

/**
 * Identifiant transmis au processus Claude Code : UN SEUL, jamais les deux.
 * - `api-key` : clé API Anthropic (ANTHROPIC_API_KEY de l'environnement ou clé enregistrée depuis l'admin) ;
 * - `subscription` + `secret` : jeton `claude setup-token` (CLAUDE_CODE_OAUTH_TOKEN, repli local) ;
 * - `subscription` + `secret: null` + `machineLogin` : connexion Claude Code DE LA MACHINE (moteur local seulement).
 *   Aucun secret ne passe par le moteur : le sous-processus lit lui-même le trousseau macOS (service
 *   « Claude Code-credentials », compte $USER) ou `~/.claude/.credentials.json` (Linux), grâce à
 *   CLAUDE_SECURESTORAGE_CONFIG_DIR ; CLAUDE_CONFIG_DIR reste le dossier dédié du moteur (voir `credentialEnv`).
 */
export type ClaudeCredential =
  | { kind: 'api-key'; secret: string }
  | { kind: 'subscription'; secret: string }
  | { kind: 'subscription'; secret: null; machineLogin: MachineLogin }

/**
 * Où Claude Code range la connexion de la machine. `storageDir` = valeur de CLAUDE_SECURESTORAGE_CONFIG_DIR passée au
 * sous-processus : '' = emplacement par défaut (trousseau « Claude Code-credentials », `~/.claude`), c'est-à-dire celui
 * de `claude` lancé dans un terminal sans CLAUDE_CONFIG_DIR ; sinon le CLAUDE_CONFIG_DIR de l'utilisatrice.
 */
export type MachineLogin = { storageDir: string }

export type AccessResult = { ok: true; access: ClaudeCredential; warning?: string } | { ok: false; error: string }

export type AccessEnv = {
  ANTHROPIC_API_KEY?: string
  CLAUDE_CODE_OAUTH_TOKEN?: string
  /**
   * Mode du moteur tel qu'écrit dans l'environnement : « hosted » refuse TOUJOURS l'abonnement, même si l'appelant
   * passait `localMode: true` par erreur. NODE_ENV n'est jamais lu (AI-02 : hérité du shell, il ne dit rien du mode).
   */
  ENGINE_MODE?: string
}

export type AccessOptions = {
  /**
   * Mode local EXPLICITE du moteur (ENGINE_MODE=local écrit, moteur sur la machine du développeur) : SEUL cas où le jeton
   * d'abonnement est accepté. engine-core le passe (`config.mode === 'local' && config.explicitLocal`) ; jamais par
   * défaut, jamais en mode hébergé.
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
 * Le jeton d'abonnement Pro/Max (`claude setup-token`) est réservé au moteur local : `localMode: true` ET ENGINE_MODE
 * absent ou « local ». NODE_ENV n'entre jamais en compte (AI-02). Un jeton d'abonnement collé dans ANTHROPIC_API_KEY est refusé (l'API le rejetterait sans
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
    const mode = env.ENGINE_MODE?.trim()
    const allowed = options.localMode === true && (mode === undefined || mode === '' || mode === 'local')
    if (!allowed) {
      return {
        ok: false,
        error:
          'The subscription token (CLAUDE_CODE_OAUTH_TOKEN) is only accepted by a local engine (ENGINE_MODE=local). ' +
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

/**
 * Variables d'environnement de l'identifiant pour le sous-processus Claude Code (le reste de l'env minimal est ajouté
 * par l'appelant : PATH, HOME, CLAUDE_CONFIG_DIR dédié…). Connexion de la machine (vérifié dans le binaire Claude Code
 * 2.1.283 de l'Agent SDK 0.3.283) : le nom du service du trousseau est « Claude Code-credentials » suivi d'un suffixe
 * `-<sha256(dossier)[0..8]>` dès que CLAUDE_CONFIG_DIR est posé ; CLAUDE_SECURESTORAGE_CONFIG_DIR (même vide) décide
 * seul de ce suffixe et du dossier de `.credentials.json`. Vide = emplacement par défaut de la machine, sans toucher au
 * CLAUDE_CONFIG_DIR dédié (réglages, sessions, CLAUDE.md : jamais ceux de ~/.claude). Le compte du trousseau est $USER.
 */
export function credentialEnv(
  access: ClaudeCredential,
  base: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string | undefined> {
  if (access.kind === 'api-key') return { ANTHROPIC_API_KEY: access.secret }
  if (access.secret !== null) return { CLAUDE_CODE_OAUTH_TOKEN: access.secret }
  return { ...(base.USER ? { USER: base.USER } : {}), CLAUDE_SECURESTORAGE_CONFIG_DIR: access.machineLogin.storageDir }
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
