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
 * - `X-Kz-User: base64url(JSON.stringify(EngineUser))` + `X-Kz-User-Sig: hex(HMAC-SHA256(ENGINE_SECRET, X-Kz-User))` :
 *   le moteur refuse toute requête dont l'identité n'est pas signée (le rôle décide des droits, voir roles.ts) ;
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
  costUsd: number
  /**
   * billed : coût rapporté par l'API ; estimated : calculé d'après les jetons vus (appel interrompu) ;
   * Avec l'abonnement (développement), le coût reste calculé mais n'est pas facturé : voir `access`.
   */
  costKind: 'billed' | 'estimated'
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
}

// ─── Éditeur IA (D1-D3, G1, G2) ──────────────────────────────────────────────

export type Scope = 'style' | 'text'
/** Desktop / Tablet / Mobile de la barre d'outils. */
export type Viewport = 1280 | 768 | 375

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
  /** Nouvelle valeur, ou « Body and excerpt edited ». */
  summary: string
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
 * pour chaque demande IA terminée. Lu par B5 et par le pied de Ask AI.
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
