import type { AdminRole } from './roles'
import type { EngineUser } from './session'

/**
 * API HTTP du moteur IA (`engine/`, processus Node persistant, 127.0.0.1:4043).
 *
 * Le moteur est le SEUL endroit qui détient l'accès à Claude, le jeton d'écriture Sanity « robot » et le dépôt git
 * de travail. L'admin (Next) ne l'appelle que côté serveur, par le relais `/admin/api/engine/[...path]`.
 *
 * Transport :
 * - `Authorization: Bearer <ENGINE_SECRET>` ;
 * - `X-Kz-User: base64url(JSON.stringify({ ...EngineUser, iat, exp }))` (secondes Unix, exp − iat ≤ 120 s) +
 *   `X-Kz-User-Sig: base64url(Ed25519(X-Kz-User))` signé avec ENGINE_IDENTITY_PRIVATE_KEY (admin seulement, PKCS#8
 *   base64) et vérifié par le moteur avec ENGINE_IDENTITY_PUBLIC_KEY (SPKI base64). Clé d'identité DISTINCTE du
 *   Bearer (constat SEC-10) : qui vole ENGINE_SECRET ne peut pas forger un rôle. Identité expirée, future
 *   (iat > maintenant + 30 s) ou mal signée → 401. Le rôle décide des droits (voir roles.ts) ;
 * - corps et réponses en JSON ; erreur = statut HTTP + `EngineErrorBody`.
 *
 * Les messages destinés au client (`message`, `error`, `label`…) sont en ANGLAIS : l'admin est en anglais.
 *
 * CONTRAT PARTAGÉ — propriétaire : l'orchestrateur. Implémenté par engine-core / engine-publish / engine-claude /
 * ask-ai ; consommé par editor-sidebar, editor-canvas, publish-ui, shell, ask-ai.
 */

export const ENGINE_HEADER_USER = 'x-kz-user'
export const ENGINE_HEADER_USER_SIG = 'x-kz-user-sig'

export type EngineErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'bad_request'
  /** Claude travaille déjà (une demande à la fois, tous utilisateurs confondus). */
  | 'busy'
  /** Une modification attend ✓ Validate ou Cancel. */
  | 'awaiting_validation'
  /** Une publication est en cours. */
  | 'publishing'
  | 'not_found'
  /** L'état a changé entre-temps (brouillon modifié, liste à publier différente, divergence git…). */
  | 'conflict'
  /** Accès Claude, jeton d'écriture Sanity ou aperçu indisponible. */
  | 'unavailable'
  /** Fonction absente en mode local (ex. retour arrière Vercel). */
  | 'not_implemented'
  | 'internal'

export type EngineErrorBody = { error: { code: EngineErrorCode; message: string } }

// ─── Consommation ────────────────────────────────────────────────────────────

export type ClaudeAccess = 'api-key' | 'subscription' | 'none'

export type Usage = {
  /** Id du modèle (« claude-opus-5-5 »). */
  model: string
  /** Total des jetons d'entrée traités : non cachés + lus en cache + écrits en cache. Affiché « 18.2k input ». */
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** Coût au prix de l'API (dollars), que la demande soit facturée ou non (voir `access`). */
  costUsd: number
  /**
   * billed : coût rapporté par l'API ; estimated : calculé d'après les jetons vus (appel interrompu) ;
   * Avec l'abonnement (développement), le coût reste calculé mais n'est pas facturé : voir `access`.
   */
  costKind: 'billed' | 'estimated'
  /**
   * Accès à Claude utilisé par la demande (figé à son départ). `subscription` (moteur local) : coût NON facturé,
   * « inclus » dans l'abonnement — l'admin ne l'ajoute jamais au coût facturé (`costSplit`, format.ts). Tout autre
   * valeur, ou un ancien document sans ce champ : facturé.
   */
  access: ClaudeAccess
  durationMs: number
  turns?: number
}

// ─── Santé ───────────────────────────────────────────────────────────────────

export type EngineHealth = {
  ok: boolean
  version: string
  /** local : dépôt de travail sur cette machine, pas de push ni de déploiement automatique sans configuration. */
  mode: 'local' | 'hosted'
  claude: { access: ClaudeAccess; editorModel: string; askModel: string }
  sanityWrite: boolean
  preview: { url: string; ready: boolean }
  git: { branch: string; clean: boolean; aheadOfMain: number }
  /** Avertissements de configuration (anglais), ex. faux Claude actif, jeton d'écriture absent. */
  warnings?: string[]
  /** Scénario du faux Claude actif (ENGINE_FAKE_CLAUDE, mode local seulement) : jamais en production. */
  fakeClaude?: string
}

// ─── Connexion à Claude (B5 · carte « Claude connection ») ───────────────────

/**
 * D'où vient l'accès utilisé par le moteur :
 * - env : variable de `engine/.env.local` (ANTHROPIC_API_KEY, toujours prioritaire ; ou CLAUDE_CODE_OAUTH_TOKEN en repli local) ;
 * - stored : clé API enregistrée depuis l'admin (chiffrée par le moteur) ;
 * - machine : abonnement Claude connecté sur la machine du moteur (connexion Claude Code, moteur local seulement) ;
 * - none : aucun accès utilisable.
 */
export type ClaudeAccessSource = 'env' | 'stored' | 'machine' | 'none'

/** Dernier test de connexion (« Test connection ») : date ISO, résultat, message anglais lisible. */
export type ClaudeAccessTest = { at: string; ok: boolean; message: string }

export type ClaudeAccessState = {
  mode: 'local' | 'hosted'
  /**
   * Abonnement de la machine permis par le MOTEUR (ENGINE_MODE=local écrit). L'admin exige en plus d'être ouvert sur
   * 127.0.0.1 / localhost pour le proposer (et le relais refuse sinon).
   */
  subscriptionAllowed: boolean
  /** Accès effectivement utilisé par l'éditeur et Ask AI. */
  access: ClaudeAccess
  source: ClaudeAccessSource
  /** Clé API en cours (env ou enregistrée) : « sk-ant-…XXXX » (4 derniers caractères), jamais plus. */
  keyHint?: string
  /** Ce qui est enregistré depuis l'admin (peut être masqué par ANTHROPIC_API_KEY de l'environnement). */
  saved: 'api-key' | 'subscription' | null
  /** ANTHROPIC_API_KEY présente dans l'environnement du moteur : elle l'emporte sur ce qui est enregistré. */
  envApiKey: boolean
  /** Connexion Claude Code de la machine du moteur (présente seulement si l'abonnement est permis). */
  machine?: { loggedIn: boolean }
  lastTest?: ClaudeAccessTest
  /** Pourquoi l'accès n'est pas utilisable, ou avertissement (anglais, sans secret). */
  problem?: string
}

export type ClaudeAccessInput = { kind: 'api-key'; apiKey: string } | { kind: 'subscription' }

// Routes (droit `ai.access`, revérifié par le moteur) :
//   GET  /claude/access                          → ClaudeAccessState
//   POST /claude/access       ClaudeAccessInput  → ClaudeAccessState · 400 bad_request (clé refusée, sk-ant-oat…) ·
//                                                  403 forbidden (abonnement hors moteur local / admin hors localhost)
//   POST /claude/access/test                     → ClaudeAccessState (lastTest rempli ; clé API : GET /v1/models, sans
//                                                  coût ; abonnement : un tour minimal via l'Agent SDK, modèle Haiku)
//   POST /claude/access/clear                    → ClaudeAccessState (ce qui était enregistré est effacé)
// La clé ne revient JAMAIS dans une réponse : seulement `keyHint`.

/** Longueurs admises pour une clé API Anthropic (les clés actuelles font ≈ 108 caractères). */
export const CLAUDE_API_KEY_MIN = 40
export const CLAUDE_API_KEY_MAX = 300

/** Clé collée → clé propre (blancs et retours à la ligne retirés : copie sur deux lignes). */
export const cleanClaudeApiKey = (raw: string) => raw.replace(/\s+/g, '')

/**
 * Problème d'une clé API collée (anglais, sans jamais citer la clé), ou null si elle a la forme d'une clé API
 * Anthropic (`sk-ant-api…`). Un jeton d'abonnement `sk-ant-oat…` est refusé avec un message dédié.
 */
export function claudeApiKeyProblem(raw: string): string | null {
  const key = cleanClaudeApiKey(raw)
  if (!key) return 'Paste your Anthropic API key.'
  if (key.startsWith('sk-ant-oat')) {
    return 'This is a Claude subscription token (sk-ant-oat…), not an API key. Create an API key in the Claude Console (Settings › API keys).'
  }
  if (!key.startsWith('sk-ant-api')) return 'An Anthropic API key starts with sk-ant-api…'
  if (key.length < CLAUDE_API_KEY_MIN || key.length > CLAUDE_API_KEY_MAX || !/^sk-ant-api\d{2}-[A-Za-z0-9_-]+$/.test(key)) {
    return 'This doesn’t look like a complete Anthropic API key. Copy it again from the Claude Console.'
  }
  return null
}

/** « sk-ant-…XXXX » : les 4 derniers caractères seulement. */
export const claudeKeyHint = (key: string) => `sk-ant-…${cleanClaudeApiKey(key).slice(-4)}`

// ─── Réglages de l'IA (B5 · carte « AI settings ») ───────────────────────────

/**
 * Modèles proposés pour l'ÉDITEUR IA (Ask AI reste sur ASK_MODEL, Haiku : non concerné). Tarifs :
 * `PRICES_PER_MTOK` de `pricing.ts` (source unique, lue aussi par le moteur).
 */
export type AiModelId = 'claude-opus-5-5' | 'claude-fable-5-1' | 'claude-sonnet-5'

/**
 * Niveau de réflexion (« effort ») : exactement `EffortLevel` de @anthropic-ai/claude-agent-sdk 0.3.283 (sdk.d.ts).
 * D'après le SDK et le skill `claude-api` (2026-09-28), les trois modèles de la liste acceptent les cinq niveaux ; un
 * niveau non pris en charge par un modèle serait ramené en silence par Claude Code au plus proche.
 */
export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Liste ordonnée des modèles de l'écran (libellés identiques à `modelLabel` de format.ts). */
export const AI_MODELS: readonly { id: AiModelId; label: string }[] = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
]

/** Liste ordonnée des niveaux, du plus rapide au plus poussé, avec leur libellé lisible (anglais). */
export const AI_EFFORTS: readonly { id: AiEffort; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
]

/** Réglages choisis depuis l'admin (corps de POST /claude/settings). */
export type AiSettings = { model: AiModelId; effort: AiEffort }

/** Valeurs par défaut quand ni l'environnement du moteur (EDITOR_MODEL / EDITOR_EFFORT) ni l'admin n'en donnent. */
export const DEFAULT_AI_SETTINGS: AiSettings = { model: 'claude-opus-5-5', effort: 'medium' }

/**
 * Réglages effectivement appliqués. `model` reste une chaîne : EDITOR_MODEL de l'environnement du moteur peut désigner
 * un modèle hors de la liste (ex. « claude-opus-5 »), gardé tel quel comme valeur par défaut.
 */
export type AiSettingsInEffect = { model: string; effort: AiEffort }

export type AiSettingsState = {
  /** Réglages que prendra la PROCHAINE demande de l'éditeur (une demande en cours garde les siens). */
  current: AiSettingsInEffect
  /** Valeurs par défaut du moteur : EDITOR_MODEL / EDITOR_EFFORT, sinon `DEFAULT_AI_SETTINGS`. */
  defaults: AiSettingsInEffect
  /** default : rien d'enregistré, les valeurs par défaut s'appliquent ; saved : choisi depuis l'admin. */
  source: 'default' | 'saved'
  /** Date ISO du dernier enregistrement (source = saved). */
  updatedAt?: string
  /** Modèle d'Ask AI (ASK_MODEL du moteur), NON concerné par ces réglages. */
  askModel: string
}

// Routes (droit `ai.access`, revérifié par le moteur) :
//   GET  /claude/settings                 → AiSettingsState
//   POST /claude/settings  AiSettings     → AiSettingsState · 400 bad_request (`aiSettingsProblem`)
// Prise en compte à chaud : chaque NOUVELLE demande de l'éditeur lit les réglages en cours à son départ.

export const isAiModelId = (value: unknown): value is AiModelId => AI_MODELS.some((model) => model.id === value)
export const isAiEffort = (value: unknown): value is AiEffort => AI_EFFORTS.some((effort) => effort.id === value)

/**
 * Validation STRICTE d'un corps `AiSettings` (anglais, sans jamais citer l'entrée), ou null s'il est valide :
 * un objet avec exactement `model` (de la liste) et `effort` (des cinq niveaux), rien d'autre.
 * Partagée par le moteur et le moteur simulé.
 */
export function aiSettingsProblem(input: unknown): string | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return 'Send a model and a thinking effort.'
  const body = input as Record<string, unknown>
  if (Object.keys(body).some((key) => key !== 'model' && key !== 'effort')) return 'Only the model and the thinking effort can be set.'
  if (!isAiModelId(body.model)) return `Choose one of these models: ${AI_MODELS.map((model) => model.label).join(', ')}.`
  if (!isAiEffort(body.effort)) return `Choose a thinking effort: ${AI_EFFORTS.map((effort) => effort.id).join(', ')}.`
  return null
}

// ─── Éditeur IA (D1-D3, G1, G2) ──────────────────────────────────────────────

export type Scope = 'style' | 'text'

/**
 * Formats de l'aperçu de l'éditeur IA (barre d'outils Desktop / Tablet / Mobile) : largeur CSS de l'iframe, en px.
 * SOURCE UNIQUE : la barre d'outils (canvas), la validation des demandes (moteur et moteur simulé), les largeurs
 * mesurées et capturées par les garde-fous et les textes pour Claude (prompt, outil measure, journal, contrôles) en
 * dérivent ; `src/editor/RULES.md` les recopie (vérifié par `engine/src/claude/rules.test.ts`).
 * Tablet = point de rupture tablette du SITE (`breakpoint-tablet` de `src/styles/tokens.json`, 50.625rem = 810 px pour
 * Conduit), et non le 768 du Figma D1 : à 768 px, Conduit est encore en mise en page mobile. Mobile reste sous ce point
 * de rupture, Desktop au-delà de `breakpoint-desktop` (64rem = 1024 px). Vérifié par `viewports.test.ts` : un site qui
 * change ses points de rupture le fait échouer.
 */
export const EDITOR_VIEWPORTS = Object.freeze({ desktop: 1280, tablet: 810, mobile: 375 } as const)

/** Nom d'un format de l'aperçu : 'desktop' | 'tablet' | 'mobile'. */
export type ViewportName = keyof typeof EDITOR_VIEWPORTS

/** Largeur d'un format de l'aperçu (Desktop / Tablet / Mobile de la barre d'outils) : 1280 | 810 | 375. */
export type Viewport = (typeof EDITOR_VIEWPORTS)[ViewportName]

/** Les formats dans l'ordre de la barre d'outils : Desktop, Tablet, Mobile. */
export const VIEWPORT_NAMES: readonly ViewportName[] = Object.freeze(Object.keys(EDITOR_VIEWPORTS) as ViewportName[])

/** Leurs largeurs, dans le même ordre (1280, 810, 375) : les seules valeurs acceptées dans une nouvelle demande. */
export const VIEWPORT_WIDTHS: readonly Viewport[] = Object.freeze(VIEWPORT_NAMES.map((name) => EDITOR_VIEWPORTS[name]))

/** Les mêmes largeurs, croissantes (375, 810, 1280) : celles que mesurent et capturent les garde-fous du moteur. */
export const MEASURED_VIEWPORTS: readonly Viewport[] = Object.freeze([...VIEWPORT_WIDTHS].sort((a, b) => a - b))

/** « 375, 810 and 1280 » : les largeurs mesurées, dans les textes anglais (prompt, outil measure, journal, contrôles). */
export const MEASURED_VIEWPORTS_TEXT = `${MEASURED_VIEWPORTS.slice(0, -1).join(', ')} and ${MEASURED_VIEWPORTS.at(-1)}`

/** Largeur d'un format actuel de l'aperçu. */
export function isViewport(value: unknown): value is Viewport {
  return typeof value === 'number' && (VIEWPORT_WIDTHS as readonly number[]).includes(value)
}

/**
 * Format à afficher pour une largeur RELUE (état de l'éditeur, demande enregistrée, fil) : un format actuel reste
 * lui-même ; la largeur d'une version précédente prend le format le plus proche (768, le Tablet d'avant le 2026-09-28,
 * → Tablet) ; toute autre valeur → Desktop, le format par défaut. Ne sert qu'à relire : une NOUVELLE demande n'est
 * acceptée qu'avec une largeur de `VIEWPORT_WIDTHS` (moteur et moteur simulé).
 */
export function viewportOf(value: unknown): Viewport {
  if (isViewport(value)) return value
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return EDITOR_VIEWPORTS.desktop
  return VIEWPORT_WIDTHS.reduce((best, width) => (Math.abs(width - value) < Math.abs(best - value) ? width : best))
}

/** Élément choisi dans l'aperçu (mode Select). */
export type ElementTarget = {
  zone: string
  /** Rang de l'occurrence pour une zone répétée (0 sinon). */
  index: number
  /** data-edit-doc : id publié du document (éléments de collection). */
  doc?: string
  /** data-edit-key : _key de l'élément de tableau Sanity. */
  key?: string
  /** « Hero · Title » */
  label: string
}

export type EditRequest = {
  /** Chemin public de la page (« / »). */
  page: string
  /** 1 à 8 éléments ; la demande vaut pour tous (Maj + clic). */
  targets: ElementTarget[]
  /** Au moins un ; rien n'est coché par défaut dans l'interface. */
  scope: Scope[]
  /** 1 à 600 caractères. */
  note: string
  /**
   * Format de l'aperçu au moment de la demande (`VIEWPORT_WIDTHS`). Une demande enregistrée par une version précédente
   * peut porter 768 (ancien Tablet) : l'afficher avec `viewportOf`.
   */
  viewport: Viewport
  /** Ajustement de la modification en attente (D3 « Adjust this change… ») : son id. */
  changeId?: string
}

/**
 * done     : modification appliquée au brouillon, la PendingChange passe « to-validate » ;
 * rejected : Claude n'a rien modifié (déjà le cas, hors périmètre…), avec son message ;
 * failed   : erreur ou contrôles refusés au 2e essai → retour arrière complet, « Couldn't apply — nothing was changed. » ;
 * stopped  : Stop, ou question sans réponse 15 min → retour arrière complet, « Stopped — nothing was changed. ».
 */
export type JobStatus = 'queued' | 'running' | 'waiting' | 'done' | 'rejected' | 'failed' | 'stopped'

export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ['queued', 'running', 'waiting']

export type StepKind = 'read' | 'edit' | 'text' | 'measure' | 'ask' | 'check' | 'retry' | 'info' | 'warn' | 'error'

/** Étape du journal de Claude (« Reading Hero.module.css », « Title → Heading XL »). */
export type Step = { at: string; kind: StepKind; label: string; detail?: string }

export type QuestionTone = 'recommended' | 'neutral' | 'discouraged'

export type QuestionOption = {
  id: string
  label: string
  description?: string
  /** 🟢 recommended · ⚪ neutral · 🔴 discouraged (l'UI porte le ton par la couleur, sans émoji). */
  tone: QuestionTone
  /** Valeur en dur proposée (🔴 seulement), affichée « prop: value ». */
  hardcoded?: { property: string; value: string }
  /** Accord du client pour une ligne de plus à 375 px. */
  effect?: 'longer-text'
}

export type Question = { id: string; topic?: string; question: string; options: QuestionOption[] }

/** Une réponse par question : une option proposée, ou un texte libre (« Other answer… », 300 caractères au plus). */
export type Answer = { questionId: string; optionId?: string; other?: string }

export type CheckId =
  | 'scope'
  | 'tokens'
  | 'types'
  | 'render'
  | 'responsive'
  | 'isolation'
  | 'frame'
  | 'lines'
  | 'contrast'
  | 'unverifiable'
  | 'reach'
  | 'cover'

/** Contrôle automatique après modification (« Checks: contrast ✓ · mobile ✓ · tablet ✓ »). */
export type CheckResult = { id: CheckId; label: string; ok: boolean; warning?: boolean; detail?: string }

/** Ligne du résumé : « Title: size → Heading XL (token) », « “solved” in bold (Sanity draft) ». */
export type ChangeSummaryItem = { target: string; description: string; kind: Scope; where: 'code' | 'sanity-draft' }

export type TextChange = { document: string; path: string; before: string; after: string }

export type EditJob = {
  id: string
  changeId: string
  kind: 'request' | 'adjustment'
  request: EditRequest
  requestedBy: EngineUser
  createdAt: string
  startedAt?: string
  finishedAt?: string
  status: JobStatus
  steps: Step[]
  /** Présent quand status = waiting. */
  question?: { questions: Question[]; askedAt: string; expiresAt: string }
  answers?: Answer[]
  /** Message final de Claude au client, texte simple. */
  message?: string
  summary: ChangeSummaryItem[]
  checks: CheckResult[]
  texts: TextChange[]
  /** Valeurs en dur 🔴 accordées : signalées à Kuartz. */
  hardcoded: { property: string; value: string }[]
  usage?: Usage
  /** Message d'échec pour le client. */
  error?: string
  attempts: number
}

/**
 * Une modification en attente = une demande + ses ajustements. Une seule à la fois.
 * Validate : les commits de la modification sont réunis en UN commit sur `draft` (« un commit par modification validée »).
 * Cancel : retour arrière de la demande ET de ses ajustements (fichiers + brouillons Sanity).
 */
export type ChangeStatus = 'working' | 'to-validate' | 'validated' | 'cancelled' | 'published' | 'discarded'

export type PendingChange = {
  id: string
  page: string
  targets: ElementTarget[]
  status: ChangeStatus
  jobIds: string[]
  adjustments: number
  summary: ChangeSummaryItem[]
  checks: CheckResult[]
  commit?: string
  createdAt: string
  createdBy: EngineUser
  validatedAt?: string
  validatedBy?: EngineUser
  /** Cumul de la demande et de ses ajustements. */
  usage?: Usage
}

export type ThreadEntry =
  | { type: 'job'; job: EditJob }
  /** « Validated — added to Publish (3 changes) » */
  | { type: 'validated'; changeId: string; at: string; pendingTotal: number }
  | { type: 'cancelled'; changeId: string; at: string }

export type EditorState = {
  page: string
  health: EngineHealth
  /** URL de l'iframe d'aperçu (brouillon Sanity + code de `draft`, sans stega, pont actif) et son origine. */
  preview: { url: string; origin: string }
  /** Demande en file, en cours ou en attente de réponse (toutes pages confondues). */
  active: EditJob | null
  /** Modification en attente de validation (toutes pages confondues). */
  pending: PendingChange | null
  /** Fil de la page, du plus ancien au plus récent (50 derniers). Survit à un rechargement (G1 scénario 2). */
  thread: ThreadEntry[]
  /** Cumul affiché dans l'en-tête de la sidebar. */
  conversationUsage: Usage | null
  model: { id: string; label: string }
}

// Routes de l'éditeur :
//   GET  /editor/state?page=/                → EditorState
//   POST /editor/requests          EditRequest → EditJob (201) · 409 busy | awaiting_validation | publishing
//   GET  /editor/jobs/:id                     → EditJob   (l'interface interroge toutes les 900 ms pendant le travail)
//   POST /editor/jobs/:id/answer  { answers } → EditJob
//   POST /editor/jobs/:id/stop                → EditJob
//   POST /editor/changes/:id/validate         → PendingChange
//   POST /editor/changes/:id/cancel           → PendingChange
//   GET  /editor/jobs/:id/shots/:file         → image/png (nom ^\d{3,4}-(before|after)\.png$)

// ─── Publication (E1, E2, G3) ────────────────────────────────────────────────

export type PendingContentItem = {
  /** Id publié du document. */
  id: string
  type: string
  /** « Home › Hero · Title », « Blog › Carrier portals: a checklist » */
  path: string
  /** Nouvelle valeur (entre guillemets, déjà mis par le moteur), ou « Body and excerpt edited ». */
  summary: string
  /**
   * Ce que Publish fera de ce document : publier le brouillon (défaut), le dépublier ou le supprimer.
   * unpublish / delete sont demandés depuis le CMS (C3/C4) et ne s'appliquent qu'au prochain Publish.
   */
  action?: 'publish' | 'unpublish' | 'delete'
  author?: string
  updatedAt: string
  /** Chemin public où voir le brouillon. */
  viewPath?: string
}

export type PendingDesignItem = {
  changeId: string
  commit: string
  /** « Hero · Title — size → Heading XL » */
  title: string
  validatedBy: string
  validatedAt: string
  files: string[]
  /** Chemin public de la page modifiée (View ↗ → /admin/editor?page=…). */
  page?: string
}

export type PublishState = 'idle' | 'pending' | 'publishing' | 'published' | 'failed'

/** 1 contenu → Sanity · 2 draft → main (si du code a changé) · 3 build et déploiement · 4 en ligne. */
export type PublishStep = 1 | 2 | 3 | 4

export type PublishRun = {
  id: string
  startedAt: string
  startedBy: string
  step: PublishStep
  steps: { step: PublishStep; label: string; status: 'waiting' | 'running' | 'done' | 'skipped' | 'failed'; detail?: string }[]
  finishedAt?: string
  error?: { message: string; log?: string }
}

export type PublishStatus = {
  state: PublishState
  pending: {
    content: PendingContentItem[]
    design: PendingDesignItem[]
    /** N de « Unpublished changes: N » : brouillons de contenu + modifications IA validées. */
    total: number
    lastValidatedAt?: string
  }
  run?: PublishRun
  lastPublishedAt?: string
  deploy: { mode: 'vercel-hook' | 'local'; note?: string }
}

// Routes de publication :
//   GET  /publish/status                                  → PublishStatus (état partagé entre utilisateurs)
//   POST /publish          { expected: string[] }         → PublishStatus · 409 conflict si la liste a changé
//        expected = ce que l'utilisateur a sous les yeux : pour un contenu `<id>` ou `<id>@<updatedAt>`, pour un design
//        `<changeId>` ou `<changeId>@<commit ou préfixe ≥ 7>` ; la forme avec @ refuse aussi un élément modifié depuis.
//   POST /publish/retry                                   → PublishStatus
//   POST /publish/discard  { kind: 'content', id } | { kind: 'design', changeId } → PublishStatus
//   GET  /publish/diff/:changeId                          → { diff: string }   (Kuartz seulement)
//   POST /publish/stage    { kind: 'unpublish' | 'delete', id } → PublishStatus (programmé pour le prochain Publish)
//   POST /publish/unstage  { id }                         → PublishStatus

export type Publication = {
  number: number
  at: string
  by: string
  content: { id: string; path: string }[]
  design: { changeId: string; title: string; commit: string }[]
  commit?: string
  tag?: string
  deployUrl?: string
  status: 'live' | 'previous' | 'failed' | 'rolled-back'
  note?: string
}

// Routes des versions :
//   GET  /versions                 → { publications: Publication[]; rollback: { available: boolean; reason?: string } }
//   POST /versions/:number/rollback → Publication   (Kuartz seulement ; 501 not_implemented en mode local)

// ─── Ask AI (G4) ─────────────────────────────────────────────────────────────

export type AskMessage = { role: 'user' | 'assistant'; text: string }

export type AskRequest = {
  /** 1 à 1000 caractères. */
  question: string
  /** 10 derniers messages au plus. */
  history: AskMessage[]
  /** Route de l'admin ouverte (« /admin/media »), pour le contexte. */
  screen?: string
}

export type AskLink = { label: string; href: string }

export type AskResponse = {
  answer: string
  /** « Open Media ↗ », « Open Home in AI editor ↗ » : routes de l'admin uniquement. */
  links: AskLink[]
  /** Demande de modification refusée (« I can't change anything… »). */
  refusedChange: boolean
  usage: Usage
}

// Route : POST /ask  AskRequest → AskResponse

// ─── Journal de consommation (B5) ────────────────────────────────────────────

/**
 * Document Sanity PRIVÉ (id avec un point → illisible sans jeton, même en dataset public), écrit par le moteur
 * pour chaque demande IA terminée qui a VRAIMENT consommé (jamais pour le faux Claude `ENGINE_FAKE_CLAUDE`, ni sans
 * appel à Claude). Lu par B5, B1 et le pied de Ask AI ; `access` sépare le coût facturé de la part incluse dans
 * l'abonnement Claude (`costSplit`, format.ts).
 */
export type AiUsageDoc = {
  _id: `aiUsage.${string}`
  _type: 'aiUsage'
  feature: 'editor' | 'ask'
  requestId: string
  status: string
  page?: string
  /** Demande du client (colonne « Request » de B5), tronquée à 120 caractères. */
  request?: string
  user: { id: string; name: string; role: AdminRole }
  createdAt: string
} & Usage
