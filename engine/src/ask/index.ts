/**
 * Ask AI (G4) dans le moteur : `POST /ask`, en lecture seule. API publique du module (propriétaire : ask-ai).
 * Câblage : `MODULES` de main.ts ← `askModule()` (voir CLAUDE.md).
 */
export { askModule, createAskReader, loadAdminConfig, registerAskRoutes, type AskModuleOptions } from './routes'
export { ASK_MESSAGES, createAskService, type AskComplete, type AskService, type AskServiceDeps } from './service'
export { buildSiteData, buildSiteQuery, renderSiteData, type AskReader, type AskSiteData } from './context'
export { ASK_MAX_TOKENS, ASK_SYSTEM, buildAskMessages } from './prompt'
export { finalizeAnswer, REFUSAL_TEXT } from './answer'
export { parseAskRequest, HISTORY_MAX, QUESTION_MAX } from './request'
export { askUsageDoc, sanityAskUsageRecorder, type AskUsageEntry, type AskUsageRecorder } from './usage'
