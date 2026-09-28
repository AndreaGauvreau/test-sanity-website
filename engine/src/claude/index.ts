/**
 * API publique du pilotage de Claude (engine-claude). Les autres modules du moteur n'importent QUE d'ici.
 * Le cycle d'une demande (job : 2 essais, contrôles, retour arrière, commit) appartient à engine-core, qui câble ces
 * briques ; Ask AI (vague 2) utilise `complete`.
 */

// Accès et réglages
export {
  accessKind,
  credentialEnv,
  readAgentSettings,
  resolveClaudeAccess,
  type AccessEnv,
  type AccessOptions,
  type AccessResult,
  type AgentSettings,
  type ClaudeCredential,
  type MachineLogin,
  type SettingsEnv,
} from './access'

// Agent SDK : lancement de Claude sur une demande
export {
  agentEnv,
  buildAgentOptions,
  CLIENT_APP,
  createAgentClock,
  createAgentRunner,
  createKuartzServer,
  describeTool,
  fatalApiError,
  MIN_RESUME_MS,
  MODEL_UNAVAILABLE,
  RESULT_ERRORS,
  type AgentEvent,
  type AgentResult,
  type AgentRun,
  type QueryFn,
  type RunAgent,
} from './agent'

// Outils MCP (définition fixe) et hook
export {
  ASK_CLIENT_DESCRIPTION,
  kuartzTools,
  MEASURE_DESCRIPTION,
  QUESTIONS_SCHEMA,
  SET_TEXT_DESCRIPTION,
  SET_TEXT_SCHEMA,
  type KuartzTools,
  type MeasureTool,
  type ToolHandlers,
} from './tools'
export { createGuardHook, scopeOf, toolAccessFor, type AccessRequest, type HookEvent, type ToolAccess } from './hook'
export { ALLOWED_TOOLS, ASK_TOOL, BUILTIN_TOOLS, MCP_SERVER_NAME, MCP_TOOLS, MEASURE_TOOL, SITE_DIRS, TEXT_TOOL } from './names'

// Prompts
export {
  buildPrompt,
  buildRetryPrompt,
  DATA,
  MEASURED_TEXTS,
  sharedDisplays,
  SYSTEM_SENTENCES,
  systemAppend,
  type PromptContext,
  type PromptDesignSystem,
  type PromptRequest,
  type PromptTexts,
} from './prompt'
export { quoteData } from './quote'
export { cssCustomValues, resolveCssValue } from './palette'

// Filtre UNIQUE des adresses dans tout texte montré au client (SEC-08) : questions, message final, journal, Ask AI.
export { containsAddress, LINK_REMOVED, sanitizeClientText, stripInvisible } from './sanitize'

// Questions au client (ask_client)
export {
  acceptsLongerText,
  answerSummary,
  createAskTool,
  CSS_POLICY,
  describeAnswers,
  effectProblem,
  hardcodedOf,
  OTHER_MAX,
  parseAnswers,
  prepareQuestions,
  questionProblems,
  type AskedQuestions,
  type AskResult,
  type AskTool,
  type AskToolOptions,
  type Effect,
  type Hardcoded,
  type HardcodedPolicy,
  type QuestionDraft,
  type ResolvedAnswer,
} from './questions'

// Textes Sanity (set_text)
export {
  accentsOf,
  clientMessage,
  createTextTool,
  editableFields,
  plainText,
  resolveTextFields,
  validateText,
  type ResolveOptions,
  type TextElement,
  type TextField,
  type TextRules,
  type TextTarget,
  type TextTool,
  type TextToolOptions,
  type TextToolState,
  type TextWrite,
} from './text'

// Coût
export {
  addCall,
  addTokens,
  EMPTY_COST,
  estimateCost,
  meterUsage,
  NO_TOKENS,
  tokensOf,
  totalCost,
  totalTokens,
  toUsage,
  usageFromTokens,
  type CostState,
  type MeteredCall,
  type Tokens,
  type UsageLike,
} from './cost'
export { PRICES_PER_MTOK, priceOf, type Price } from './pricing'

// Passerelle Ask AI
export {
  complete,
  CompleteError,
  completeOptions,
  createComplete,
  effortFor,
  messagesBody,
  STOP_MAX_TOKENS,
  STOP_REFUSAL,
  transcriptPrompt,
  type CompleteDeps,
  type CompleteInput,
  type CompleteMessage,
  type CompleteResult,
  type MessagesClient,
} from './complete'

// Faux Claude (tests)
export { applyEdit, createFakeAgent, fakeScenarios, type FakeAgent, type FakeCall, type FakeScript, type FakeStep } from './fake'
